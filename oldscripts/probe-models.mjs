#!/usr/bin/env node
import { readdirSync, statSync } from 'node:fs';
import ort from 'onnxruntime-node';
import sharp from 'sharp';

/**
 * Candidate model probe.
 *
 *   node scripts/probe-models.mjs
 *
 * Answers the three questions that decide whether a model is worth a full
 * benchmark at all: what input geometry does it accept, how long does one
 * inference take, and how much resident memory does it cost.
 *
 * Every session is created with `enableCpuMemArena: false`. ONNX Runtime's
 * default CPU arena pre-reserves a pool sized for the largest intermediate
 * tensor and does not give it back; on BiRefNet that alone accounted for
 * ~5.7 GB of RSS. Turning it off costs a little allocator churn and returns
 * the memory, which is the right trade for a request-driven server.
 */

const DIR = 'debug/models';
const IMAGE = 'debug/input/portrait-1.jpg';

/** Sizes to try. If a model rejects one, its export has a fixed input. */
const SIZES = [320, 512, 768, 1024];

const NORMALISERS = {
  // BiRefNet follows the ImageNet convention.
  imagenet: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
  // U^2-Net and IS-Net divide by the image maximum, then apply these.
  u2net: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] },
};

const mb = (bytes) => (bytes / 1048576).toFixed(0);

async function tensorFor(size, kind) {
  const { data } = await sharp(IMAGE)
    .resize(size, size, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { mean, std } = NORMALISERS[kind];
  const pixels = size * size;
  const chw = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      chw[c * pixels + i] = (data[i * 3 + c] / 255 - mean[c]) / std[c];
    }
  }
  return new ort.Tensor('float32', chw, [1, 3, size, size]);
}

async function probe(file) {
  const path = `${DIR}/${file}`;
  const sizeMb = (statSync(path).size / 1048576).toFixed(1);
  const kind = /birefnet/i.test(file) ? 'imagenet' : 'u2net';

  const baseline = process.memoryUsage().rss;
  const loadStart = performance.now();
  let session;
  try {
    session = await ort.InferenceSession.create(path, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      enableCpuMemArena: false,
      intraOpNumThreads: 2,
    });
  } catch (error) {
    console.log(`${file.padEnd(24)} ${sizeMb.padStart(7)} MB   LOAD FAILED: ${error.message.slice(0, 60)}`);
    return;
  }
  const loadMs = performance.now() - loadStart;
  const afterLoad = process.memoryUsage().rss;

  console.log(`\n${file}  (${sizeMb} MB on disk)`);
  console.log(`  load ${loadMs.toFixed(0)} ms   weights in memory +${mb(afterLoad - baseline)} MB`);
  console.log(`  inputs ${session.inputNames.join(', ')}   outputs ${session.outputNames.length}`);

  const accepted = [];
  for (const size of SIZES) {
    const tensor = await tensorFor(size, kind);
    try {
      // Warm-up first: the initial run pays for lazy kernel setup and would
      // otherwise be reported as this size's cost.
      await session.run({ [session.inputNames[0]]: tensor });
      const runs = [];
      for (let i = 0; i < 3; i += 1) {
        const start = performance.now();
        await session.run({ [session.inputNames[0]]: tensor });
        runs.push(performance.now() - start);
      }
      runs.sort((a, b) => a - b);
      const peak = process.memoryUsage().rss;
      accepted.push(size);
      console.log(
        `    ${String(size).padStart(4)}px  median ${runs[1].toFixed(0).padStart(6)} ms   peak RSS ${mb(peak).padStart(5)} MB`,
      );
    } catch (error) {
      const why = /invalid dimensions|Got: /i.test(error.message) ? 'fixed input' : error.message.slice(0, 40);
      console.log(`    ${String(size).padStart(4)}px  rejected (${why})`);
    }
  }

  console.log(
    `  => ${accepted.length > 1 ? `DYNAMIC, accepts ${accepted.join('/')}` : `FIXED at ${accepted[0] ?? '?'}px`}`,
  );
  await session.release();
}

const files = readdirSync(DIR).filter((f) => f.endsWith('.onnx')).sort();
console.log(`ONNX Runtime ${ort.env.versions.common}  |  arena OFF, 2 intra-op threads\n`);
for (const file of files) await probe(file);
