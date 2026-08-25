import 'server-only';
import { AppError } from '@/lib/errors';
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProvider,
  ImageInput,
  SegmentationResult,
} from '../types';
import { extractAlpha } from '@/lib/image/pipeline';

/**
 * On-device segmentation using @imgly/background-removal-node (ONNX Runtime).
 *
 * No network calls, no API key and no per-image cost — the model weights ship
 * inside the npm package. This is the default provider.
 *
 * The ONNX session is expensive to create (hundreds of ms plus model load), so
 * the module is imported once and memoised for the lifetime of the process.
 * Inference itself is CPU-bound and synchronous inside the native addon, so
 * calls are serialised through a mutex: running several at once on the same
 * session degrades total throughput and multiplies peak memory.
 */

type RemoveBackgroundFn = (
  image: Blob,
  config?: {
    model?: 'small' | 'medium' | 'large';
    output?: { format?: 'image/png'; quality?: number };
    progress?: (key: string, current: number, total: number) => void;
    debug?: boolean;
  },
) => Promise<Blob>;

let enginePromise: Promise<RemoveBackgroundFn> | null = null;

async function loadEngine(): Promise<RemoveBackgroundFn> {
  if (!enginePromise) {
    enginePromise = import('@imgly/background-removal-node')
      .then((mod) => mod.removeBackground as unknown as RemoveBackgroundFn)
      .catch((error) => {
        enginePromise = null;
        throw new AppError('PROVIDER_UNAVAILABLE', {
          cause: error,
          detail: 'failed to load @imgly/background-removal-node',
        });
      });
  }
  return enginePromise;
}

/** Serialises inference so concurrent requests queue instead of thrashing. */
let inferenceChain: Promise<unknown> = Promise.resolve();

function runExclusive<T>(task: () => Promise<T>): Promise<T> {
  const result = inferenceChain.then(task, task);
  // Keep the chain alive even if a task rejects.
  inferenceChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export interface LocalOnnxProviderOptions {
  model?: 'small' | 'medium' | 'large';
  debug?: boolean;
}

export class LocalOnnxProvider implements BackgroundRemovalProvider {
  readonly id = 'local-onnx';
  readonly name = 'Local ONNX (IMG.LY / ISNet)';
  readonly isLocal = true;

  private readonly model: 'small' | 'medium' | 'large';
  private readonly debug: boolean;

  constructor(options: LocalOnnxProviderOptions = {}) {
    this.model = options.model ?? 'medium';
    this.debug = options.debug ?? false;
  }

  async segment(
    input: ImageInput,
    options: BackgroundRemovalOptions = {},
  ): Promise<SegmentationResult> {
    const removeBackground = await loadEngine();

    return runExclusive(async () => {
      options.signal?.throwIfAborted();

      let cutout: Buffer;
      try {
        const blob = new Blob([new Uint8Array(input.data)], { type: input.mimeType });
        const result = await removeBackground(blob, {
          model: this.model,
          output: { format: 'image/png' },
          debug: this.debug,
          progress: options.onProgress
            ? (key, current, total) => {
                const ratio = total > 0 ? current / total : 0;
                options.onProgress?.(ratio, key);
              }
            : undefined,
        });
        cutout = Buffer.from(await result.arrayBuffer());
      } catch (error) {
        throw new AppError('PROCESSING_FAILED', {
          cause: error,
          detail: `local inference failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // The engine returns the source image with the predicted alpha applied.
      // We only want the mask: the service composites it onto the untouched
      // full-resolution original so no detail is lost to the model's downscale.
      const mask = await extractAlpha(cutout);
      return { mask, png: cutout };
    });
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await loadEngine();
      return { ok: true, detail: `model=${this.model}` };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : 'unavailable' };
    }
  }
}
