#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Contact sheets across the BiRefNet resolution ladder.
 *
 *   node scripts/resolution-sheets.mjs
 *
 * Answers "what do we lose going 1024 -> 768 -> 640 -> 512" by putting the four
 * side by side against the original. The percentages cannot answer it: the
 * sideboard scores `null` integrity at 512 because the mask is empty, and an
 * empty mask has no interior to measure.
 *
 * Writes debug/benchmark/_res-<case>.jpg
 */

const OUT = 'debug/benchmark';
const LADDER = ['birefnet-512', 'birefnet-640', 'birefnet-768', 'birefnet-1024'];
const CAPTIONS = ['original', '512', '640', '768', '1024'];
const HEIGHT = 420;

async function sheet(caseName) {
  const dir = join(OUT, caseName);
  const paths = [join(dir, 'original.jpg')];
  for (const engine of LADDER) {
    const p = join(dir, `magenta-${engine}.jpg`);
    if (!existsSync(p)) return false;
    paths.push(p);
  }
  if (!existsSync(paths[0])) return false;

  const panels = [];
  for (const p of paths) {
    const buf = await sharp(p).resize(null, HEIGHT, { fit: 'contain', background: '#fff' }).toBuffer();
    panels.push({ buf, width: (await sharp(buf).metadata()).width });
  }

  const gap = 8;
  const band = 24;
  const width = panels.reduce((s, p) => s + p.width, 0) + gap * (panels.length + 1);
  const height = HEIGHT + band + gap * 2;

  const composites = [];
  const labels = [];
  let x = gap;
  for (let i = 0; i < panels.length; i += 1) {
    composites.push({ input: panels[i].buf, left: x, top: gap + band });
    labels.push(
      `<text x="${x + panels[i].width / 2}" y="${gap + 16}" font-family="sans-serif" font-size="13" ` +
        `font-weight="600" fill="#153566" text-anchor="middle">${CAPTIONS[i]}</text>`,
    );
    x += panels[i].width + gap;
  }

  await sharp({ create: { width, height, channels: 3, background: '#ffffff' } })
    .composite([
      ...composites,
      { input: Buffer.from(`<svg width="${width}" height="${height}">${labels.join('')}</svg>`), left: 0, top: 0 },
    ])
    .jpeg({ quality: 82 })
    .toFile(join(OUT, `_res-${caseName}.jpg`));
  return true;
}

const cases = (await readdir(OUT, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

let built = 0;
for (const c of cases) if (await sheet(c)) built += 1;
console.log(`${built} resolution sheets written to ${OUT}/_res-<case>.jpg`);
