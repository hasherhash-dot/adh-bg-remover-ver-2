#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Aggregates the per-engine benchmark results into one table, and builds a
 * contact sheet per case so the engines can be compared by eye rather than
 * only by number.
 *
 *   node scripts/benchmark-report.mjs
 *
 * Run the four engine passes first.
 */

const OUT = 'debug/benchmark';
const ENGINES = ['imgly', 'isnet', 'u2net', 'birefnet'];
const LABELS = {
  imgly: 'IMG.LY (current)',
  isnet: 'isnet-general-use',
  u2net: 'u2net',
  birefnet: 'birefnet-lite',
};

/** A subject that comes back below this is visibly see-through. */
const INTEGRITY_FLOOR = 90;

const pad = (v, n) => String(v).padStart(n);

async function contactSheet(caseName) {
  const dir = join(OUT, caseName);
  const panels = [];
  const captions = ['original', ...ENGINES];

  for (const key of captions) {
    const file = key === 'original' ? 'original.jpg' : `magenta-${key}.jpg`;
    const path = join(dir, file);
    if (!existsSync(path)) return null;
    panels.push(path);
  }

  const H = 460;
  const resized = [];
  for (const path of panels) {
    const buf = await sharp(path)
      .resize(null, H, { fit: 'contain', background: '#ffffff' })
      .toBuffer();
    const meta = await sharp(buf).metadata();
    resized.push({ buf, width: meta.width });
  }

  const gap = 8;
  const labelBand = 26;
  const totalWidth = resized.reduce((sum, r) => sum + r.width, 0) + gap * (resized.length + 1);
  const totalHeight = H + labelBand + gap * 2;

  const composites = [];
  let x = gap;
  const labels = [];
  for (let i = 0; i < resized.length; i += 1) {
    composites.push({ input: resized[i].buf, left: x, top: gap + labelBand });
    labels.push(
      `<text x="${x + resized[i].width / 2}" y="${gap + 17}" font-family="sans-serif" ` +
        `font-size="14" font-weight="600" fill="#153566" text-anchor="middle">${captions[i]}</text>`,
    );
    x += resized[i].width + gap;
  }

  const svg = Buffer.from(
    `<svg width="${totalWidth}" height="${totalHeight}">${labels.join('')}</svg>`,
  );

  await sharp({
    create: {
      width: totalWidth,
      height: totalHeight,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([...composites, { input: svg, left: 0, top: 0 }])
    .jpeg({ quality: 82 })
    .toFile(join(OUT, `_compare-${caseName}.jpg`));

  return true;
}

async function main() {
  const results = {};
  for (const engine of ENGINES) {
    const path = join(OUT, `results-${engine}.json`);
    if (!existsSync(path)) {
      console.log(`missing ${path} — run: node scripts/benchmark-engines.mjs ${engine}`);
      continue;
    }
    results[engine] = JSON.parse(await readFile(path, 'utf8'));
  }

  const available = Object.keys(results);
  const cases = results[available[0]].rows.map((r) => r.case);

  /* ---- headline table ---- */
  console.log('\nENGINE SUMMARY\n');
  console.log(
    'engine'.padEnd(20) +
      pad('model', 8) +
      pad('median', 9) +
      pad('peak RSS', 10) +
      pad('integrity', 11) +
      pad('worst', 8) +
      pad('below 90%', 11),
  );
  console.log('-'.repeat(77));

  const summaries = [];
  for (const engine of available) {
    const r = results[engine];
    const rows = r.rows.filter((x) => !x.failed);
    const times = rows.map((x) => x.totalMs).sort((a, b) => a - b);
    const integrities = rows.map((x) => x.subjectIntegrityPct);
    const mean = integrities.reduce((a, b) => a + b, 0) / integrities.length;
    const worst = Math.min(...integrities);
    const failures = integrities.filter((v) => v < INTEGRITY_FLOOR).length;
    summaries.push({ engine, median: times[Math.floor(times.length / 2)], mean, worst, failures });
    console.log(
      LABELS[engine].padEnd(20) +
        pad(`${r.modelMb}MB`, 8) +
        pad(`${times[Math.floor(times.length / 2)]}ms`, 9) +
        pad(r.peakRssMb ? `${r.peakRssMb}MB` : 'n/a', 10) +
        pad(`${mean.toFixed(1)}%`, 11) +
        pad(`${worst.toFixed(1)}%`, 8) +
        pad(`${failures}/${rows.length}`, 11),
    );
  }

  /* ---- per-case integrity ---- */
  console.log('\n\nSUBJECT INTEGRITY BY CASE  (% of subject interior fully opaque)\n');
  console.log('case'.padEnd(22) + available.map((e) => pad(e, 11)).join('') + '   worst engine');
  console.log('-'.repeat(22 + available.length * 11 + 16));

  for (const c of cases) {
    const cells = available.map((e) => {
      const row = results[e].rows.find((r) => r.case === c);
      return row && !row.failed ? row.subjectIntegrityPct : null;
    });
    const marks = cells.map((v) => (v === null ? pad('-', 11) : pad(`${v}%${v < INTEGRITY_FLOOR ? ' !' : '  '}`, 11)));
    const min = Math.min(...cells.filter((v) => v !== null));
    const worstEngine = available[cells.indexOf(min)];
    console.log(c.padEnd(22) + marks.join('') + `   ${worstEngine}`);
  }
  console.log('\n  ! = below 90%, meaning a visibly semi-transparent subject');

  /* ---- soft alpha ---- */
  console.log('\n\nSOFT ALPHA  (% of pixels in the 32-224 transition band)\n');
  console.log('case'.padEnd(22) + available.map((e) => pad(e, 11)).join(''));
  console.log('-'.repeat(22 + available.length * 11));
  for (const c of cases) {
    const cells = available.map((e) => {
      const row = results[e].rows.find((r) => r.case === c);
      return row && !row.failed ? pad(`${row.softAlphaPct}%`, 11) : pad('-', 11);
    });
    console.log(c.padEnd(22) + cells.join(''));
  }

  /* ---- contact sheets ---- */
  console.log('\n\nBuilding contact sheets...');
  let built = 0;
  for (const c of cases) {
    if (await contactSheet(c)) built += 1;
  }
  console.log(`  ${built} written to ${OUT}/_compare-<case>.jpg`);

  await writeFile(
    join(OUT, 'summary.json'),
    `${JSON.stringify({ generated: new Date().toISOString(), summaries, results }, null, 2)}\n`,
    'utf8',
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
