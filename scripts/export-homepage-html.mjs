#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Export the homepage as one self-contained HTML file.
 *
 *   node scripts/export-homepage-html.mjs            (needs the dev/prod server up)
 *   node scripts/export-homepage-html.mjs http://localhost:3000
 *
 * Produces design-handoff/adh-homepage.html — a single file with the stylesheet,
 * the web fonts and every image embedded, so it opens correctly on a machine
 * that has none of this repository. Written for Figma's html.to.design plugin,
 * which wants exactly that: one file, no external requests.
 *
 * What is deliberately stripped:
 *
 *   - every <script>. The page is a static snapshot for design work; leaving
 *     Next.js hydration in would only produce console errors in a context with
 *     no server behind it
 *   - preload/prefetch hints pointing at /_next/, which would 404
 *
 * What that means for the result: interactive surfaces are frozen in their
 * initial state. The uploader shows its empty drop zone and the comparison
 * slider sits at 50%. That is the correct thing to hand a designer anyway.
 */

const ORIGIN = process.argv[2] ?? 'http://localhost:3000';
const OUT_DIR = 'design-handoff';
const OUT_FILE = 'adh-homepage.html';

const MIME = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
  woff2: 'font/woff2',
  woff: 'font/woff',
};

function mimeFor(url) {
  const extension = url.split('?')[0].split('.').pop().toLowerCase();
  return MIME[extension] ?? 'application/octet-stream';
}

const cache = new Map();

/** Fetch any asset and return it as a data: URI, so nothing stays external. */
async function asDataUri(url) {
  if (cache.has(url)) return cache.get(url);
  const absolute = url.startsWith('http') ? url : new URL(url, ORIGIN).href;

  const response = await fetch(absolute);
  if (!response.ok) throw new Error(`${absolute} -> ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const uri = `data:${mimeFor(absolute)};base64,${buffer.toString('base64')}`;
  cache.set(url, uri);
  return uri;
}

async function main() {
  console.log(`reading ${ORIGIN}\n`);
  const response = await fetch(ORIGIN);
  if (!response.ok) throw new Error(`homepage returned ${response.status}`);
  let html = await response.text();

  // ---- stylesheets -> one inline <style> ---------------------------------
  const cssHrefs = [...new Set([...html.matchAll(/href="(\/_next\/static\/[^"]+\.css)"/g)].map((m) => m[1]))];
  let css = '';
  const fontUrls = new Set();

  for (const href of cssHrefs) {
    const sheet = await (await fetch(new URL(href, ORIGIN))).text();
    console.log(`  css   ${href}  ${(sheet.length / 1024).toFixed(0)} KB`);

    // url(...) inside a stylesheet resolves against the STYLESHEET, not the
    // page. Next emits `url(../media/x.woff2)` from /_next/static/chunks/,
    // so matching on an absolute path finds nothing.
    for (const match of sheet.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)) {
      const raw = match[2];
      if (raw.startsWith('data:')) continue;
      fontUrls.add(new URL(raw, new URL(href, ORIGIN)).pathname);
    }
    css += `${sheet}\n`;
  }

  for (const url of fontUrls) {
    try {
      const uri = await asDataUri(url);
      // Replace by filename so both the relative and absolute forms are hit.
      const filename = url.split('/').pop();
      css = css.replace(new RegExp(`url\\(([^)]*${filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\)`, 'g'), `url(${uri})`);
      console.log(`  font  ${filename}`);
    } catch (error) {
      console.log(`  font  SKIPPED ${url} (${error.message})`);
    }
  }

  // ---- strip what cannot work offline ------------------------------------
  html = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<link[^>]+rel="(preload|prefetch|modulepreload)"[^>]*>/g, '')
    .replace(/<link[^>]+href="\/_next\/static\/[^"]+\.css"[^>]*>/g, '');

  // ---- images -> data URIs ----------------------------------------------
  const imageUrls = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+\.(?:webp|png|jpe?g|svg))"/g)].map((m) => m[1]))];
  for (const url of imageUrls) {
    try {
      const uri = await asDataUri(url);
      html = html.split(`"${url}"`).join(`"${uri}"`);
      console.log(`  image ${url}`);
    } catch (error) {
      console.log(`  image SKIPPED ${url} (${error.message})`);
    }
  }

  // The transparency checkerboard is a CSS gradient, so it survives as-is.
  html = html.replace('</head>', `<style>\n${css}</style>\n</head>`);

  // A short note for whoever opens the file, invisible in the design.
  html = html.replace(
    '<body',
    `<!--
  ADH Background Remover — homepage design snapshot
  Exported ${new Date().toISOString().slice(0, 10)} from ${ORIGIN}

  Self-contained: stylesheet, fonts and images are embedded, no external
  requests. Scripts removed, so interactive parts show their initial state.
  Import into Figma with the html.to.design plugin.
-->
<body`,
  );

  await mkdir(OUT_DIR, { recursive: true });
  const path = join(OUT_DIR, OUT_FILE);
  await writeFile(path, html, 'utf8');

  console.log(`\nwrote ${path}  ${(Buffer.byteLength(html) / 1048576).toFixed(1)} MB`);
  console.log(`  embedded ${imageUrls.length} images, ${fontUrls.size} fonts, ${cssHrefs.length} stylesheet(s)`);
  console.log(`  remaining external references: ${(html.match(/(?:src|href)="\/(?!\/)/g) ?? []).length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
