import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { compositeMask, extractAlpha, resizeMask } from '@/lib/image/pipeline';
import type { NormalizedImage } from '@/lib/image/pipeline';

/**
 * Regression cover for mask scaling and RGBA interleaving.
 *
 * These exist because of a real production bug: `sharp(raw, { channels: 1 })
 * .resize(...).raw()` returns THREE bytes per pixel, not one. The composite
 * loop read that buffer sequentially, so every output pixel received mask byte
 * `i` instead of mask pixel `i`. The mask ended up stretched along raster order
 * and the cutout came out diagonally sheared with large parts of the subject
 * wrongly transparent.
 *
 * Two properties are tested, because only the second one actually catches it:
 *   1. the mask stays single-channel, and
 *   2. the alpha lands in the correct PLACE.
 *
 * Aggregate statistics (percent transparent, mean alpha) are almost unchanged
 * by a shear, which is exactly why the original suite passed while the output
 * was visibly broken. Spatial assertions are the ones that matter.
 */

async function makeImage(width: number, height: number): Promise<NormalizedImage> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
  return { buffer, width, height, hasAlpha: false };
}

/** Mask whose left half is opaque and right half transparent. */
function halfMask(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = x < width / 2 ? 255 : 0;
    }
  }
  return data;
}

/** Mask whose top half is opaque and bottom half transparent. */
function topMask(width: number, height: number): Buffer {
  const data = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = y < height / 2 ? 255 : 0;
    }
  }
  return data;
}

async function alphaAt(rgba: Buffer, width: number, x: number, y: number): Promise<number> {
  return rgba[(y * width + x) * 4 + 3] as number;
}

describe('resizeMask', () => {
  it('returns exactly one byte per pixel when upscaling', async () => {
    const mask = { data: halfMask(64, 48), width: 64, height: 48 };

    const resized = await resizeMask(mask, 640, 480);

    expect(resized.length).toBe(640 * 480);
  });

  it('returns exactly one byte per pixel when downscaling', async () => {
    const mask = { data: halfMask(640, 480), width: 640, height: 480 };

    const resized = await resizeMask(mask, 64, 48);

    expect(resized.length).toBe(64 * 48);
  });

  it('passes a same-size mask through untouched', async () => {
    const data = halfMask(32, 32);
    const resized = await resizeMask({ data, width: 32, height: 32 }, 32, 32);

    expect(resized.length).toBe(32 * 32);
    expect(Buffer.compare(resized, data)).toBe(0);
  });

  it('keeps the mask spatially aligned when upscaled', async () => {
    // Left half opaque. After a 10x upscale the left half must STILL be opaque.
    const resized = await resizeMask({ data: halfMask(64, 48), width: 64, height: 48 }, 640, 480);

    const at = (x: number, y: number) => resized[y * 640 + x] as number;

    expect(at(50, 240)).toBeGreaterThan(250); // far left  -> opaque
    expect(at(250, 240)).toBeGreaterThan(250); // still left half
    expect(at(400, 240)).toBeLessThan(5); // right half -> transparent
    expect(at(600, 240)).toBeLessThan(5); // far right -> transparent
  });

  it('preserves the transparent/opaque balance across a large upscale', async () => {
    const mask = { data: topMask(100, 100), width: 100, height: 100 };

    const resized = await resizeMask(mask, 1000, 1000);

    let transparent = 0;
    let opaque = 0;
    for (const v of resized) {
      if (v < 10) transparent += 1;
      else if (v > 245) opaque += 1;
    }
    // Roughly half and half, allowing for the soft ramp at the boundary.
    expect(transparent / resized.length).toBeGreaterThan(0.45);
    expect(opaque / resized.length).toBeGreaterThan(0.45);
  });
});

describe('compositeMask', () => {
  it('produces exactly four bytes per pixel', async () => {
    const image = await makeImage(200, 150);
    const mask = { data: halfMask(100, 75), width: 100, height: 75 };

    const result = await compositeMask(image, mask);

    expect(result.rgba.length).toBe(200 * 150 * 4);
    expect(result.width).toBe(200);
    expect(result.height).toBe(150);
  });

  it('places alpha on the correct pixels when the mask is smaller than the image', async () => {
    // THE regression test. A sheared mask keeps almost the same statistics but
    // puts the transparency in the wrong place, so assert on position.
    const image = await makeImage(400, 300);
    const mask = { data: halfMask(100, 75), width: 100, height: 75 };

    const { rgba } = await compositeMask(image, mask);

    // Sample well inside each half, at several heights, to catch a shear that
    // drifts progressively down the raster.
    for (const y of [10, 80, 150, 220, 290]) {
      expect(await alphaAt(rgba, 400, 20, y), `left edge at y=${y}`).toBeGreaterThan(250);
      expect(await alphaAt(rgba, 400, 180, y), `left-inner at y=${y}`).toBeGreaterThan(250);
      expect(await alphaAt(rgba, 400, 220, y), `right-inner at y=${y}`).toBeLessThan(5);
      expect(await alphaAt(rgba, 400, 380, y), `right edge at y=${y}`).toBeLessThan(5);
    }
  });

  it('keeps a horizontal split horizontal after upscaling', async () => {
    // A vertical split can survive some stride bugs by luck; a horizontal one
    // is far more sensitive to raster-order drift.
    const image = await makeImage(400, 300);
    const mask = { data: topMask(100, 75), width: 100, height: 75 };

    const { rgba } = await compositeMask(image, mask);

    for (const x of [10, 130, 260, 390]) {
      expect(await alphaAt(rgba, 400, x, 20), `top at x=${x}`).toBeGreaterThan(250);
      expect(await alphaAt(rgba, 400, x, 120), `upper at x=${x}`).toBeGreaterThan(250);
      expect(await alphaAt(rgba, 400, x, 180), `lower at x=${x}`).toBeLessThan(5);
      expect(await alphaAt(rgba, 400, x, 280), `bottom at x=${x}`).toBeLessThan(5);
    }
  });

  it('preserves the RGB channels untouched', async () => {
    const image = await makeImage(64, 64);
    const mask = { data: halfMask(32, 32), width: 32, height: 32 };

    const { rgba } = await compositeMask(image, mask);

    // Source colour was (200, 100, 50) everywhere; only alpha may differ.
    for (let i = 0; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(200);
      expect(rgba[i + 1]).toBe(100);
      expect(rgba[i + 2]).toBe(50);
    }
  });

  it('reports a background ratio that matches the mask', async () => {
    const image = await makeImage(200, 200);
    const mask = { data: halfMask(100, 100), width: 100, height: 100 };

    const { backgroundRatio } = await compositeMask(image, mask);

    expect(backgroundRatio).toBeGreaterThan(0.45);
    expect(backgroundRatio).toBeLessThan(0.55);
  });

  it('rejects a mask whose byte count is not a whole number of channels', async () => {
    const image = await makeImage(64, 64);
    // 64x64 needs 4096 bytes; 5000 is not a multiple, so this is corruption.
    const mask = { data: Buffer.alloc(5000), width: 64, height: 64 };

    await expect(compositeMask(image, mask)).rejects.toMatchObject({
      code: 'PROCESSING_FAILED',
    });
  });

  it('recovers a replicated multi-channel mask instead of shearing it', async () => {
    // Simulates sharp promoting a single band to sRGB: same values, 3 bytes/px.
    const single = halfMask(64, 64);
    const replicated = Buffer.alloc(single.length * 3);
    for (let i = 0; i < single.length; i += 1) {
      replicated[i * 3] = single[i] as number;
      replicated[i * 3 + 1] = single[i] as number;
      replicated[i * 3 + 2] = single[i] as number;
    }

    const image = await makeImage(64, 64);
    const { rgba } = await compositeMask(image, {
      data: replicated,
      width: 64,
      height: 64,
    });

    // Must still be a clean left/right split, not a sheared smear.
    for (const y of [5, 30, 60]) {
      expect(await alphaAt(rgba, 64, 5, y)).toBeGreaterThan(250);
      expect(await alphaAt(rgba, 64, 58, y)).toBeLessThan(5);
    }
  });
});

describe('extractAlpha', () => {
  it('returns a single-channel raster from an RGBA PNG', async () => {
    const png = await sharp({
      create: { width: 80, height: 60, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 0.5 } },
    })
      .png()
      .toBuffer();

    const alpha = await extractAlpha(png);

    expect(alpha.width).toBe(80);
    expect(alpha.height).toBe(60);
    expect(alpha.data.length).toBe(80 * 60);
    // 0.5 alpha round-trips to ~128.
    expect(alpha.data[0]).toBeGreaterThan(120);
    expect(alpha.data[0]).toBeLessThan(136);
  });

  it('reads the alpha channel, not a colour channel', async () => {
    // Distinct values per channel: if the wrong band is read the test fails.
    const raw = Buffer.alloc(4 * 4 * 4);
    for (let i = 0; i < 16; i += 1) {
      raw[i * 4] = 10;
      raw[i * 4 + 1] = 20;
      raw[i * 4 + 2] = 30;
      raw[i * 4 + 3] = 200;
    }
    const png = await sharp(raw, { raw: { width: 4, height: 4, channels: 4 } })
      .png()
      .toBuffer();

    const alpha = await extractAlpha(png);

    expect([...alpha.data]).toEqual(new Array(16).fill(200));
  });

  it('rejects an image with no alpha channel', async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    await expect(extractAlpha(png)).rejects.toMatchObject({ code: 'PROCESSING_FAILED' });
  });
});
