#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, parse } from 'node:path';
import { performance } from 'node:perf_hooks';
import ort from 'onnxruntime-node';
import sharp from 'sharp';

/**
 * Segmentation model benchmark.
 *
 *   node scripts/benchmark-models.mjs
 *
 * Runs BiRefNet-lite over the same photographs the pipeline debug harness uses
 * and writes its masks next to the ISNet masks that harness already produced,
 * so the two can be compared on identical inputs.
 *
 * This is a measurement tool, not part of the product. It talks to ONNX Runtime
 * directly rather than going through BackgroundRemovalProvider, because the
 * point is to characterise the model before deciding whether it deserves a
 * provider at all.
 *
 * Metrics, and why each one is here:
 *
 *   coreOpaque%   Of the pixels well inside the subject, how many are fully
 *                 opaque. This is the "false background" number — a subject
 *                 that comes back at alpha 200 is a see-through cutout, which
 *                 is the defect that shows up when you drop it on a new
 *                 background.
 *   borderOpaque% Opaque pixels in the outer frame of the image. A proxy for
 *                 "false foreground" — background objects kept as subject —
 *                 though it reads high and legitimately so for a subject that
 *                 reaches the edge of the frame.
 *   decisive%     Pixels that are confidently one thing or the other. A model
 *                 that hedges everywhere produces a muddy matte.
 *   softEdge%     Pixels in the transition band. Some is good — that is hair.
 *                 A lot means the model is unsure about whole regions.
 */

const MODEL = 'debug/models/birefnet-lite.onnx';
const INPUT_DIR = 'debug/input';
const OUT_DIR = 'debug/benchmark';
const SIZE = 1024;

// BiRefNet's published preprocessing: ImageNet normalisation at 1024x1024.
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

function mb(bytes) {
  return (bytes / 1048576).toFixed(0);
}

async function toTensor(file) {
  const { data } = await sharp(file)
    .resize(SIZE, SIZE, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = SIZE * SIZE;
  const chw = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      chw[c * pixels + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return new ort.Tensor('float32', chw, [1, 3, SIZE, SIZE]);
}

/**
 * Some BiRefNet exports emit logits, some emit probabilities. Rather than
 * assume, look at the range: anything outside [0,1] needs a sigmoid.
 */
function toMask(output) {
  const raw = output.data;
  let min = Infinity;
  let max = -Infinity;
  for (const v of raw) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const needsSigmoid = min < -0.01 || max > 1.01;
  const mask = Buffer.allocUnsafe(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    const v = needsSigmoid ? 1 / (1 + Math.exp(-raw[i])) : raw[i];
    mask[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return { mask, needsSigmoid };
}

/** Shared with the ISNet side so both models are judged by the same ruler. */
function measure(alpha, width, height) {
  const bx = Math.round(width * 0.06);
  const by = Math.round(height * 0.06);
  let borderOpaque = 0;
  let borderCount = 0;
  let decisive = 0;
  let soft = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = alpha[y * width + x];
      if (a < 10 || a > 245) decisive += 1;
      if (a > 32 && a < 224) soft += 1;
      if (x < bx || x >= width - bx || y < by || y >= height - by) {
        borderCount += 1;
        if (a > 245) borderOpaque += 1;
      }
    }
  }

  // Interior of the subject: a pixel whose whole 5x5 neighbourhood is opaque
  // enough to be foreground. Sampled on a stride of 2 — this is a statistic,
  // not a rendering.
  let coreOpaque = 0;
  let coreCount = 0;
  for (let y = 2; y < height - 2; y += 2) {
    for (let x = 2; x < width - 2; x += 2) {
      let inside = true;
      for (let dy = -2; dy <= 2 && inside; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          if (alpha[(y + dy) * width + (x + dx)] <= 32) {
            inside = false;
            break;
          }
        }
      }
      if (!inside) continue;
      coreCount += 1;
      if (alpha[y * width + x] > 245) coreOpaque += 1;
    }
  }

  const total = width * height;
  return {
    coreOpaque: coreCount ? (coreOpaque / coreCount) * 100 : 0,
    borderOpaque: borderCount ? (borderOpaque / borderCount) * 100 : 0,
    decisive: (decisive / total) * 100,
    softEdge: (soft / total) * 100,
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const baseline = process.memoryUsage().rss;
  const loadStart = performance.now();
  const session = await ort.InferenceSession.create(MODEL, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
  });
  const loadMs = performance.now() - loadStart;
  const afterLoad = process.memoryUsage().rss;

  console.log(`BiRefNet-lite (fp32, 1024x1024)`);
  console.log(`  session load      ${loadMs.toFixed(0)} ms`);
  console.log(`  RSS after load    ${mb(afterLoad)} MB  (+${mb(afterLoad - baseline)} MB)\n`);

  const files = (await readdir(INPUT_DIR)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  const rows = [];
  let peak = afterLoad;

  for (const file of files) {
    const name = parse(file).name;
    const path = join(INPUT_DIR, file);
    const meta = await sharp(path).metadata();

    const tensor = await toTensor(path);
    const start = performance.now();
    const result = await session.run({ [session.inputNames[0]]: tensor });
    const inferMs = performance.now() - start;
    peak = Math.max(peak, process.memoryUsage().rss);

    const output = result[session.outputNames[0]];
    const { mask, needsSigmoid } = toMask(output);
    const [, , mh, mw] = output.dims;

    // Scale to the original geometry with the same kernel the product uses, so
    // the comparison is not flattered by a different resampler.
    const { data: alpha, info } = await sharp(mask, { raw: { width: mw, height: mh, channels: 1 } })
      .resize(meta.width, meta.height, { fit: 'fill', kernel: 'mitchell' })
      .toColourspace('b-w')
      .raw()
      .toBuffer({ resolveWithObject: true });

    const stats = measure(alpha, info.width, info.height);
    rows.push({ name, inferMs, sigmoid: needsSigmoid, ...stats });

    await sharp(alpha, { raw: { width: info.width, height: info.height, channels: 1 } })
      .png()
      .toFile(join(OUT_DIR, `${name}-birefnet-mask.png`));

    // The cutout itself, flattened onto magenta — the same view the ISNet
    // harness writes, so the two can be put side by side.
    const rgb = await sharp(path).removeAlpha().raw().toBuffer();
    const rgba = Buffer.allocUnsafe(info.width * info.height * 4);
    for (let i = 0; i < info.width * info.height; i += 1) {
      rgba[i * 4] = rgb[i * 3];
      rgba[i * 4 + 1] = rgb[i * 3 + 1];
      rgba[i * 4 + 2] = rgb[i * 3 + 2];
      rgba[i * 4 + 3] = alpha[i];
    }
    await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .flatten({ background: '#ff00ff' })
      .jpeg({ quality: 88 })
      .toFile(join(OUT_DIR, `${name}-birefnet-on-magenta.jpg`));
    await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png()
      .toFile(join(OUT_DIR, `${name}-birefnet-cutout.png`));

    console.log(
      `  ${name.padEnd(12)} ${meta.width}x${meta.height}`.padEnd(32) +
        `${inferMs.toFixed(0).padStart(6)} ms   ` +
        `core ${stats.coreOpaque.toFixed(1).padStart(5)}%  ` +
        `border ${stats.borderOpaque.toFixed(1).padStart(5)}%  ` +
        `soft ${stats.softEdge.toFixed(2).padStart(5)}%`,
    );
  }

  const times = rows.map((r) => r.inferMs).sort((a, b) => a - b);
  console.log(
    `\n  inference  median ${times[Math.floor(times.length / 2)].toFixed(0)} ms  ` +
      `min ${times[0].toFixed(0)} ms  max ${times[times.length - 1].toFixed(0)} ms`,
  );
  console.log(`  peak RSS   ${mb(peak)} MB`);
  console.log(`  sigmoid applied: ${rows[0].sigmoid}`);

  await writeFile(
    join(OUT_DIR, 'birefnet-results.json'),
    `${JSON.stringify({ model: MODEL, loadMs, peakRssMb: Number(mb(peak)), rows }, null, 2)}\n`,
    'utf8',
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
