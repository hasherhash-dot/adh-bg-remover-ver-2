import { describe, expect, it } from 'vitest';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';
import {
  compositeMask,
  extractAlpha,
  normalizeImage,
  prepareForInference,
  renderResult,
  resizeMask,
} from '@/lib/image/pipeline';
import { detectImageType } from '@/lib/image/detect';
import { LocalOnnxProvider } from '@/lib/bg-removal/providers/local-onnx';
import { readFile } from 'node:fs/promises';

/**
 * Pipeline debug harness.
 *
 *   npm run debug:pipeline
 *
 * Reads every image in `debug/input/`, runs the real pipeline stage by stage,
 * and writes each intermediate to `debug/output/<name>/` so the segmentation can
 * be inspected visually rather than inferred from numbers:
 *
 *   01-original.png          what the pipeline actually decoded
 *   02-inference-input.png   the downscaled RGBA handed to the model
 *   03-model-output.png      the model's own RGBA result
 *   04-mask-model.png        model alpha as greyscale — what the AI detected
 *   05-mask-resized.png      alpha after scaling to full resolution
 *   06-final.png             the finished transparent cutout
 *   07-final-on-magenta.jpg  flattened onto magenta to expose fringing
 *
 * Every stage reports its dimensions and its bytes-per-pixel, because the bug
 * class this harness exists to catch is a silent change in channel count.
 */

const INPUT_DIR = 'debug/input';
const OUTPUT_DIR = 'debug/output';
const INFERENCE_SIZE = 1024;
const MAX_MEGAPIXELS = 50;

interface AlphaStats {
  min: number;
  max: number;
  mean: number;
  transparentPct: number;
  opaquePct: number;
  softEdgePct: number;
}

function alphaStats(buffer: Buffer, stride = 1, offset = 0): AlphaStats {
  let min = 255;
  let max = 0;
  let sum = 0;
  let transparent = 0;
  let opaque = 0;
  let soft = 0;
  let count = 0;

  for (let i = offset; i < buffer.length; i += stride) {
    const v = buffer[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    if (v < 10) transparent += 1;
    else if (v > 245) opaque += 1;
    else soft += 1;
    count += 1;
  }

  return {
    min,
    max,
    mean: sum / count,
    transparentPct: (100 * transparent) / count,
    opaquePct: (100 * opaque) / count,
    softEdgePct: (100 * soft) / count,
  };
}

function formatStats(label: string, stats: AlphaStats): string {
  return [
    `    ${label}`,
    `      min=${stats.min} max=${stats.max} mean=${stats.mean.toFixed(1)}`,
    `      transparent(<10)=${stats.transparentPct.toFixed(1)}%`,
    `      opaque(>245)=${stats.opaquePct.toFixed(1)}%`,
    `      soft edge=${stats.softEdgePct.toFixed(2)}%`,
  ].join('\n');
}

/** Writes a single-channel raster as a viewable greyscale PNG. */
async function writeGreyscale(
  path: string,
  data: Buffer,
  width: number,
  height: number,
): Promise<void> {
  await sharp(data, { raw: { width, height, channels: 1 } }).png().toFile(path);
}

const REPORT_PATH = join(OUTPUT_DIR, 'report.txt');
let reportStarted = false;

/**
 * Appends to a durable report file. Vitest can swallow console output depending
 * on how it is invoked, and a file is easier to diff between runs anyway.
 */
async function appendReport(text: string): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const { appendFile, writeFile: overwrite } = await import('node:fs/promises');

  if (!reportStarted) {
    reportStarted = true;
    await overwrite(
      REPORT_PATH,
      `Pipeline debug report — ${new Date().toISOString()}\n`,
      'utf8',
    );
  }
  await appendFile(REPORT_PATH, `${text}\n`, 'utf8');
}

async function listInputs(): Promise<string[]> {
  try {
    const entries = await readdir(INPUT_DIR);
    return entries.filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  } catch {
    return [];
  }
}

describe('background removal pipeline — visual debug', async () => {
  const inputs = await listInputs();

  if (inputs.length === 0) {
    it('needs sample images', () => {
      console.warn(
        `No images found in ${INPUT_DIR}. Drop a few real photographs there and re-run.`,
      );
      expect(true).toBe(true);
    });
    return;
  }

  const provider = new LocalOnnxProvider({ model: 'medium' });

  it.each(inputs)('%s', async (filename) => {
    const name = parse(filename).name;
    const outDir = join(OUTPUT_DIR, name);
    await mkdir(outDir, { recursive: true });

    const source = await readFile(join(INPUT_DIR, filename));
    const mimeType = detectImageType(source);
    expect(mimeType, `${filename} is not a recognised image`).toBeTruthy();

    const lines: string[] = ['', `  === ${filename} ===`];

    // 1. Decode ------------------------------------------------------------
    const original = await normalizeImage(source, mimeType!, MAX_MEGAPIXELS);
    await writeFile(join(outDir, '01-original.png'), original.buffer);
    lines.push(
      `    1. original          ${original.width}x${original.height}  (${(source.length / 1024).toFixed(0)} KB ${mimeType})`,
    );

    // 2. Downscale for inference ------------------------------------------
    const inference = await prepareForInference(original, INFERENCE_SIZE);
    await writeFile(join(outDir, '02-inference-input.png'), inference.buffer);
    const inferenceMeta = await sharp(inference.buffer).metadata();
    lines.push(
      `    2. inference input   ${inference.dimensions.width}x${inference.dimensions.height}  channels=${inferenceMeta.channels}`,
    );
    expect(inferenceMeta.channels, 'model input must be RGBA').toBe(4);

    // 3. Model -------------------------------------------------------------
    const startedAt = Date.now();
    const segmentation = await provider.segment({
      data: inference.buffer,
      mimeType: 'image/png',
      filename,
    });
    const inferenceMs = Date.now() - startedAt;

    expect(segmentation.png ?? segmentation.mask, 'provider returned nothing').toBeTruthy();
    if (segmentation.png) {
      await writeFile(join(outDir, '03-model-output.png'), segmentation.png);
      const modelMeta = await sharp(segmentation.png).metadata();
      lines.push(
        `    3. model output      ${modelMeta.width}x${modelMeta.height}  channels=${modelMeta.channels}  hasAlpha=${modelMeta.hasAlpha}  (${inferenceMs}ms)`,
      );
      expect(modelMeta.hasAlpha, 'model output must carry alpha').toBe(true);
    }

    // 4. Alpha extraction --------------------------------------------------
    const mask = segmentation.mask ?? (await extractAlpha(segmentation.png as Buffer));
    const maskPixels = mask.width * mask.height;
    const maskBytesPerPixel = mask.data.length / maskPixels;

    await writeGreyscale(join(outDir, '04-mask-model.png'), mask.data, mask.width, mask.height);
    lines.push(
      `    4. extracted mask    ${mask.width}x${mask.height}  bytes/px=${maskBytesPerPixel}`,
    );
    lines.push(formatStats('model mask:', alphaStats(mask.data)));

    // A mask must be exactly one byte per pixel. Anything else shears the
    // composite — this is the assertion that would have caught the original bug.
    expect(maskBytesPerPixel, 'extracted mask must be single-channel').toBe(1);

    // 5. Mask scaled to full resolution ------------------------------------
    const resized = await resizeMask(mask, original.width, original.height);
    const resizedBytesPerPixel = resized.length / (original.width * original.height);

    await writeGreyscale(
      join(outDir, '05-mask-resized.png'),
      resized,
      original.width,
      original.height,
    );
    lines.push(
      `    5. resized mask      ${original.width}x${original.height}  bytes/px=${resizedBytesPerPixel}`,
    );
    lines.push(formatStats('resized mask:', alphaStats(resized)));

    expect(resizedBytesPerPixel, 'resized mask must stay single-channel').toBe(1);

    // 6. Composite and encode ----------------------------------------------
    const composited = await compositeMask(original, mask);
    const rendered = await renderResult(
      composited.rgba,
      { width: composited.width, height: composited.height },
      { type: 'transparent' },
      'png',
    );
    await writeFile(join(outDir, '06-final.png'), rendered.data);

    const finalMeta = await sharp(rendered.data).metadata();
    const finalRaw = await sharp(rendered.data).raw().toBuffer();
    const finalStats = alphaStats(finalRaw, finalMeta.channels as number, 3);

    lines.push(
      `    6. final png         ${finalMeta.width}x${finalMeta.height}  channels=${finalMeta.channels}  hasAlpha=${finalMeta.hasAlpha}  (${(rendered.data.length / 1024).toFixed(0)} KB)`,
    );
    lines.push(formatStats('final alpha:', finalStats));

    // 7. Flatten onto magenta so fringing and holes are obvious ------------
    await sharp(rendered.data)
      .flatten({ background: '#ff00ff' })
      .resize(640, null, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toFile(join(outDir, '07-final-on-magenta.jpg'));

    const report = lines.join('\n');
    console.log(report);
    await appendReport(report);

    // --- invariants -------------------------------------------------------
    expect(finalMeta.width, 'output width must match input').toBe(original.width);
    expect(finalMeta.height, 'output height must match input').toBe(original.height);
    expect(finalMeta.channels, 'output must be RGBA').toBe(4);
    expect(finalMeta.hasAlpha).toBe(true);

    // The resized mask must agree with the model's mask. If the two disagree
    // materially, scaling corrupted it — which is precisely the failure this
    // harness was built to detect.
    const modelStats = alphaStats(mask.data);
    const resizedStats = alphaStats(resized);
    expect(
      Math.abs(modelStats.transparentPct - resizedStats.transparentPct),
      'scaling changed how much of the image is background',
    ).toBeLessThan(3);
    expect(
      Math.abs(modelStats.mean - resizedStats.mean),
      'scaling shifted the mask mean',
    ).toBeLessThan(6);
  });
});
