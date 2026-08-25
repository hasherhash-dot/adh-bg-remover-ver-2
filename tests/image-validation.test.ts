import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import {
  detectImageType,
  isSupportedInputType,
  sanitizeFilename,
  toPngFilename,
} from '@/lib/image/detect';
import { assertPixelBudget, validateUploadBytes } from '@/lib/image/validate';
import { parseColor } from '@/lib/image/pipeline';
import { AppError } from '@/lib/errors';
import { asJpeg, asWebp, notAnImage, subjectOnFlatBackground } from './fixtures/images';

const LIMITS = { maxBytes: 1024 * 1024, maxMegapixels: 10 };

describe('detectImageType', () => {
  it('identifies real image formats from their magic bytes', async () => {
    expect(detectImageType(await subjectOnFlatBackground({ width: 32, height: 32 }))).toBe(
      'image/png',
    );
    expect(detectImageType(await asJpeg({ width: 32, height: 32 }))).toBe('image/jpeg');
    expect(detectImageType(await asWebp({ width: 32, height: 32 }))).toBe('image/webp');
  });

  it('identifies GIF, BMP and TIFF even though they are not accepted inputs', () => {
    expect(detectImageType(Buffer.from('GIF89a' + '0'.repeat(20)))).toBe('image/gif');
    expect(isSupportedInputType(detectImageType(Buffer.from('GIF89a' + '0'.repeat(20))))).toBe(
      false,
    );
  });

  it('distinguishes HEIC from AVIF by ftyp brand', () => {
    const makeIso = (brand: string) => {
      const buffer = Buffer.alloc(24);
      buffer.writeUInt32BE(24, 0);
      buffer.write('ftyp', 4, 'ascii');
      buffer.write(brand, 8, 'ascii');
      buffer.write('mif1', 16, 'ascii');
      return buffer;
    };
    expect(detectImageType(makeIso('heic'))).toBe('image/heic');
    expect(detectImageType(makeIso('avif'))).toBe('image/avif');
  });

  it('returns null for content that is not an image', () => {
    expect(detectImageType(notAnImage())).toBeNull();
    expect(detectImageType(Buffer.alloc(4))).toBeNull();
  });

  it('is not fooled by a misleading extension or declared MIME type', async () => {
    // A shell script named .png must still be rejected.
    const disguised = notAnImage();
    expect(() => validateUploadBytes(disguised, 'totally-an-image.png', LIMITS)).toThrow(AppError);
    try {
      validateUploadBytes(disguised, 'totally-an-image.png', LIMITS);
    } catch (error) {
      expect((error as AppError).code).toBe('INVALID_FILE_TYPE');
    }
  });
});

describe('validateUploadBytes', () => {
  it('accepts a supported image within the limits', async () => {
    const data = await subjectOnFlatBackground({ width: 64, height: 64 });
    const result = validateUploadBytes(data, 'photo.png', LIMITS);
    expect(result.mimeType).toBe('image/png');
    expect(result.filename).toBe('photo.png');
    expect(result.byteSize).toBe(data.length);
  });

  it('rejects an empty payload', () => {
    expect(() => validateUploadBytes(Buffer.alloc(0), 'x.png', LIMITS)).toThrowError(
      expect.objectContaining({ code: 'NO_FILE_PROVIDED' }),
    );
  });

  it('rejects a payload over the size limit before decoding it', async () => {
    const data = await subjectOnFlatBackground({ width: 64, height: 64 });
    expect(() => validateUploadBytes(data, 'x.png', { ...LIMITS, maxBytes: 10 })).toThrowError(
      expect.objectContaining({ code: 'FILE_TOO_LARGE' }),
    );
  });
});

describe('assertPixelBudget', () => {
  it('allows an image inside the budget', () => {
    expect(() => assertPixelBudget(2000, 2000, 10)).not.toThrow();
  });

  it('rejects a decompression bomb', () => {
    // 60000 x 60000 = 3.6 gigapixels.
    expect(() => assertPixelBudget(60_000, 60_000, 50)).toThrowError(
      expect.objectContaining({ code: 'IMAGE_TOO_LARGE' }),
    );
  });

  it('rejects missing dimensions as corrupted', () => {
    expect(() => assertPixelBudget(undefined, undefined, 50)).toThrowError(
      expect.objectContaining({ code: 'CORRUPTED_IMAGE' }),
    );
  });
});

describe('sanitizeFilename', () => {
  it.each([
    ['../../etc/passwd', 'passwd'],
    ['..\\..\\windows\\system32\\cmd.exe', 'cmd.exe'],
    ['normal photo.jpg', 'normal photo.jpg'],
    ['...hidden.png', 'hidden.png'],
    ['bad<>:"|?*chars.png', 'badchars.png'],
    ['', 'image'],
  ])('strips path and unsafe characters: %s', (input, expected) => {
    expect(sanitizeFilename(input)).toBe(expected);
  });

  it('clamps very long names', () => {
    expect(sanitizeFilename(`${'a'.repeat(500)}.png`).length).toBeLessThanOrEqual(120);
  });

  it('converts any name to a .png download name', () => {
    expect(toPngFilename('photo.jpeg')).toBe('photo.png');
    expect(toPngFilename('holiday.HEIC')).toBe('holiday.png');
    expect(toPngFilename('no-extension')).toBe('no-extension.png');
  });
});

describe('parseColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255, alpha: 1 }],
    ['#000000', { r: 0, g: 0, b: 0, alpha: 1 }],
    ['ff0000', { r: 255, g: 0, b: 0, alpha: 1 }],
    ['#00ff0080', { r: 0, g: 255, b: 0, alpha: 128 / 255 }],
  ])('parses %s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it('falls back to opaque white for nonsense', () => {
    expect(parseColor('not-a-colour')).toEqual({ r: 255, g: 255, b: 255, alpha: 1 });
  });
});

describe('EXIF orientation', () => {
  it('applies the orientation tag so output dimensions match what users see', async () => {
    const { normalizeImage } = await import('@/lib/image/pipeline');

    // A 200x100 image tagged as rotated 90 degrees should come out 100x200.
    const rotated = await sharp(await subjectOnFlatBackground({ width: 200, height: 100 }))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const normalized = await normalizeImage(rotated, 'image/jpeg', 50);
    expect(normalized.width).toBe(100);
    expect(normalized.height).toBe(200);
  });
});
