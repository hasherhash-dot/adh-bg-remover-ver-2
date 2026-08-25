import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { BackgroundRemovalService } from '@/lib/bg-removal/service';
import { MockProvider } from '@/lib/bg-removal/providers/mock';
import { AppError } from '@/lib/errors';
import {
  asJpeg,
  asWebp,
  corruptedPng,
  notAnImage,
  subjectOnFlatBackground,
} from './fixtures/images';

const service = new BackgroundRemovalService(new MockProvider());

/** Reads the alpha channel and reports the distribution of transparency. */
async function alphaProfile(png: Buffer) {
  const meta = await sharp(png).metadata();
  const raw = await sharp(png).raw().toBuffer();
  const channels = meta.channels as number;
  let opaque = 0;
  let transparent = 0;
  let total = 0;
  for (let i = 3; i < raw.length; i += channels) {
    const a = raw[i] as number;
    if (a > 250) opaque += 1;
    else if (a < 5) transparent += 1;
    total += 1;
  }
  return {
    width: meta.width as number,
    height: meta.height as number,
    hasAlpha: meta.hasAlpha === true,
    opaqueRatio: opaque / total,
    transparentRatio: transparent / total,
  };
}

describe('BackgroundRemovalService', () => {
  it('removes the background and returns a transparent PNG', async () => {
    const input = await subjectOnFlatBackground({ width: 400, height: 300 });

    const result = await service.removeBackground({ data: input, filename: 'subject.png' });

    expect(result.mimeType).toBe('image/png');
    const profile = await alphaProfile(result.data);
    expect(profile.hasAlpha).toBe(true);
    // The flat background should be cut away and the subject kept.
    expect(profile.transparentRatio).toBeGreaterThan(0.5);
    expect(profile.opaqueRatio).toBeGreaterThan(0.05);
  });

  it('preserves the original resolution regardless of inference size', async () => {
    const input = await subjectOnFlatBackground({ width: 1600, height: 1200 });

    const result = await service.removeBackground({ data: input, filename: 'large.png' });

    expect(result.width).toBe(1600);
    expect(result.height).toBe(1200);
    // Inference must have run on a smaller raster than the output.
    expect(result.meta.inference.width).toBeLessThanOrEqual(1024);
    const profile = await alphaProfile(result.data);
    expect(profile.width).toBe(1600);
    expect(profile.height).toBe(1200);
  });

  it('reports accurate processing metadata', async () => {
    const input = await asJpeg({ width: 320, height: 240 });

    const result = await service.removeBackground({ data: input, filename: 'photo.jpg' });

    expect(result.meta.providerId).toBe('mock');
    expect(result.meta.source.mimeType).toBe('image/jpeg');
    expect(result.meta.source.byteSize).toBe(input.length);
    expect(result.meta.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.meta.inferenceTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.meta.backgroundRatio).toBeGreaterThan(0);
    expect(result.byteSize).toBe(result.data.length);
  });

  it.each([
    ['png', subjectOnFlatBackground],
    ['jpeg', asJpeg],
    ['webp', asWebp],
  ])('accepts %s input', async (_name, make) => {
    const result = await service.removeBackground({
      data: await make({ width: 200, height: 150 }),
      filename: `input.${_name}`,
    });
    expect(result.width).toBe(200);
  });

  it('reports progress monotonically from start to finish', async () => {
    const seen: number[] = [];
    await service.removeBackground({
      data: await subjectOnFlatBackground({ width: 200, height: 150 }),
      filename: 'progress.png',
      onProgress: (p) => seen.push(p),
    });

    expect(seen.length).toBeGreaterThan(3);
    expect(seen[seen.length - 1]).toBe(1);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1] as number);
    }
  });

  describe('background fills', () => {
    it('produces a fully opaque image for a solid colour', async () => {
      const result = await service.removeBackground({
        data: await subjectOnFlatBackground({ width: 200, height: 150 }),
        filename: 'colour.png',
        background: { type: 'color', color: '#ff0000' },
      });

      const profile = await alphaProfile(result.data);
      expect(profile.transparentRatio).toBe(0);

      // A corner pixel should now be the fill colour.
      const raw = await sharp(result.data).raw().toBuffer();
      expect(raw[0]).toBe(255);
      expect(raw[1]).toBe(0);
      expect(raw[2]).toBe(0);
    });

    it('composites a replacement background image', async () => {
      const backgroundImage = await sharp({
        create: { width: 400, height: 400, channels: 3, background: '#00ff00' },
      })
        .png()
        .toBuffer();

      const result = await service.removeBackground({
        data: await subjectOnFlatBackground({ width: 200, height: 150 }),
        filename: 'bg.png',
        background: { type: 'image', data: backgroundImage },
      });

      const raw = await sharp(result.data).raw().toBuffer();
      expect(raw[1]).toBeGreaterThan(200); // green corner
    });

    it('keeps PNG output even if another format is requested for transparency', async () => {
      const result = await service.removeBackground({
        data: await subjectOnFlatBackground({ width: 120, height: 90 }),
        filename: 'x.png',
        background: { type: 'transparent' },
        format: 'jpeg',
      });
      expect(result.mimeType).toBe('image/png');
    });
  });

  describe('error handling', () => {
    it('rejects a non-image payload with INVALID_FILE_TYPE', async () => {
      await expect(
        service.removeBackground({ data: notAnImage(), filename: 'script.sh' }),
      ).rejects.toMatchObject({ code: 'INVALID_FILE_TYPE' });
    });

    it('rejects an empty upload', async () => {
      await expect(
        service.removeBackground({ data: Buffer.alloc(0), filename: 'empty.png' }),
      ).rejects.toMatchObject({ code: 'NO_FILE_PROVIDED' });
    });

    it('rejects a corrupted image', async () => {
      await expect(
        service.removeBackground({ data: await corruptedPng(), filename: 'broken.png' }),
      ).rejects.toMatchObject({ code: 'CORRUPTED_IMAGE' });
    });

    it('surfaces provider failures as a user-safe AppError', async () => {
      const failing = new BackgroundRemovalService({
        id: 'boom',
        name: 'Failing provider',
        isLocal: true,
        segment: async () => {
          throw new Error('CUDA out of memory at 0x7fff');
        },
      });

      const error = await failing
        .removeBackground({
          data: await subjectOnFlatBackground({ width: 80, height: 60 }),
          filename: 'x.png',
        })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      // The internal message must not leak into what the user sees.
      expect(appError.userMessage).not.toContain('CUDA');
      expect(appError.toJSON()).toEqual({
        code: 'INTERNAL_ERROR',
        message: expect.any(String),
        retryable: true,
      });
    });

    it('fails when the provider returns nothing usable', async () => {
      const empty = new BackgroundRemovalService({
        id: 'empty',
        name: 'Empty provider',
        isLocal: true,
        segment: async () => ({}),
      });

      await expect(
        empty.removeBackground({
          data: await subjectOnFlatBackground({ width: 80, height: 60 }),
          filename: 'x.png',
        }),
      ).rejects.toMatchObject({ code: 'PROCESSING_FAILED' });
    });
  });
});
