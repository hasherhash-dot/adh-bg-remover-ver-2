#!/usr/bin/env node
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * Failure classification across every engine and case.
 *
 *   node scripts/classify-failures.mjs
 *
 * The 20-image benchmark showed why a single number cannot decide this:
 * BiRefNet scored 99.3% subject integrity on the vanity while deleting the
 * mirror glass, because a deleted region has no interior to measure. So this
 * splits the job in two.
 *
 * Detected here, from the masks:
 *
 *   missing-subject     mask is empty or nearly so — nothing came back
 *   no-removal          mask is full — nothing was removed
 *   soft-subject        subject interior is not opaque; it will look
 *                       see-through on any new background
 *   large-retained      a connected blob of foreground touching the frame edge
 *                       that is far from the main subject — kept background
 *
 * Not detected here, and recorded by eye in VISUAL_NOTES below:
 * reflection failures, halos, hair quality, and which specific object was
 * dropped. Those need looking at the contact sheets, and pretending otherwise
 * would be inventing a metric.
 */

const OUT = 'debug/benchmark';

const ENGINES = [
  'imgly',
  'isnet',
  'u2net',
  'birefnet-512',
  'birefnet-640',
  'birefnet-768',
  'birefnet-1024',
];

/**
 * Observations from the contact sheets. Recorded rather than computed, and
 * limited to what is actually visible in the images in debug/benchmark.
 */
const VISUAL_NOTES = {
  'furniture-vanity': {
    'birefnet-512': ['clean', 'mirror glass fully retained'],
    'birefnet-640': ['minor', 'mirror retained, small artefact upper right'],
    'birefnet-768': ['major', 'reflection failure: mirror glass removed, hollow frame'],
    'birefnet-1024': ['major', 'reflection failure: mirror glass removed, hollow frame'],
    imgly: ['clean', 'mirror retained'],
    isnet: ['minor', 'mirror retained, soft interior'],
    u2net: ['minor', 'mirror retained, some halo'],
  },
  'furniture-sideboard': {
    'birefnet-512': ['major', 'missing subject: output entirely empty'],
    'birefnet-640': ['noticeable', 'unwanted removal: pampas grass and picture frame dropped'],
    'birefnet-768': ['clean', 'all objects on top retained'],
    'birefnet-1024': ['minor', 'pampas fronds partly dropped'],
    imgly: ['clean', null],
    isnet: ['clean', null],
    u2net: ['minor', 'slight halo'],
  },
  'stripes-on-stripes': {
    'birefnet-512': ['clean', null],
    'birefnet-640': ['clean', null],
    'birefnet-768': ['clean', null],
    'birefnet-1024': ['clean', null],
    imgly: ['major', 'false foreground: striped backdrop retained along bottom; raised arm merged into background'],
    isnet: ['major', 'false foreground: striped backdrop retained'],
    u2net: ['noticeable', 'false foreground: backdrop bands retained at bottom'],
  },
  'blonde-salon': {
    'birefnet-512': ['minor', 'small retained patch at shoulder'],
    'birefnet-640': ['minor', 'small retained patch at shoulder'],
    'birefnet-768': ['minor', 'small retained patch at shoulder'],
    'birefnet-1024': ['minor', 'small retained patch at shoulder'],
    imgly: ['minor', 'halo around hair'],
    isnet: ['minor', 'halo, slight retained background left'],
    u2net: ['major', 'false foreground: ceiling and light fixture retained'],
  },
  'afro-wall': {
    'birefnet-512': ['clean', 'cast shadow correctly excluded'],
    'birefnet-640': ['clean', null],
    'birefnet-768': ['clean', 'best hair detail'],
    'birefnet-1024': ['clean', 'best hair detail'],
    imgly: ['noticeable', 'soft subject: interior semi-transparent'],
    isnet: ['noticeable', 'soft subject'],
    u2net: ['clean', null],
  },
  'group-table': {
    'birefnet-512': ['clean', null],
    'birefnet-640': ['clean', null],
    'birefnet-768': ['clean', null],
    'birefnet-1024': ['clean', null],
    imgly: ['major', 'soft subject: three of five people semi-transparent'],
    isnet: ['major', 'soft subject: three of five people semi-transparent'],
    u2net: ['major', 'soft subject across several people'],
  },
  'object-holes': {
    'birefnet-512': ['clean', 'hole correctly transparent'],
    'birefnet-640': ['clean', 'hole correctly transparent'],
    'birefnet-768': ['clean', null],
    'birefnet-1024': ['clean', null],
    imgly: ['clean', null],
    isnet: ['clean', null],
    u2net: ['clean', null],
  },
  'group-table': {
    // The detector flags 'large-retained' on all four of these. It is wrong:
    // this is a wide crop where the leftmost and rightmost people are separate
    // connected components touching the frame edge, far from the overall
    // centroid — the same signature retained background has. Checked against
    // debug/benchmark/group-table/mask-birefnet-640.png, which is clean.
    'birefnet-512': ['clean', 'five subjects solid, background removed'],
    'birefnet-640': ['clean', 'five subjects solid, background removed'],
    'birefnet-768': ['clean', 'five subjects solid, background removed'],
    'birefnet-1024': ['clean', 'five subjects solid, background removed'],
  },

  'portrait-2': {
    'birefnet-512': ['clean', null],
    'birefnet-640': ['clean', null],
    'birefnet-768': ['clean', null],
    'birefnet-1024': ['clean', null],
    imgly: ['major', 'soft subject: 26.5% interior opacity, whole person see-through'],
    isnet: ['major', 'soft subject: 28% interior opacity'],
    u2net: ['clean', null],
  },
};

const SEVERITY = ['clean', 'minor', 'noticeable', 'major'];

function worst(a, b) {
  return SEVERITY.indexOf(a) >= SEVERITY.indexOf(b) ? a : b;
}

/**
 * Look for a foreground blob that touches the frame edge and sits far from the
 * image's foreground centroid. That pattern is what retained background looks
 * like; a subject that merely reaches the edge stays near the centroid.
 */
async function detectRetained(alpha, width, height) {
  // Downsample the decision grid — this is a shape question, not a detail one.
  const step = Math.max(1, Math.round(Math.max(width, height) / 256));
  const w = Math.floor(width / step);
  const h = Math.floor(height / step);
  const fg = new Uint8Array(w * h);
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const a = alpha[y * step * width + x * step];
      if (a > 128) {
        fg[y * w + x] = 1;
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }
  if (!count) return null;

  const cx = sumX / count;
  const cy = sumY / count;
  const seen = new Uint8Array(w * h);
  let flagged = 0;

  for (let start = 0; start < fg.length; start += 1) {
    if (!fg[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    const cells = [];
    let touchesEdge = false;
    while (stack.length) {
      const idx = stack.pop();
      cells.push(idx);
      const x = idx % w;
      const y = (idx - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesEdge = true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (fg[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    if (cells.length < count * 0.02) continue; // ignore specks
    // Distance of this blob's centre from the overall foreground centroid,
    // relative to the image diagonal.
    let bx = 0;
    let by = 0;
    for (const idx of cells) {
      const x = idx % w;
      bx += x;
      by += (idx - x) / w;
    }
    bx /= cells.length;
    by /= cells.length;
    const distance = Math.hypot(bx - cx, by - cy) / Math.hypot(w, h);
    if (touchesEdge && distance > 0.25) flagged += cells.length;
  }

  return flagged / count;
}

async function main() {
  const rows = [];
  for (const engine of ENGINES) {
    const file = join(OUT, `results-${engine}.json`);
    if (!existsSync(file)) continue;
    const results = JSON.parse(await readFile(file, 'utf8'));

    for (const row of results.rows) {
      if (row.failed) continue;
      const maskPath = join(OUT, row.case, `mask-${engine}.png`);
      const detected = [];
      let severity = 'clean';

      if (row.transparentPct > 99) {
        detected.push('missing-subject');
        severity = 'major';
      } else if (row.transparentPct < 1) {
        detected.push('no-removal');
        severity = 'major';
      } else {
        if (row.subjectIntegrityPct !== null && row.subjectIntegrityPct < 90) {
          detected.push('soft-subject');
          severity = worst(severity, row.subjectIntegrityPct < 60 ? 'major' : 'noticeable');
        }
        if (existsSync(maskPath)) {
          const { data, info } = await sharp(maskPath).greyscale().raw().toBuffer({ resolveWithObject: true });
          const retained = await detectRetained(data, info.width, info.height);
          if (retained !== null && retained > 0.08) {
            detected.push('large-retained');
            severity = worst(severity, retained > 0.2 ? 'major' : 'noticeable');
          }
        }
      }

      // A recorded observation replaces the heuristic rather than being
      // combined with it. The detectors are proxies; someone looked at these.
      const note = VISUAL_NOTES[row.case]?.[engine];
      if (note) {
        severity = note[0];
        if (note[1]) detected.push(`seen: ${note[1]}`);
      }

      rows.push({ case: row.case, engine, severity, detected, integrity: row.subjectIntegrityPct });
    }
  }

  // Per-engine tally
  console.log('\nFAILURE TALLY  (20 cases per engine)\n');
  console.log('engine'.padEnd(16) + 'clean'.padStart(7) + 'minor'.padStart(7) + 'noticeable'.padStart(12) + 'major'.padStart(7) + '   major cases');
  console.log('-'.repeat(85));
  for (const engine of ENGINES) {
    const mine = rows.filter((r) => r.engine === engine);
    if (!mine.length) continue;
    const counts = Object.fromEntries(SEVERITY.map((s) => [s, mine.filter((r) => r.severity === s).length]));
    const majors = mine.filter((r) => r.severity === 'major').map((r) => r.case);
    console.log(
      engine.padEnd(16) +
        String(counts.clean).padStart(7) +
        String(counts.minor).padStart(7) +
        String(counts.noticeable).padStart(12) +
        String(counts.major).padStart(7) +
        '   ' +
        (majors.join(', ') || '-'),
    );
  }

  console.log('\n\nEVERY NON-CLEAN RESULT\n');
  for (const engine of ENGINES) {
    const bad = rows.filter((r) => r.engine === engine && r.severity !== 'clean');
    if (!bad.length) continue;
    console.log(`  ${engine}`);
    for (const r of bad) {
      console.log(`    ${r.severity.padEnd(11)} ${r.case.padEnd(21)} ${r.detected.join('; ')}`);
    }
    console.log('');
  }

  await writeFile(join(OUT, 'classification.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
