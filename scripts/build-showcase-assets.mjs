#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Builds every image the homepage uses.
 *
 *   node scripts/build-showcase-assets.mjs      (dev server must be running)
 *
 * This replaces the previous pair of scripts (assets + crops). They drifted:
 * one produced full frames, the other close crops, and between them the page
 * accumulated nine unrelated subjects that read as a pile of demo assets rather
 * than one art-directed set.
 *
 * The set is now organised by JOB, not by source photograph. Every entry below
 * names the section it serves, and each is a distinct framing — no two places
 * on the page show the same crop. Four subject families carry the whole page:
 *
 *   A  portrait-1        leather jacket, frayed scarf   hero, proof, fabric, CTA
 *   B  monochrome-dress  fashion ecommerce              swap, editor, steps
 *   C  blonde-salon      hair                           edge detail
 *   D  animal            fur                            edge detail
 *
 * plus a deliberately varied batch set, which is the one place where unrelated
 * subjects are the point: the feature being shown is "many different images at
 * once".
 *
 * TWO RULES THAT MUST NOT BE RELAXED
 *
 *   Every cut-out comes from the live endpoint, so the page cannot show a
 *   quality the product does not deliver. The provider is read back off the
 *   response and recorded in the manifest; a run against anything other than
 *   the ADH engine fails loudly rather than quietly shipping IMG.LY output.
 *
 *   Close crops are `extract`ed with NO resize. The edge section's claim is
 *   soft alpha on hard boundaries and the loupe's claim is that a 24 MP upload
 *   returns 24 MP. Both are destroyed by downsampling, which makes any edge
 *   look soft whether the model earned it or not.
 *
 * SOURCE LICENSING: debug/input/ holds development samples. They must be
 * replaced with photography ADH owns or has licensed before this page is
 * published. portrait-cap.webp is deliberately never used — it carries visible
 * "Unsplash+" watermarks, which would be a poor look on a page selling
 * watermark-free output.
 */

const API = process.env.SHOWCASE_API ?? 'http://localhost:3000/api/remove-background';
const OUT = 'public/showcase';
const EXPECTED_PROVIDER = process.env.SHOWCASE_PROVIDER ?? 'adh-onnx';

/**
 * `crop` is taken at native resolution. `width` resizes a full frame for the
 * web. An entry with both crops first, then resizes — used only where the crop
 * is for composition rather than for proving pixels.
 */
const ASSETS = [
  /* -- A: leather-jacket portrait ---------------------------------------- */
  {
    key: 'hero',
    src: 'portrait-1.jpg',
    crop: { left: 200, top: 400, width: 820, height: 620 },
    job: 'Hero — head, scarf and shoulders, wiping from original to cut-out',
  },
  {
    key: 'proof',
    src: 'portrait-1.jpg',
    width: 1200,
    job: 'Before/after slider — full frame, the interactive proof',
  },
  {
    key: 'edge-fabric',
    src: 'portrait-1.jpg',
    crop: { left: 330, top: 780, width: 660, height: 420 },
    job: 'Edge detail — the scarf fringe itself, no face; distinct from the hero crop',
  },
  {
    key: 'cta',
    src: 'portrait-1.jpg',
    crop: { left: 200, top: 330, width: 800, height: 1270 },
    job: 'Final CTA — tall slice, bleeding in from the right edge',
  },

  /* -- B: fashion ecommerce ---------------------------------------------- */
  {
    key: 'swap',
    src: 'monochrome-dress.webp',
    width: 600,
    job: 'Background replacement and editor — one subject, one workflow',
  },
  {
    key: 'step',
    src: 'monochrome-dress.webp',
    crop: { left: 60, top: 60, width: 480, height: 270 },
    job: 'How it works — wide crop for the three small step frames',
  },

  /* -- C and D: the two edge cases --------------------------------------- */
  {
    key: 'edge-hair',
    src: 'blonde-salon.webp',
    crop: { left: 820, top: 180, width: 620, height: 620 },
    job: 'Edge detail — the hair BOUNDARY and flyaway strands, not the face',
  },
  {
    key: 'edge-fur',
    src: 'animal.jpg',
    crop: { left: 190, top: 130, width: 420, height: 330 },
    job: 'Edge detail — pale whiskers and ear fur on dark foliage',
  },

  /* -- Full resolution ----------------------------------------------------

     Deliberately NOT cropped. The frames are labelled 6000 x 4000, so they
     have to be the whole photograph — a crop under that label would be a lie,
     and 6000x4000 is already 3:2, so the full frame fills a 3:2 box exactly.
     The loupe below carries the actual proof. */
  {
    key: 'res',
    src: 'food.jpg',
    width: 900,
    job: 'Full resolution — the complete 24 MP frame, in and out',
  },
  {
    key: 'res-zoom',
    src: 'food.jpg',
    crop: { left: 2000, top: 2400, width: 1020, height: 750 },
    job: 'Full resolution — 1:1 detail, the evidence the numbers mean something',
  },

  /* -- A backdrop, not a subject ------------------------------------------

     The 'Photo' option in the background swap. It is scenery placed behind a
     cut-out, so it is never run through the engine and has no -after pair.
     Its source is used nowhere else on the page. */
  { key: 'backdrop', src: 'furniture-vanity.png', width: 900, backdrop: true },

  /* -- Batch: five categories, deliberately unalike ----------------------- */
  { key: 'batch-portrait', src: 'afro-wall.webp', width: 420, job: 'Batch — portrait' },
  { key: 'batch-furniture', src: 'furniture-sideboard.webp', width: 420, job: 'Batch — furniture' },
  { key: 'batch-fashion', src: 'stripes-on-stripes.webp', width: 420, job: 'Batch — fashion' },
  { key: 'batch-object', src: 'object-holes.png', width: 420, job: 'Batch — object' },
  {
    key: 'batch-food',
    src: 'food.jpg',
    crop: { left: 2200, top: 1400, width: 1800, height: 1800 },
    resize: 420,
    job: 'Batch — food. Square crop, so it never repeats the full-resolution frame',
  },
];

const cache = new Map();

/** Runs a photograph through the live endpoint and verifies which engine ran. */
async function cutout(file) {
  if (cache.has(file)) return cache.get(file);

  const buffer = await readFile(join('debug/input', file));
  const form = new FormData();
  form.append('image', new Blob([new Uint8Array(buffer)]), file);

  const response = await fetch(API, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`${file}: API returned ${response.status}`);

  const provider = response.headers.get('X-Provider');
  if (provider !== EXPECTED_PROVIDER) {
    throw new Error(
      `${file}: served by "${provider}", expected "${EXPECTED_PROVIDER}". ` +
        'Refusing to write — every cut-out on the page must be ADH output.',
    );
  }

  const result = {
    data: Buffer.from(await response.arrayBuffer()),
    provider,
    sourceWidth: Number(response.headers.get('X-Source-Width')),
    outputWidth: Number(response.headers.get('X-Image-Width')),
    outputHeight: Number(response.headers.get('X-Image-Height')),
  };
  cache.set(file, result);
  return result;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const manifest = [];

  for (const asset of ASSETS) {
    process.stdout.write(`  ${asset.key.padEnd(16)} `);

    const sourcePath = join('debug/input', asset.src);
    const meta = await sharp(sourcePath).metadata();

    if (asset.backdrop) {
      const written = await sharp(sourcePath)
        .resize(asset.width, null, { withoutEnlargement: true })
        .webp({ quality: 84 })
        .toFile(join(OUT, `${asset.key}.webp`));
      manifest.push({ key: asset.key, job: asset.job, source: asset.src, backdrop: true });
      console.log(`${String(written.width).padStart(4)}x${String(written.height).padEnd(4)} backdrop (no cut-out)  <- ${asset.src}`);
      continue;
    }

    const removed = await cutout(asset.src);

    // A crop box indexes both images, so they must share dimensions. Assert it
    // rather than assume it: a mismatch would crop two different regions and
    // the "same detail, before and after" comparison would be false.
    if (removed.outputWidth !== meta.width || removed.outputHeight !== meta.height) {
      throw new Error(
        `${asset.key}: engine returned ${removed.outputWidth}x${removed.outputHeight} ` +
          `for a ${meta.width}x${meta.height} source — crops would not align`,
      );
    }

    const shape = (pipeline) => {
      let out = pipeline;
      if (asset.crop) out = out.extract(asset.crop);
      const target = asset.resize ?? (asset.crop ? null : asset.width);
      if (target) out = out.resize(target, null, { withoutEnlargement: true });
      return out;
    };

    await shape(sharp(sourcePath)).webp({ quality: 84 }).toFile(join(OUT, `${asset.key}-before.webp`));
    await shape(sharp(removed.data))
      .webp({ quality: 90, alphaQuality: 100 })
      .toFile(join(OUT, `${asset.key}-after.webp`));

    const written = await sharp(join(OUT, `${asset.key}-after.webp`)).metadata();
    manifest.push({
      key: asset.key,
      job: asset.job,
      source: asset.src,
      sourceSize: `${meta.width}x${meta.height}`,
      crop: asset.crop ?? null,
      native: Boolean(asset.crop) && !asset.resize,
      rendered: `${written.width}x${written.height}`,
      provider: removed.provider,
    });

    console.log(
      `${String(written.width).padStart(4)}x${String(written.height).padEnd(4)} ` +
        `${asset.crop ? (asset.resize ? 'crop+resize' : 'native crop') : 'full frame'}  ` +
        `<- ${asset.src} (${meta.width}x${meta.height})`,
    );
  }

  await writeFile(
    join(OUT, 'manifest.json'),
    `${JSON.stringify(
      { generated: new Date().toISOString(), provider: EXPECTED_PROVIDER, assets: manifest },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const sources = new Set(ASSETS.map((a) => a.src));
  console.log(
    `\nWrote ${manifest.length * 2} images from ${sources.size} photographs, ` +
      `all via ${EXPECTED_PROVIDER}.`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
