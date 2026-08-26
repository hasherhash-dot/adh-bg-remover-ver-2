#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';

/**
 * Side-by-side A/B of the two engines through the real application.
 *
 *   node scripts/ab-compare.mjs                      all of debug/input
 *   node scripts/ab-compare.mjs debug/input/afro-wall.webp
 *
 * Both engines are driven over HTTP against running servers, so what is
 * measured is the complete request — validation, decode, inference, full
 * resolution composite, encode — not raw model time. That is the number that
 * matters for a web product.
 *
 * Expects two servers:
 *
 *   IMGLY_URL  default http://localhost:3100   BACKGROUND_REMOVAL_PROVIDER=local
 *   ADH_URL    default http://localhost:3000   BACKGROUND_REMOVAL_PROVIDER=adh-onnx
 *
 * Every output is labelled with the engine that produced it. Neither side falls
 * back to the other: if one server is misconfigured its column fails loudly,
 * because a silent substitution would attribute one engine's work to the other.
 *
 * Writes debug/ab/<case>/
 *   original.jpg
 *   imgly-result.png   adh-result.png
 *   imgly-mask.png     adh-mask.png
 *   compare.jpg        original | imgly | adh, flattened onto magenta
 */

const IMGLY_URL = process.env.IMGLY_URL ?? 'http://localhost:3100';
const ADH_URL = process.env.ADH_URL ?? 'http://localhost:3000';
const OUT_DIR = 'debug/ab';
const INPUT_DIR = 'debug/input';

/** Magenta shows a semi-transparent subject; a checkerboard hides it. */
const FLATTEN = '#ff00ff';

async function run(baseUrl, label, file, buffer) {
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)]), basename(file));

  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/remove-background`, {
    method: 'POST',
    body: form,
  });
  const requestMs = Math.round(performance.now() - started);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { label, failed: `HTTP ${response.status} ${detail.slice(0, 160)}` };
  }

  const png = Buffer.from(await response.arrayBuffer());
  // The API reports which provider ran. Recorded so a result can never be
  // misattributed if the servers were started with the wrong env.
  const providerId = response.headers.get('X-Provider') ?? undefined;
  const meta = await sharp(png).metadata();

  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const alpha = Buffer.allocUnsafe(pixels);
  let clear = 0;
  let opaque = 0;
  let soft = 0;
  for (let i = 0; i < pixels; i += 1) {
    const a = data[i * info.channels + 3];
    alpha[i] = a;
    if (a < 10) clear += 1;
    else if (a > 245) opaque += 1;
    if (a > 32 && a < 224) soft += 1;
  }

  return {
    label,
    providerId,
    requestMs,
    png,
    alpha,
    width: meta.width,
    height: meta.height,
    transparentPct: +((clear / pixels) * 100).toFixed(2),
    opaquePct: +((opaque / pixels) * 100).toFixed(2),
    softAlphaPct: +((soft / pixels) * 100).toFixed(2),
  };
}

async function contactSheet(dir, originalPath, results) {
  const height = 460;
  const panels = [{ path: originalPath, caption: 'original' }];
  for (const r of results) {
    if (r.failed) continue;
    panels.push({ path: join(dir, `${r.label}-magenta.jpg`), caption: r.label });
  }
  if (panels.length < 2) return;

  const images = [];
  for (const p of panels) {
    const buf = await sharp(p.path).resize(null, height, { fit: 'contain', background: '#fff' }).toBuffer();
    images.push({ buf, width: (await sharp(buf).metadata()).width });
  }

  const gap = 8;
  const band = 26;
  const totalWidth = images.reduce((s, i) => s + i.width, 0) + gap * (images.length + 1);
  const totalHeight = height + band + gap * 2;

  const composites = [];
  const labels = [];
  let x = gap;
  for (let i = 0; i < images.length; i += 1) {
    composites.push({ input: images[i].buf, left: x, top: gap + band });
    labels.push(
      `<text x="${x + images[i].width / 2}" y="${gap + 17}" font-family="sans-serif" font-size="14" ` +
        `font-weight="600" fill="#153566" text-anchor="middle">${panels[i].caption}</text>`,
    );
    x += images[i].width + gap;
  }

  await sharp({ create: { width: totalWidth, height: totalHeight, channels: 3, background: '#ffffff' } })
    .composite([
      ...composites,
      { input: Buffer.from(`<svg width="${totalWidth}" height="${totalHeight}">${labels.join('')}</svg>`), left: 0, top: 0 },
    ])
    .jpeg({ quality: 84 })
    .toFile(join(dir, 'compare.jpg'));
}

async function compareOne(file) {
  const name = basename(file, extname(file));
  const dir = join(OUT_DIR, name);
  await mkdir(dir, { recursive: true });

  const buffer = await readFile(file);
  const originalPath = join(dir, 'original.jpg');
  await sharp(buffer).rotate().jpeg({ quality: 88 }).toFile(originalPath);

  const results = [
    await run(IMGLY_URL, 'imgly', file, buffer),
    await run(ADH_URL, 'adh', file, buffer),
  ];

  for (const r of results) {
    if (r.failed) continue;
    await writeFile(join(dir, `${r.label}-result.png`), r.png);
    await sharp(r.alpha, { raw: { width: r.width, height: r.height, channels: 1 } })
      .png()
      .toFile(join(dir, `${r.label}-mask.png`));
    await sharp(r.png)
      .flatten({ background: FLATTEN })
      .jpeg({ quality: 86 })
      .toFile(join(dir, `${r.label}-magenta.jpg`));
  }

  await contactSheet(dir, originalPath, results);

  const source = await sharp(buffer).rotate().metadata();
  for (const r of results) {
    if (r.failed) {
      console.log(`  ${name.padEnd(22)} ${r.label.padEnd(6)} FAILED  ${r.failed}`);
      continue;
    }
    const fullRes = r.width === source.width && r.height === source.height;
    console.log(
      `  ${name.padEnd(22)} ${r.label.padEnd(6)} ${String(r.requestMs).padStart(6)}ms  ` +
        `${String(r.width) + 'x' + r.height}`.padEnd(12) +
        `${fullRes ? 'full-res' : 'RESIZED!'}  ` +
        `clear ${String(r.transparentPct).padStart(5)}%  soft ${String(r.softAlphaPct).padStart(5)}%  ` +
        `[${r.providerId ?? 'provider not reported'}]`,
    );
  }

  return { case: name, source: `${source.width}x${source.height}`, results: results.map(({ png, alpha, ...rest }) => rest) };
}

async function main() {
  const explicit = process.argv.slice(2);
  const files = explicit.length
    ? explicit
    : (await readdir(INPUT_DIR))
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map((f) => join(INPUT_DIR, f));

  await mkdir(OUT_DIR, { recursive: true });
  console.log(`\nimgly : ${IMGLY_URL}\nadh   : ${ADH_URL}\n${files.length} image(s)\n`);

  const all = [];
  for (const file of files) all.push(await compareOne(file));

  await writeFile(
    join(OUT_DIR, 'results.json'),
    `${JSON.stringify({ generated: new Date().toISOString(), imglyUrl: IMGLY_URL, adhUrl: ADH_URL, cases: all }, null, 2)}\n`,
    'utf8',
  );

  for (const label of ['imgly', 'adh']) {
    const times = all
      .flatMap((c) => c.results.filter((r) => r.label === label && !r.failed))
      .map((r) => r.requestMs)
      .sort((a, b) => a - b);
    if (times.length) {
      console.log(`\n  ${label}: median ${times[Math.floor(times.length / 2)]}ms over ${times.length} requests`);
    }
  }
  console.log(`\n  written to ${OUT_DIR}/<case>/  (compare.jpg per case)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
