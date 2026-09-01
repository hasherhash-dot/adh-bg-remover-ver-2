#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Builds the close-crop imagery for the homepage's edge-quality and
 * full-resolution sections.
 *
 *   node scripts/build-showcase-crops.mjs      (dev server must be running)
 *
 * Additive to build-showcase-assets.mjs: that script produces the full-frame
 * before/after pairs, this one produces crops taken at NATIVE resolution.
 *
 * Native matters here. The edge section's whole claim is that alpha is soft on
 * fine boundaries, and the resolution section's claim is that a 24 MP upload
 * comes back as 24 MP. Both collapse the moment an image is downscaled for the
 * web: a resampled edge looks soft whether the model was good or not. So every
 * output below is `extract` with no `resize` — what you see is the pixels the
 * engine actually produced.
 *
 * Crop boxes were chosen by eye against each source. They are the hard parts of
 * each photograph, not the flattering parts:
 *
 *   fur     tiger whiskers and ear tufts against dark foliage
 *   fringe  a frayed scarf edge against a soft gradient sky, the case where a
 *           hard cut is most obvious
 *   zoom    the rice/sesame boundary of a 6000x4000 photograph, at 1:1
 *
 * SOURCE LICENSING: as with build-showcase-assets.mjs, debug/input/ holds
 * development samples. They must be replaced with photography ADH owns or has
 * licensed before this page goes live. portrait-cap.webp is deliberately not
 * used anywhere -- it carries visible "Unsplash+" watermarks, which would be a
 * poor look on a page selling watermark-free output.
 */

const API = process.env.SHOWCASE_API ?? 'http://localhost:3000/api/remove-background';
const OUT = 'public/showcase';

const CROPS = [
  {
    key: 'fur',
    file: 'debug/input/animal.jpg',
    box: { left: 180, top: 150, width: 430, height: 320 },
    note: 'Whiskers and ear fur against dark foliage',
  },
  {
    key: 'fringe',
    file: 'debug/input/portrait-1.jpg',
    box: { left: 200, top: 680, width: 630, height: 380 },
    note: 'Frayed scarf threads against an open sky',
  },
  {
    key: 'zoom',
    file: 'debug/input/food.jpg',
    box: { left: 2000, top: 2400, width: 1020, height: 750 },
    note: '1:1 detail from a 6000x4000 original',
  },
];

/** Runs a photograph through the live endpoint -- the same path a visitor uses. */
async function cutout(file) {
  const buffer = await readFile(file);
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)]), file.split('/').pop());

  const response = await fetch(API, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`${file}: API returned ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const manifest = [];

  for (const crop of CROPS) {
    process.stdout.write(`  ${crop.key} … `);

    const source = await sharp(crop.file).metadata();
    const removed = await cutout(crop.file);

    // The cutout comes back at the source's dimensions, so one box indexes
    // both images. Assert it rather than trusting it: a mismatch here would
    // silently crop two different regions and the comparison would be a lie.
    const output = await sharp(removed).metadata();
    if (output.width !== source.width || output.height !== source.height) {
      throw new Error(
        `${crop.key}: engine returned ${output.width}x${output.height} for a ` +
          `${source.width}x${source.height} source -- crop boxes would not align`,
      );
    }

    await sharp(crop.file)
      .extract(crop.box)
      .webp({ quality: 90 })
      .toFile(join(OUT, `${crop.key}-before.webp`));

    await sharp(removed)
      .extract(crop.box)
      .webp({ quality: 92, alphaQuality: 100 })
      .toFile(join(OUT, `${crop.key}-after.webp`));

    manifest.push({
      key: crop.key,
      source: crop.file,
      sourceWidth: source.width,
      sourceHeight: source.height,
      crop: crop.box,
      note: crop.note,
    });

    console.log(
      `${crop.box.width}x${crop.box.height} native, from ${source.width}x${source.height}`,
    );
  }

  await writeFile(
    join(OUT, 'crops.json'),
    `${JSON.stringify({ generated: new Date().toISOString(), crops: manifest }, null, 2)}\n`,
    'utf8',
  );

  console.log(`\nWrote ${manifest.length * 2} crops to ${OUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
