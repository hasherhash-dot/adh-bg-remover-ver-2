#!/usr/bin/env node
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

/**
 * Builds the Manifest V3 extension into extension/dist.
 *
 * Three steps: bundle the TypeScript entry points, copy the static files, and
 * rasterise the SVG mark into the PNG sizes Chrome requires (it does not accept
 * SVG for action or extension icons).
 *
 *   node extension/build.mjs           one-off build
 *   node extension/build.mjs --watch   rebuild on change
 *   node extension/build.mjs --zip     build, then package dist as a zip
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, 'src');
const outDir = join(here, 'dist');
const watch = process.argv.includes('--watch');
const zip = process.argv.includes('--zip');

const ENTRY_POINTS = ['background.ts', 'popup.ts', 'result.ts', 'options.ts'].map((file) =>
  join(srcDir, file),
);

const STATIC_FILES = ['manifest.json', 'ui.css', 'popup.html', 'result.html', 'options.html'];

const buildOptions = {
  entryPoints: ENTRY_POINTS,
  outdir: outDir,
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  platform: 'browser',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

async function copyStatic() {
  await mkdir(outDir, { recursive: true });
  await cp(join(srcDir, 'assets'), join(outDir, 'assets'), { recursive: true });
  for (const file of STATIC_FILES) {
    await cp(join(srcDir, file), join(outDir, file));
  }
}

/** Chrome needs PNG icons; the source of truth is the app's SVG mark. */
async function buildIcons() {
  const iconDir = join(outDir, 'icons');
  await mkdir(iconDir, { recursive: true });

  const svgPath = resolve(here, '..', 'public', 'icon.svg');
  const svg = await readFile(svgPath);

  await Promise.all(
    [16, 32, 48, 128].map((size) =>
      sharp(svg, { density: 384 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toFile(join(iconDir, `icon-${size}.png`)),
    ),
  );
}

/** Verifies the manifest points only at files that were actually produced. */
async function verify() {
  const manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'));
  const required = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    ...Object.values(manifest.icons ?? {}),
    ...Object.values(manifest.action?.default_icon ?? {}),
    'result.html',
    'result.js',
    'popup.js',
    'options.js',
    'ui.css',
    'assets/adh-logo.svg',
    'assets/inter-latin.woff2',
    'assets/bricolage-latin.woff2',
  ].filter(Boolean);

  const { access } = await import('node:fs/promises');
  const missing = [];
  for (const file of required) {
    try {
      await access(join(outDir, file));
    } catch {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error(`Build incomplete — missing: ${missing.join(', ')}`);
  }
  return required.length;
}

async function makeZip() {
  // Uses jszip, already a dependency of the web app, to avoid shelling out to
  // a platform-specific archiver.
  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  const { readdir, stat } = await import('node:fs/promises');

  async function addDir(dir, prefix = '') {
    for (const entry of await readdir(dir)) {
      const full = join(dir, entry);
      const info = await stat(full);
      if (info.isDirectory()) await addDir(full, `${prefix}${entry}/`);
      else archive.file(`${prefix}${entry}`, await readFile(full));
    }
  }

  await addDir(outDir);
  const target = join(here, 'adh-background-remover.zip');
  await new Promise((resolvePromise, reject) => {
    archive
      .generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' })
      .pipe(createWriteStream(target))
      .on('finish', resolvePromise)
      .on('error', reject);
  });
  console.log(`Packaged ${target}`);
}

async function run() {
  await rm(outDir, { recursive: true, force: true });

  if (watch) {
    await copyStatic();
    await buildIcons();
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log('Watching extension sources… (static files are not watched)');
    return;
  }

  await build(buildOptions);
  await copyStatic();
  await buildIcons();
  const count = await verify();
  console.log(`Extension built to extension/dist (${count} files verified)`);

  if (zip) await makeZip();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
