import 'server-only';
import { join } from 'node:path';
import { statSync } from 'node:fs';
import sharp from 'sharp';
import { AppError } from '@/lib/errors';
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProvider,
  ImageInput,
  SegmentationResult,
} from '../types';

/**
 * The ADH background-removal engine.
 *
 * Runs BiRefNet-lite directly through ONNX Runtime with our own preprocessing,
 * mask decoding and buffer handling. No third-party removal SDK, no outbound
 * network call, no per-image fee.
 *
 * This provider returns a MASK, never a finished image. Compositing onto the
 * untouched full-resolution original is the service's job, which is what keeps
 * output resolution independent of the 640x640 the model runs at. A 6000x4000
 * upload still returns 6000x4000.
 *
 * ## Why 640
 *
 * Measured across a 20-image set at 512/640/768/1024. 640 was the only
 * resolution with no major failure, and it sits between two opposing failure
 * modes: below it the model loses low-contrast furniture entirely (the green
 * sideboard came back as an empty mask at 512), above it the model resolves
 * reflections well enough to classify mirror glass as background and cuts it
 * out. See docs/MODEL-LICENSING.md for provenance and debug/benchmark for the
 * contact sheets.
 *
 * Known limitation at 640, deliberately not tuned away: decorative objects
 * resting on furniture (pampas grass, a leaning picture frame) are sometimes
 * dropped. Thresholding it away would trade a visible defect for a subtler one.
 *
 * ## What the model expects
 *
 *   input   `input_image`  float32 [1, 3, 640, 640], RGB planar (CHW)
 *           pixel / 255, then ImageNet normalisation:
 *           mean [0.485, 0.456, 0.406], std [0.229, 0.224, 0.225]
 *   output  `output_image` float32 [1, 1, 640, 640] already through a sigmoid,
 *           so values arrive in [0, 1] and need no further normalisation
 *
 * The sigmoid is baked into the export on purpose (see
 * scripts/export-birefnet.py) so this side has nothing to infer. The range is
 * still checked at runtime rather than assumed — a future re-export that
 * forgets the wrapper would otherwise produce a silently wrong mask.
 */

/** Model geometry. Changing this requires a matching re-export, not a resize. */
const INPUT_SIZE = 640;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

const DEFAULT_MODEL = join(process.cwd(), 'models', 'birefnet-lite-640.onnx');

export interface AdhOnnxProviderOptions {
  /** Absolute path to the .onnx file. Its .onnx.data must sit beside it. */
  modelPath?: string;
  /**
   * Intra-op thread count. 8 gave the best measured latency on a 12-core CPU
   * (2.8s vs 5.5s at 2 threads); the curve is nearly flat past 8 because the
   * model is memory-bandwidth bound rather than compute bound.
   */
  threads?: number;
}

/**
 * ONNX Runtime types, kept structural.
 *
 * onnxruntime-node is loaded lazily so that importing this module — which the
 * registry does at startup regardless of which provider is selected — never
 * pulls a 180MB native session into a process that will not use it.
 */
interface OrtTensor {
  readonly data: Float32Array;
  readonly dims: readonly number[];
}
interface OrtSession {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release(): Promise<void>;
}
interface OrtModule {
  InferenceSession: {
    create(path: string, options: Record<string, unknown>): Promise<OrtSession>;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
}

export class AdhOnnxProvider implements BackgroundRemovalProvider {
  readonly id = 'adh-onnx';
  readonly name = 'ADH Background Removal Engine (BiRefNet-lite 640)';
  readonly isLocal = true;

  private readonly modelPath: string;
  private readonly threads: number;

  /**
   * The session is created once and reused for the life of the process.
   * Creation costs ~1.5s and ~310MB; doing it per request would dominate the
   * request and thrash memory. The promise itself is cached so that concurrent
   * first requests share one initialisation rather than racing to build two.
   */
  private session: Promise<OrtSession> | null = null;

  constructor(options: AdhOnnxProviderOptions = {}) {
    this.modelPath = options.modelPath ?? DEFAULT_MODEL;
    this.threads = options.threads ?? 8;
  }

  private async load(): Promise<OrtSession> {
    if (this.session) return this.session;

    this.session = (async () => {
      try {
        statSync(this.modelPath);
      } catch {
        throw new AppError('PROVIDER_MISCONFIGURED', {
          detail:
            `ADH model not found at ${this.modelPath}. Build it with ` +
            `"py scripts/export-birefnet.py 640" and copy birefnet-lite-640.onnx ` +
            `plus its .onnx.data into models/.`,
        });
      }

      const ort = (await import('onnxruntime-node')) as unknown as OrtModule;
      try {
        return await ort.InferenceSession.create(this.modelPath, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
          // The default CPU arena reserves a pool sized for the largest
          // intermediate tensor and never returns it — measured at ~5.7GB of
          // resident memory on this graph. Disabling it costs a little
          // allocator churn and holds steady around 400MB instead.
          enableCpuMemArena: false,
          intraOpNumThreads: this.threads,
        });
      } catch (error) {
        // Do not leave a rejected promise cached; a later request should be
        // able to retry rather than inherit this failure forever.
        this.session = null;
        throw new AppError('PROVIDER_MISCONFIGURED', {
          detail: `failed to create ONNX session: ${(error as Error).message}`,
        });
      }
    })();

    return this.session;
  }

  async segment(
    input: ImageInput,
    options: BackgroundRemovalOptions = {},
  ): Promise<SegmentationResult> {
    options.signal?.throwIfAborted();
    const session = await this.load();
    options.signal?.throwIfAborted();

    options.onProgress?.(0.1, 'preprocessing');
    const tensor = await this.buildTensor(input.data);

    options.signal?.throwIfAborted();
    options.onProgress?.(0.3, 'inference');

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    if (!inputName || !outputName) {
      throw new AppError('PROCESSING_FAILED', {
        detail: 'ONNX session exposes no input or output tensor',
      });
    }

    let output: OrtTensor | undefined;
    try {
      const result = await session.run({ [inputName]: tensor });
      output = result[outputName];
    } catch (error) {
      throw new AppError('PROCESSING_FAILED', {
        detail: `inference failed: ${(error as Error).message}`,
      });
    }
    if (!output) {
      throw new AppError('PROCESSING_FAILED', {
        detail: `model produced no tensor named "${outputName}"`,
      });
    }

    options.onProgress?.(0.9, 'decoding mask');
    const mask = decodeMask(output);

    return { mask };
  }

  /**
   * Decode -> RGB planar float32.
   *
   * `.rotate()` first so EXIF orientation is applied before anything measures
   * geometry; `.removeAlpha()` because the model takes three channels and a PNG
   * source decodes to four; `.toColourspace('srgb')` so the channel order and
   * count are stated rather than inherited from the source's profile.
   *
   * The exact byte count is asserted before the loop. Every buffer bug this
   * codebase has had was a stride assumption that produced a plausible-looking
   * buffer of the wrong shape.
   */
  private async buildTensor(image: Buffer): Promise<OrtTensor> {
    const { data, info } = await sharp(image)
      .rotate()
      .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = INPUT_SIZE * INPUT_SIZE;
    if (info.channels !== 3 || data.length !== pixels * 3) {
      throw new AppError('PROCESSING_FAILED', {
        detail:
          `preprocess: got ${data.length} bytes across ${info.channels} channels, ` +
          `expected ${pixels * 3} across 3`,
      });
    }

    // Interleaved RGB in, planar CHW out. Written as an explicit index rather
    // than a reshape so the channel order is visible at the point of use.
    const chw = new Float32Array(3 * pixels);
    for (let i = 0; i < pixels; i += 1) {
      const base = i * 3;
      chw[i] = ((data[base] as number) / 255 - MEAN[0]) / STD[0];
      chw[pixels + i] = ((data[base + 1] as number) / 255 - MEAN[1]) / STD[1];
      chw[pixels * 2 + i] = ((data[base + 2] as number) / 255 - MEAN[2]) / STD[2];
    }

    const ort = (await import('onnxruntime-node')) as unknown as OrtModule;
    return new ort.Tensor('float32', chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      const session = await this.load();
      return {
        ok: true,
        detail: `birefnet-lite-${INPUT_SIZE}, ${session.inputNames[0]} -> ${session.outputNames[0]}, ${this.threads} threads`,
      };
    } catch (error) {
      return { ok: false, detail: (error as Error).message };
    }
  }

  async dispose(): Promise<void> {
    const pending = this.session;
    this.session = null;
    if (!pending) return;
    try {
      const session = await pending;
      await session.release();
    } catch {
      // A session that never opened has nothing to release.
    }
  }
}

/**
 * Turn the model's output tensor into an 8-bit single-channel mask.
 *
 * Exported for the tests, which check the interpretation directly rather than
 * only through a full inference run.
 *
 * Every assumption is stated and checked: which plane is read, what its
 * dimensions are, and whether the values are already probabilities. The
 * previous engine's worst bug was a silent disagreement about bytes per pixel,
 * so nothing here is inferred from buffer length alone.
 */
export function decodeMask(output: {
  readonly data: Float32Array;
  readonly dims: readonly number[];
}): { data: Buffer; width: number; height: number } {
  const { dims } = output;
  if (dims.length < 2) {
    throw new AppError('PROCESSING_FAILED', {
      detail: `mask decode: output has ${dims.length} dimensions, expected at least 2`,
    });
  }

  const height = dims[dims.length - 2] as number;
  const width = dims[dims.length - 1] as number;
  const plane = width * height;

  if (!Number.isInteger(plane) || plane <= 0) {
    throw new AppError('PROCESSING_FAILED', {
      detail: `mask decode: implausible output geometry ${dims.join('x')}`,
    });
  }
  if (output.data.length % plane !== 0) {
    throw new AppError('PROCESSING_FAILED', {
      detail: `mask decode: ${output.data.length} values is not a whole multiple of ${plane}`,
    });
  }

  // Always the first plane, read contiguously. Never a strided read across
  // channels — that is the shape of the bug that sheared masks before.
  const values = output.data.subarray(0, plane);

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < plane; i += 1) {
    const v = values[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  // The export applies the sigmoid, so values should already be probabilities.
  // Checked rather than trusted: a re-export without the wrapper would emit
  // logits, and squashing those to 0..255 would produce a mask that looks
  // roughly right and is quietly wrong.
  const needsSigmoid = min < -0.01 || max > 1.01;

  const mask = Buffer.allocUnsafe(plane);
  for (let i = 0; i < plane; i += 1) {
    const raw = values[i] as number;
    const probability = needsSigmoid ? 1 / (1 + Math.exp(-raw)) : raw;
    // Rounded, not thresholded. Soft alpha is the point — hair, fur and motion
    // blur live in the middle of this range and clamping them to 0/255 is what
    // makes a cutout look stamped out.
    const scaled = Math.round(probability * 255);
    mask[i] = scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
  }

  if (mask.length !== plane) {
    throw new AppError('PROCESSING_FAILED', {
      detail: `mask decode: produced ${mask.length} bytes, expected ${plane}`,
    });
  }

  return { data: mask, width, height };
}

/** Exposed for tests so the preprocessing contract can be asserted directly. */
export const ADH_MODEL_CONFIG = {
  inputSize: INPUT_SIZE,
  mean: MEAN,
  std: STD,
  defaultModelPath: DEFAULT_MODEL,
} as const;
