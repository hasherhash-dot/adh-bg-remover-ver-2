#!/usr/bin/env node
import { existsSync, statSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import ort from 'onnxruntime-node';
import sharp from 'sharp';

/**
 * Prove the re-exported BiRefNet models are correct, not merely well-shaped.
 *
 *   node scripts/validate-exports.mjs
 *
 * A model that loads and returns a tensor of the expected size has proved
 * nothing at all. The stride bug produced perfectly-shaped garbage for weeks.
 * So each export is checked four ways:
 *
 *   geometry     output dimensions equal input dimensions
 *   range        the mask is not uniform, and covers a plausible fraction
 *   agreement    IoU against the reference export we already benchmarked, on a
 *                common grid. A sheared or scrambled mask can pass a histogram
 *                check; it cannot overlap the reference
 *   parity       our own 1024 re-export must agree with the reference almost
 *                exactly. If it does not, the export pipeline is wrong and no
 *                other number here means anything
 *
 * The reference is debug/models/birefnet-lite.onnx — the onnx-community export
 * used for the 20-image benchmark.
 */

const REFERENCE = 'debug/models/birefnet-lite.onnx';
const IMAGE = 'debug/input/portrait-1.jpg';
const GRID = 512; // common grid for IoU

const CANDIDATES = [
  { label: 'reference 1024', path: REFERENCE, size: 1024 },
  { label: 'ours 512', path: 'debug/models/birefnet-lite-512.onnx', size: 512 },
  { label: 'ours 640', path: 'debug/models/birefnet-lite-640.onnx', size: 640 },
  { label: 'ours 768', path: 'debug/models/birefnet-lite-768.onnx', size: 768 },
  { label: 'ours 1024', path: 'debug/models/birefnet-lite-1024.onnx', size: 1024 },
  { label: 'dynamic @512', path: 'debug/models/birefnet-lite-dyn.onnx', size: 512 },
  { label: 'dynamic @640', path: 'debug/models/birefnet-lite-dyn.onnx', size: 640 },
  { label: 'dynamic @768', path: 'debug/models/birefnet-lite-dyn.onnx', size: 768 },
  { label: 'dynamic @1024', path: 'debug/models/birefnet-lite-dyn.onnx', size: 1024 },
];

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const mb = (b) => (b / 1048576).toFixed(0);

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

function decode(tensor) {
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
  return { mask, width, height, min, max, needsSigmoid };
}

async function onGrid(m) {
  return sharp(m.mask, { raw: { width: m.width, height: m.height, channels: 1 } })
    .resize(GRID, GRID, { fit: 'fill', kernel: 'mitchell' })
    .toColourspace('b-w')
    .raw()
    .toBuffer();
}

function iou(a, b) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i += 1) {
    const fa = a[i] > 128;
    const fb = b[i] > 128;
    if (fa && fb) inter += 1;
    if (fa || fb) union += 1;
  }
  return union ? inter / union : 0;
}

/** Mean absolute difference over the full alpha range, not just the binary cut. */
function mae(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

async function main() {
  console.log(`reference: ${REFERENCE}\nimage    : ${IMAGE}\n`);

  const refSession = await ort.InferenceSession.create(REFERENCE, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: false,
    intraOpNumThreads: 4,
  });
  const refOut = await refSession.run({ [refSession.inputNames[0]]: await tensorFor(1024) });
  const reference = decode(refOut[refSession.outputNames[0]]);
  const refGrid = await onGrid(reference);
  await refSession.release();

  console.log(
    'model'.padEnd(16) +
      'disk'.padStart(8) +
      'status'.padStart(12) +
      'geometry'.padStart(12) +
      'median'.padStart(9) +
      'RSS'.padStart(8) +
      'fg%'.padStart(7) +
      'IoU'.padStart(8) +
      'MAE'.padStart(7),
  );
  console.log('-'.repeat(87));

  for (const c of CANDIDATES) {
    if (!existsSync(c.path)) {
      console.log(c.label.padEnd(16) + '  MISSING');
      continue;
    }
    let diskMb = statSync(c.path).size;
    if (existsSync(`${c.path}.data`)) diskMb += statSync(`${c.path}.data`).size;

    let session;
    try {
      session = await ort.InferenceSession.create(c.path, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
        enableCpuMemArena: false,
        intraOpNumThreads: 4,
      });
    } catch (error) {
      console.log(c.label.padEnd(16) + `  LOAD FAILED: ${error.message.slice(0, 50)}`);
      continue;
    }

    try {
      const tensor = await tensorFor(c.size);
      await session.run({ [session.inputNames[0]]: tensor }); // warm
      const runs = [];
      let out;
      for (let i = 0; i < 3; i += 1) {
        const t = performance.now();
        out = await session.run({ [session.inputNames[0]]: tensor });
        runs.push(performance.now() - t);
      }
      runs.sort((a, b) => a - b);

      const got = decode(out[session.outputNames[0]]);
      const geometryOk = got.width === c.size && got.height === c.size;

      let fg = 0;
      for (const v of got.mask) if (v > 128) fg += 1;
      const fgPct = (fg / got.mask.length) * 100;

      const grid = await onGrid(got);
      const overlap = iou(grid, refGrid);
      const diff = mae(grid, refGrid);

      const degenerate = fgPct < 0.5 || fgPct > 99.5;
      const status = !geometryOk ? 'GEOMETRY' : degenerate ? 'DEGENERATE' : overlap < 0.85 ? 'DIVERGED' : 'ok';

      console.log(
        c.label.padEnd(16) +
          `${mb(diskMb)}MB`.padStart(8) +
          status.padStart(12) +
          `${got.width}x${got.height}`.padStart(12) +
          `${runs[1].toFixed(0)}ms`.padStart(9) +
          `${mb(process.memoryUsage().rss)}MB`.padStart(8) +
          `${fgPct.toFixed(1)}`.padStart(7) +
          `${overlap.toFixed(4)}`.padStart(8) +
          `${diff.toFixed(1)}`.padStart(7),
      );

      await sharp(got.mask, { raw: { width: got.width, height: got.height, channels: 1 } })
        .png()
        .toFile(`debug/models/check-${c.label.replace(/[^a-z0-9]+/gi, '-')}.png`);
    } catch (error) {
      console.log(c.label.padEnd(16) + `  RUN FAILED: ${error.message.slice(0, 60)}`);
    }
    await session.release();
  }

  console.log('\n  IoU / MAE are against the reference 1024 mask on a 512 grid.');
  console.log('  "ours 1024" is the parity check: it should be ~1.0000 / ~0.');
  console.log('  Lower IoU at 512/640/768 is real resolution loss, not a defect.');
  console.log('  Masks written to debug/models/check-*.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
