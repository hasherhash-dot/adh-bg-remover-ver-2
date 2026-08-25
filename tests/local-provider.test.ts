import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { BackgroundRemovalService } from '@/lib/bg-removal/service';
import { LocalOnnxProvider } from '@/lib/bg-removal/providers/local-onnx';

/**
 * Exercises the real ONNX model end to end.
 *
 * This is the test that proves the product actually works rather than merely
 * wiring up correctly — the mock provider in the other suites cannot tell you
 * whether inference produces a usable mask.
 *
 * It is slower than the rest of the suite (model load plus inference), so it is
 * skippable with SKIP_MODEL_TESTS=1 for a fast inner loop. CI should run it.
 */

const skip = process.env.SKIP_MODEL_TESTS === '1';

/**
 * A photograph-like subject: a textured, shaded object on a graded background.
 * Flat vector shapes are not representative — a saliency model reads a
 * uniformly coloured canvas as one object.
 */
async function syntheticPhoto(width = 640, height = 480): Promise<Buffer> {
  const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#dfe6ee"/>
        <stop offset="100%" stop-color="#b9c6d4"/>
      </linearGradient>
      <radialGradient id="ball" cx="0.35" cy="0.3" r="0.75">
        <stop offset="0%" stop-color="#ff8a5b"/>
        <stop offset="60%" stop-color="#d64524"/>
        <stop offset="100%" stop-color="#6d1f0f"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <ellipse cx="${width / 2}" cy="${height * 0.78}" rx="${width * 0.18}" ry="${height * 0.03}"
             fill="#000" opacity="0.18"/>
    <circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.28}"
            fill="url(#ball)"/>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 94 }).toBuffer();
}

async function alphaBreakdown(png: Buffer) {
  const meta = await sharp(png).metadata();
  const raw = await sharp(png).raw().toBuffer();
  const channels = meta.channels as number;

  let opaque = 0;
  let transparent = 0;
  let partial = 0;
  let total = 0;
  for (let i = 3; i < raw.length; i += channels) {
    const a = raw[i] as number;
    if (a > 240) opaque += 1;
    else if (a < 15) transparent += 1;
    else partial += 1;
    total += 1;
  }

  const corner = raw[3] as number;
  const centreIndex =
    (Math.floor((meta.height as number) / 2) * (meta.width as number) +
      Math.floor((meta.width as number) / 2)) *
      channels +
    3;

  return {
    width: meta.width as number,
    height: meta.height as number,
    hasAlpha: meta.hasAlpha === true,
    opaqueRatio: opaque / total,
    transparentRatio: transparent / total,
    partialRatio: partial / total,
    cornerAlpha: corner,
    centreAlpha: raw[centreIndex] as number,
  };
}

/** Reads the alpha byte at a single pixel of an encoded PNG. */
async function alphaAtPixel(png: Buffer, x: number, y: number): Promise<number> {
  const meta = await sharp(png).metadata();
  const raw = await sharp(png).raw().toBuffer();
  const channels = meta.channels as number;
  return raw[(y * (meta.width as number) + x) * channels + 3] as number;
}

describe.skipIf(skip)('LocalOnnxProvider (real model)', () => {
  const service = new BackgroundRemovalService(new LocalOnnxProvider({ model: 'medium' }));

  it(
    'produces a genuine cut-out: background transparent, subject opaque',
    async () => {
      const input = await syntheticPhoto(640, 480);
      const result = await service.removeBackground({ data: input, filename: 'ball.jpg' });

      const alpha = await alphaBreakdown(result.data);

      expect(alpha.hasAlpha).toBe(true);
      // The corner is background; the centre is the subject.
      expect(alpha.cornerAlpha).toBeLessThan(40);
      expect(alpha.centreAlpha).toBeGreaterThan(200);
      // A centred subject of this size occupies well under half the frame.
      expect(alpha.transparentRatio).toBeGreaterThan(0.4);
      expect(alpha.opaqueRatio).toBeGreaterThan(0.05);
      expect(result.meta.providerId).toBe('local-onnx');
      expect(result.meta.inferenceTimeMs).toBeGreaterThan(0);
    },
    120_000,
  );

  it(
    'returns the original resolution even though inference is downscaled',
    async () => {
      const input = await syntheticPhoto(1600, 1200);
      const result = await service.removeBackground({ data: input, filename: 'big.jpg' });

      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
      // Inference must have run smaller than the output.
      expect(result.meta.inference.width).toBeLessThanOrEqual(1024);
      expect(result.meta.inference.width).toBeLessThan(result.width);

      const alpha = await alphaBreakdown(result.data);
      expect(alpha.width).toBe(1600);
      expect(alpha.cornerAlpha).toBeLessThan(40);
      // Upscaling the mask should leave a soft boundary, not a hard staircase.
      expect(alpha.partialRatio).toBeGreaterThan(0);

      // The subject sits in the middle of the frame, so the centre must be
      // opaque and all four corners transparent. A mask that survives scaling
      // in aggregate can still be spatially wrong — a stride bug shears it
      // while leaving the overall transparent/opaque ratio almost unchanged.
      expect(alpha.centreAlpha).toBeGreaterThan(200);
      for (const [x, y] of [
        [5, 5],
        [1595, 5],
        [5, 1195],
        [1595, 1195],
      ] as const) {
        expect(await alphaAtPixel(result.data, x, y), `corner ${x},${y}`).toBeLessThan(40);
      }
    },
    120_000,
  );

  it(
    'scaling the mask to full resolution does not change what it selected',
    async () => {
      // Runs the same source at a size that needs no scaling and at one that
      // does. If mask scaling corrupts the result, the two disagree sharply.
      const small = await syntheticPhoto(800, 600);
      const large = await syntheticPhoto(2000, 1500);

      const [smallResult, largeResult] = await Promise.all([
        service.removeBackground({ data: small, filename: 'small.jpg' }),
        service.removeBackground({ data: large, filename: 'large.jpg' }),
      ]);

      expect(smallResult.meta.inference.width).toBe(800); // no downscale
      expect(largeResult.meta.inference.width).toBeLessThan(2000); // downscaled

      const a = await alphaBreakdown(smallResult.data);
      const b = await alphaBreakdown(largeResult.data);

      // Same subject, same framing: the proportion of background must match
      // closely regardless of whether the mask had to be scaled back up.
      expect(Math.abs(a.transparentRatio - b.transparentRatio)).toBeLessThan(0.05);
      expect(Math.abs(a.opaqueRatio - b.opaqueRatio)).toBeLessThan(0.05);
    },
    180_000,
  );

  it(
    'composites a solid background with no transparency left',
    async () => {
      const input = await syntheticPhoto(480, 360);
      const result = await service.removeBackground({
        data: input,
        filename: 'ball.jpg',
        background: { type: 'color', color: '#0000ff' },
      });

      const raw = await sharp(result.data).raw().toBuffer();
      expect([raw[0], raw[1], raw[2]]).toEqual([0, 0, 255]);

      const alpha = await alphaBreakdown(result.data);
      expect(alpha.transparentRatio).toBe(0);
    },
    120_000,
  );

  it('reports itself healthy', async () => {
    const health = await new LocalOnnxProvider().healthCheck();
    expect(health.ok).toBe(true);
  });
});
