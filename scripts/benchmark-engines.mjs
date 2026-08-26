#!/usr/bin/env node
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join, parse } from 'node:path';
import { performance } from 'node:perf_hooks';
import ort from 'onnxruntime-node';
import sharp from 'sharp';

/**
 * Engine benchmark.
 *
 *   node scripts/benchmark-engines.mjs <engine>
 *
 * where <engine> is one of: imgly | isnet | birefnet | u2net
 *
 * One engine per process, deliberately. Peak RSS is the number that decides
 * how many of these fit on a server, and it is only trustworthy if nothing
 * else has been loaded into the same heap first. Running four engines in one
 * process would report the high-water mark of whichever ran last.
 *
 * `imgly` is measured differently from the rest: it goes over HTTP to the
 * frozen Version A server on port 3100, because that is the real product path
 * and the honest thing to compare against. Its memory is measured separately
 * (see docs) since the work happens in another process.
 *
 * Results land in debug/benchmark/<case>/ so every case can be eyeballed:
 *
 *   original.jpg        what went in
 *   mask-<engine>.png   the alpha the engine produced, as greyscale
 *   cutout-<engine>.png the transparent PNG
 *   magenta-<engine>.jpg flattened onto magenta — exposes semi-transparent
 *                        subjects, which a checkerboard hides
 */

const INPUT_DIR = 'debug/input';
const OUT_DIR = 'debug/benchmark';
const MODEL_DIR = 'debug/models';
const IMGLY_URL = 'http://localhost:3100/api/remove-background';

/**
 * Per-model preprocessing, transcribed from each model's own reference
 * implementation. Getting any of these wrong produces a plausible-looking but
 * quietly degraded mask, so each one records where it came from.
 */
const ENGINES = {
  isnet: {
    file: 'isnet-general-use.onnx',
    size: 1024,
    // rembg BaseSession: mean 0.5, std 1.0 for isnet-general-use.
    mean: [0.5, 0.5, 0.5],
    std: [1.0, 1.0, 1.0],
    // rembg divides by the image's own maximum rather than by 255.
    scaleByMax: true,
    output: 0,
    // Outputs are unbounded; rembg min-max normalises before use.
    normalise: 'minmax',
  },
  u2net: {
    file: 'u2net.onnx',
    size: 320,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    scaleByMax: true,
    output: 0,
    normalise: 'minmax',
  },
  // Our own re-exports. Same weights, exported per resolution with
  // deform_conv2d expressed via grid_sample so ONNX Runtime can run it.
  // These already apply the sigmoid, so no normalisation is needed.
  'birefnet-512': { file: 'birefnet-lite-512.onnx', size: 512, mean: [0.485,0.456,0.406], std: [0.229,0.224,0.225], scaleByMax: false, output: 0, normalise: 'sigmoid-if-needed' },
  'birefnet-640': { file: 'birefnet-lite-640.onnx', size: 640, mean: [0.485,0.456,0.406], std: [0.229,0.224,0.225], scaleByMax: false, output: 0, normalise: 'sigmoid-if-needed' },
  'birefnet-768': { file: 'birefnet-lite-768.onnx', size: 768, mean: [0.485,0.456,0.406], std: [0.229,0.224,0.225], scaleByMax: false, output: 0, normalise: 'sigmoid-if-needed' },
  'birefnet-1024': { file: 'birefnet-lite-1024.onnx', size: 1024, mean: [0.485,0.456,0.406], std: [0.229,0.224,0.225], scaleByMax: false, output: 0, normalise: 'sigmoid-if-needed' },

  birefnet: {
    file: 'birefnet-lite.onnx',
    size: 1024,
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    scaleByMax: false,
    output: 0,
    // This export already applies the sigmoid; values arrive in [0,1].
    normalise: 'sigmoid-if-needed',
  },
};

const mb = (bytes) => Number((bytes / 1048576).toFixed(0));

/* ------------------------------------------------------------ preprocess -- */

async function buildTensor(buffer, config) {
  const { data } = await sharp(buffer)
    .rotate() // honour EXIF orientation before anything measures geometry
    .resize(config.size, config.size, { fit: 'fill' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = config.size * config.size;
  if (data.length !== pixels * 3) {
    throw new Error(`preprocess: expected ${pixels * 3} bytes, got ${data.length}`);
  }

  let scale = 255;
  if (config.scaleByMax) {
    let max = 0;
    for (const v of data) if (v > max) max = v;
    scale = max || 255;
  }

  const chw = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i += 1) {
    for (let c = 0; c < 3; c += 1) {
      chw[c * pixels + i] = (data[i * 3 + c] / scale - config.mean[c]) / config.std[c];
    }
  }
  return new ort.Tensor('float32', chw, [1, 3, config.size, config.size]);
}

/* ----------------------------------------------------------- mask decode -- */

/**
 * Turn a raw model output into an 8-bit single-channel mask.
 *
 * Explicit about every assumption: which output tensor, what its dimensions
 * are, and how its value range maps to alpha. Silent guesses here are exactly
 * how the previous stride bug survived as long as it did.
 */
function decodeMask(tensor, config) {
  const dims = tensor.dims;
  // Expected [1, 1, H, W]; some exports emit [1, C, H, W] with C > 1.
  const height = dims[dims.length - 2];
  const width = dims[dims.length - 1];
  const plane = width * height;
  const raw = tensor.data;

  if (raw.length % plane !== 0) {
    throw new Error(`mask decode: ${raw.length} values is not a multiple of ${plane}`);
  }

  // Always take the first channel plane, never a strided read.
  const values = raw.subarray(0, plane);

  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const mask = Buffer.allocUnsafe(plane);
  if (config.normalise === 'minmax') {
    const range = max - min || 1;
    for (let i = 0; i < plane; i += 1) {
      mask[i] = Math.round(((values[i] - min) / range) * 255);
    }
  } else {
    const needsSigmoid = min < -0.01 || max > 1.01;
    for (let i = 0; i < plane; i += 1) {
      const v = needsSigmoid ? 1 / (1 + Math.exp(-values[i])) : values[i];
      mask[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
  }

  if (mask.length !== plane) {
    throw new Error(`mask decode: produced ${mask.length} bytes, expected ${plane}`);
  }
  return { mask, width, height, rawRange: [min, max] };
}

/**
 * Scale a single-channel mask to the target geometry.
 *
 * `toColourspace('b-w')` and the explicit length check are the lesson from the
 * stride bug: sharp will happily hand back three bytes per pixel from a
 * one-channel input, and a `length < expected` guard does not catch it because
 * the buffer comes back *larger*.
 */
async function resizeMask(mask, from, to) {
  const { data, info } = await sharp(mask, {
    raw: { width: from.width, height: from.height, channels: 1 },
  })
    .resize(to.width, to.height, { fit: 'fill', kernel: 'mitchell' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const expected = to.width * to.height;
  if (info.channels !== 1 || data.length !== expected) {
    throw new Error(
      `resizeMask: got ${data.length} bytes across ${info.channels} channels, expected ${expected} across 1`,
    );
  }
  return data;
}

/** Interleave the mask into the untouched original as its alpha channel. */
async function composite(originalBuffer, alpha, width, height) {
  const { data: rgb, info } = await sharp(originalBuffer)
    .rotate()
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = width * height;
  if (info.width !== width || info.height !== height) {
    throw new Error(`composite: source is ${info.width}x${info.height}, mask is ${width}x${height}`);
  }
  if (rgb.length !== pixels * 3) {
    throw new Error(`composite: expected ${pixels * 3} RGB bytes, got ${rgb.length}`);
  }
  if (alpha.length !== pixels) {
    throw new Error(`composite: expected ${pixels} alpha bytes, got ${alpha.length}`);
  }

  const rgba = Buffer.allocUnsafe(pixels * 4);
  for (let i = 0; i < pixels; i += 1) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  return rgba;
}

/* --------------------------------------------------------------- metrics -- */

function measure(alpha, width, height) {
  let clear = 0;
  let opaque = 0;
  let soft = 0;
  const bx = Math.round(width * 0.06);
  const by = Math.round(height * 0.06);
  let borderOpaque = 0;
  let borderCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const a = alpha[y * width + x];
      if (a < 10) clear += 1;
      else if (a > 245) opaque += 1;
      if (a > 32 && a < 224) soft += 1;
      if (x < bx || x >= width - bx || y < by || y >= height - by) {
        borderCount += 1;
        if (a > 245) borderOpaque += 1;
      }
    }
  }

  // Subject integrity: of the pixels well inside the foreground, how many came
  // back fully opaque. This is the number that catches a see-through subject.
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
    transparentPct: +((clear / total) * 100).toFixed(2),
    opaquePct: +((opaque / total) * 100).toFixed(2),
    softAlphaPct: +((soft / total) * 100).toFixed(2),
    subjectIntegrityPct: coreCount ? +((coreOpaque / coreCount) * 100).toFixed(1) : null,
    borderOpaquePct: borderCount ? +((borderOpaque / borderCount) * 100).toFixed(2) : null,
  };
}

/* ----------------------------------------------------------------- write -- */

async function writeOutputs(caseDir, engine, original, rgba, alpha, width, height) {
  const raw = { raw: { width, height, channels: 4 } };
  await sharp(rgba, raw).png().toFile(join(caseDir, `cutout-${engine}.png`));
  await sharp(rgba, raw)
    .flatten({ background: '#ff00ff' })
    .jpeg({ quality: 86 })
    .toFile(join(caseDir, `magenta-${engine}.jpg`));
  await sharp(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toFile(join(caseDir, `mask-${engine}.png`));

  const originalPath = join(caseDir, 'original.jpg');
  try {
    statSync(originalPath);
  } catch {
    await sharp(original).rotate().jpeg({ quality: 86 }).toFile(originalPath);
  }
}

/* ------------------------------------------------------------------- run -- */

async function runOnnx(engine, files) {
  const config = ENGINES[engine];
  const modelPath = join(MODEL_DIR, config.file);
  const modelMb = +(statSync(modelPath).size / 1048576).toFixed(1);

  const baseline = process.memoryUsage().rss;
  const loadStart = performance.now();
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    graphOptimizationLevel: 'all',
    // See scripts/probe-models.mjs — the default arena costs gigabytes and
    // never returns them.
    enableCpuMemArena: false,
    intraOpNumThreads: 2,
  });
  const loadMs = +(performance.now() - loadStart).toFixed(0);
  const afterLoad = process.memoryUsage().rss;
  let peak = afterLoad;

  const rows = [];
  for (const file of files) {
    const name = parse(file).name;
    const caseDir = join(OUT_DIR, name);
    await mkdir(caseDir, { recursive: true });

    const original = await readFile(join(INPUT_DIR, file));
    const meta = await sharp(original).rotate().metadata();

    const requestStart = performance.now();
    const tensor = await buildTensor(original, config);

    const inferStart = performance.now();
    const result = await session.run({ [session.inputNames[0]]: tensor });
    const inferenceMs = +(performance.now() - inferStart).toFixed(0);

    const outputName = session.outputNames[config.output];
    const decoded = decodeMask(result[outputName], config);
    const alpha = await resizeMask(decoded.mask, decoded, meta);
    const rgba = await composite(original, alpha, meta.width, meta.height);
    const totalMs = +(performance.now() - requestStart).toFixed(0);

    peak = Math.max(peak, process.memoryUsage().rss);
    await writeOutputs(caseDir, engine, original, rgba, alpha, meta.width, meta.height);

    rows.push({
      case: name,
      engine,
      inferenceMs,
      totalMs,
      inputResolution: `${config.size}x${config.size}`,
      outputResolution: `${meta.width}x${meta.height}`,
      fullResolutionPreserved: true,
      ...measure(alpha, meta.width, meta.height),
    });
    console.log(
      `  ${name.padEnd(22)} ${String(inferenceMs).padStart(6)} ms infer  ` +
        `${String(totalMs).padStart(6)} ms total  ` +
        `integrity ${String(rows.at(-1).subjectIntegrityPct).padStart(5)}%  ` +
        `soft ${String(rows.at(-1).softAlphaPct).padStart(5)}%`,
    );
  }

  await session.release();
  return { engine, modelMb, loadMs, weightsMb: mb(afterLoad - baseline), peakRssMb: mb(peak), rows };
}

async function runImgly(files) {
  const rows = [];
  for (const file of files) {
    const name = parse(file).name;
    const caseDir = join(OUT_DIR, name);
    await mkdir(caseDir, { recursive: true });

    const original = await readFile(join(INPUT_DIR, file));
    const meta = await sharp(original).rotate().metadata();

    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(original)]), file);

    const start = performance.now();
    const response = await fetch(IMGLY_URL, { method: 'POST', body: form });
    const totalMs = +(performance.now() - start).toFixed(0);
    if (!response.ok) {
      console.log(`  ${name.padEnd(22)} FAILED ${response.status}`);
      rows.push({ case: name, engine: 'imgly', failed: `HTTP ${response.status}` });
      continue;
    }

    const out = Buffer.from(await response.arrayBuffer());
    const outMeta = await sharp(out).metadata();
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    const pixels = info.width * info.height;
    const alpha = Buffer.allocUnsafe(pixels);
    for (let i = 0; i < pixels; i += 1) alpha[i] = data[i * info.channels + 3];

    await writeOutputs(caseDir, 'imgly', original, data, alpha, info.width, info.height);

    rows.push({
      case: name,
      engine: 'imgly',
      inferenceMs: null, // not separable over HTTP
      totalMs,
      inputResolution: '1024x1024',
      outputResolution: `${outMeta.width}x${outMeta.height}`,
      fullResolutionPreserved: outMeta.width === meta.width && outMeta.height === meta.height,
      ...measure(alpha, info.width, info.height),
    });
    console.log(
      `  ${name.padEnd(22)} ${String(totalMs).padStart(6)} ms total  ` +
        `integrity ${String(rows.at(-1).subjectIntegrityPct).padStart(5)}%  ` +
        `soft ${String(rows.at(-1).softAlphaPct).padStart(5)}%  ` +
        `${rows.at(-1).fullResolutionPreserved ? 'full-res OK' : 'RESOLUTION CHANGED'}`,
    );
  }
  return { engine: 'imgly', modelMb: 84.1, loadMs: null, weightsMb: null, peakRssMb: null, rows };
}

async function main() {
  const engine = process.argv[2];
  if (!engine || (engine !== 'imgly' && !ENGINES[engine])) {
    console.error(`usage: node scripts/benchmark-engines.mjs <imgly|${Object.keys(ENGINES).join('|')}>`);
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const files = (await readdir(INPUT_DIR))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .sort();

  console.log(`\n=== ${engine} === ${files.length} images\n`);
  const started = Date.now();
  const summary = engine === 'imgly' ? await runImgly(files) : await runOnnx(engine, files);
  summary.wallClockSeconds = +((Date.now() - started) / 1000).toFixed(1);

  await writeFile(
    join(OUT_DIR, `results-${engine}.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );

  const ok = summary.rows.filter((r) => !r.failed);
  const times = ok.map((r) => r.totalMs).sort((a, b) => a - b);
  console.log(
    `\n  median total ${times[Math.floor(times.length / 2)]} ms` +
      (summary.peakRssMb ? `   peak RSS ${summary.peakRssMb} MB` : '') +
      `   wall clock ${summary.wallClockSeconds}s`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
