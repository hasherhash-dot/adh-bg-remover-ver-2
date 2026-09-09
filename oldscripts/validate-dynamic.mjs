#!/usr/bin/env node
import { performance } from 'node:perf_hooks';
import ort from 'onnxruntime-node';
import sharp from 'sharp';

/**
 * Prove — or disprove — that the dynamic BiRefNet export actually works.
 *
 *   node scripts/validate-dynamic.mjs
 *
 * A model that loads and returns a tensor of the right shape has proved
 * nothing. A graph with a stale spatial constant will happily return a
 * correctly-shaped mask full of garbage, or one that is subtly sheared — which
 * is precisely the failure that cost us a week the first time round.
 *
 * So each resolution is checked three ways:
 *
 *   1. Output geometry matches the input geometry.
 *   2. The mask is not degenerate — it has both foreground and background, and
 *      is not uniform.
 *   3. Upscaled to a common size, it agrees with the fixed-1024 model's mask.
 *      IoU is the real test: a sheared or scrambled mask can still have a
 *      plausible histogram, but it cannot overlap the reference.
 */

const FIXED = 'debug/models/birefnet-lite.onnx';
const DYNAMIC = 'debug/models/birefnet-lite-dynamic.onnx';
const IMAGE = 'debug/input/portrait-1.jpg';
const SIZES = [512, 640, 768, 1024];
const REF = 1024;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

async function tensorFor(size) {
  const { data } = await sharp(IMAGE)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = size * size;
  const chw = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      chw[c * pixels + i] = (data[i * 3 + c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return new ort.Tensor('float32', chw, [1, 3, size, size]);
}

function toMask(tensor) {
  const dims = tensor.dims;
  const height = dims[dims.length - 2];
  const width = dims[dims.length - 1];
  const values = tensor.data;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const needsSigmoid = min < -0.01 || max > 1.01;
  const mask = Buffer.allocUnsafe(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    const v = needsSigmoid ? 1 / (1 + Math.exp(-values[i])) : values[i];
    mask[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return { mask, width, height, min, max };
}

/** Binary IoU at alpha 128, after putting both masks on the same grid. */
async function iou(a, b, size) {
  const norm = async (m) =>
    sharp(m.mask, { raw: { width: m.width, height: m.height, channels: 1 } })
      .resize(size, size, { fit: 'fill', kernel: 'mitchell' })
      .toColourspace('b-w')
      .raw()
      .toBuffer();
  const [x, y] = [await norm(a), await norm(b)];
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < x.length; i += 1) {
    const fa = x[i] > 128;
    const fb = y[i] > 128;
    if (fa && fb) intersection += 1;
    if (fa || fb) union += 1;
  }
  return union ? intersection / union : 0;
}

async function main() {
  console.log('Reference: fixed-shape export at 1024\n');
  const fixedSession = await ort.InferenceSession.create(FIXED, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: false,
    intraOpNumThreads: 4,
  });
  const reference = toMask(
    (await fixedSession.run({ [fixedSession.inputNames[0]]: await tensorFor(REF) }))[
      fixedSession.outputNames[0]
    ],
  );
  await fixedSession.release();
  console.log(`  reference mask ${reference.width}x${reference.height}\n`);

  console.log('Dynamic export:\n');
  const session = await ort.InferenceSession.create(DYNAMIC, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: false,
    intraOpNumThreads: 4,
  });

  console.log(
    'size'.padEnd(7) +
      'status'.padEnd(10) +
      'out geom'.padEnd(13) +
      'median'.padStart(9) +
      'fg%'.padStart(8) +
      'IoU vs 1024'.padStart(13),
  );
  console.log('-'.repeat(60));

  for (const size of SIZES) {
    const tensor = await tensorFor(size);
    let out;
    try {
      await session.run({ [session.inputNames[0]]: tensor }); // warm
      const runs = [];
      for (let i = 0; i < 3; i += 1) {
        const start = performance.now();
        out = await session.run({ [session.inputNames[0]]: tensor });
        runs.push(performance.now() - start);
      }
      runs.sort((a, b) => a - b);

      const decoded = toMask(out[session.outputNames[0]]);
      const geometryOk = decoded.width === size && decoded.height === size;

      let fg = 0;
      for (const v of decoded.mask) if (v > 128) fg += 1;
      const fgPct = (fg / decoded.mask.length) * 100;
      const degenerate = fgPct < 0.5 || fgPct > 99.5;

      const overlap = await iou(decoded, reference, 512);
      const status = !geometryOk ? 'GEOMETRY' : degenerate ? 'DEGENERATE' : overlap < 0.9 ? 'DIVERGED' : 'ok';

      console.log(
        String(size).padEnd(7) +
          status.padEnd(10) +
          `${decoded.width}x${decoded.height}`.padEnd(13) +
          `${runs[1].toFixed(0)} ms`.padStart(9) +
          `${fgPct.toFixed(1)}%`.padStart(8) +
          `${overlap.toFixed(4)}`.padStart(13),
      );

      // Keep the mask so it can be looked at, not just scored.
      await sharp(decoded.mask, {
        raw: { width: decoded.width, height: decoded.height, channels: 1 },
      })
        .png()
        .toFile(`debug/models/validate-dynamic-${size}.png`);
    } catch (error) {
      console.log(String(size).padEnd(7) + `FAILED  ${error.message.slice(0, 70)}`);
    }
  }

  await session.release();
  console.log(
    '\n  IoU is against the fixed 1024 export, so 1024 should be ~1.0000.',
  );
  console.log('  Anything below that is genuine resolution loss, not a bug.');
  console.log('  Masks written to debug/models/validate-dynamic-<size>.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
