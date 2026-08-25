#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Builds the homepage showcase imagery.
 *
 *   node scripts/build-showcase-assets.mjs      (dev server must be running)
 *
 * Every asset here is produced by running a real photograph through the live
 * /api/remove-background endpoint — the same code path a visitor uses. Nothing
 * is mocked up in a design tool, so the page cannot show a quality the product
 * does not actually deliver.
 *
 * Outputs land in public/showcase/ as WebP: it carries an alpha channel like
 * PNG but at roughly half the bytes, which matters for images that sit above
 * the fold.
 *
 * NOTE ON LICENSING: the source photographs in debug/input/ were pulled from
 * public sample sets for development. Before this page is published they must
 * be replaced with photography ADH owns or has licensed. Re-run this script
 * after swapping the files in SOURCES.
 */

const API = process.env.SHOWCASE_API ?? 'http://localhost:3000/api/remove-background';
const OUT = 'public/showcase';

/** width the asset is displayed at, roughly doubled for retina */
const SOURCES = [
  { key: 'portrait', file: 'debug/input/portrait-1.jpg', width: 900 },
  { key: 'woman', file: 'debug/input/portrait-2.jpg', width: 640 },
  { key: 'animal', file: 'debug/input/animal.jpg', width: 640 },
  { key: 'car', file: 'debug/input/car.jpg', width: 520 },
  { key: 'girl', file: 'debug/input/girl.jpg', width: 520 },
  { key: 'food', file: 'debug/input/food.jpg', width: 520 },
];

async function cutout(file) {
  const buffer = await readFile(file);
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)]), file.split('/').pop());

  const response = await fetch(API, { method: 'POST', body: form });
  if (!response.ok) {
    throw new Error(`${file}: API returned ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = [];

  for (const source of SOURCES) {
    process.stdout.write(`  ${source.key} … `);
    const original = await readFile(source.file);
    const removed = await cutout(source.file);

    // Before: the untouched photograph, resized for the web.
    await sharp(original)
      .resize(source.width, null, { withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(join(OUT, `${source.key}-before.webp`));

    // After: the real cutout, alpha preserved.
    await sharp(removed)
      .resize(source.width, null, { withoutEnlargement: true })
      .webp({ quality: 88, alphaQuality: 100 })
      .toFile(join(OUT, `${source.key}-after.webp`));

    const meta = await sharp(removed).metadata();
    manifest.push({
      key: source.key,
      sourceWidth: meta.width,
      sourceHeight: meta.height,
      displayWidth: source.width,
    });
    console.log(`${meta.width}x${meta.height} original`);
  }

  // A 1:1 crop of the hair boundary. This is the detail claim — soft alpha on
  // fine strands — so it is shown at native resolution rather than scaled.
  process.stdout.write('  hair crop … ');
  const portraitCut = await cutout('debug/input/portrait-1.jpg');
  const cropBox = { left: 300, top: 300, width: 620, height: 420 };

  await sharp(portraitCut)
    .extract(cropBox)
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(join(OUT, 'hair-after.webp'));

  await sharp('debug/input/portrait-1.jpg')
    .extract(cropBox)
    .webp({ quality: 88 })
    .toFile(join(OUT, 'hair-before.webp'));
  console.log(`${cropBox.width}x${cropBox.height}`);

  await writeFile(
    join(OUT, 'manifest.json'),
    `${JSON.stringify({ generated: new Date().toISOString(), assets: manifest }, null, 2)}\n`,
    'utf8',
  );

  console.log(`\nWrote ${manifest.length * 2 + 2} images to ${OUT}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
