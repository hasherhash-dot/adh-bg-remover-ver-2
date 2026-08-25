import 'server-only';
import sharp, { type Sharp } from 'sharp';
import { AppError } from '@/lib/errors';
import type { BackgroundFill, ImageDimensions } from '@/lib/bg-removal/types';
import { assertPixelBudget } from './validate';
import { requiresHeicDecode, type DetectedImageType } from './detect';

/**
 * All raster work happens here. Two rules hold throughout:
 *
 * 1. The model never dictates output resolution. Inference runs on a bounded
 *    downscale; the resulting alpha mask is scaled back up and composited onto
 *    the untouched original, so a 48MP source yields a 48MP cutout.
 * 2. Buffers are released as soon as possible. Nothing keeps more than one
 *    full-resolution raster alive at a time.
 */

// sharp caches decoded images across calls; in a request-per-image server that
// only inflates RSS. Concurrency is bounded so a batch cannot saturate the box.
sharp.cache(false);
sharp.concurrency(4);

export interface NormalizedImage {
  /** EXIF-rotated, colour-managed original at full resolution. */
  buffer: Buffer;
  width: number;
  height: number;
  hasAlpha: boolean;
}

/**
 * Decodes any supported input into something sharp can work with, applying EXIF
 * orientation so downstream coordinates match what the user sees.
 */
export async function normalizeImage(
  data: Buffer,
  mimeType: DetectedImageType,
  maxMegapixels: number,
): Promise<NormalizedImage> {
  let source = data;

  if (requiresHeicDecode(mimeType)) {
    source = await decodeHeic(data);
  }

  const limitInputPixels = maxMegapixels * 1_000_000;

  try {
    const metadata = await sharp(source, { failOn: 'error', limitInputPixels }).metadata();
    assertPixelBudget(metadata.width, metadata.height, maxMegapixels);

    // rotate() with no argument bakes in EXIF orientation and drops the tag.
    const buffer = await sharp(source, { limitInputPixels })
      .rotate()
      .toColourspace('srgb')
      .png({ compressionLevel: 0 })
      .toBuffer();

    const rotated = await sharp(buffer).metadata();
    assertPixelBudget(rotated.width, rotated.height, maxMegapixels);

    return {
      buffer,
      width: rotated.width as number,
      height: rotated.height as number,
      hasAlpha: rotated.hasAlpha ?? false,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('CORRUPTED_IMAGE', { cause: error });
  }
}

/**
 * HEIC/HEIF are not compiled into the prebuilt libvips binaries shipped with
 * sharp, so they go through a pure-JS decoder first.
 */
async function decodeHeic(data: Buffer): Promise<Buffer> {
  try {
    const mod = (await import('heic-decode')) as unknown as {
      default: (input: { buffer: Uint8Array }) => Promise<{
        width: number;
        height: number;
        data: Uint8ClampedArray;
      }>;
    };
    const { width, height, data: rgba } = await mod.default({ buffer: new Uint8Array(data) });
    return await sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), {
      raw: { width, height, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
  } catch (error) {
    throw new AppError('CORRUPTED_IMAGE', { cause: error, detail: 'HEIC decode failed' });
  }
}

/**
 * Produces the RGBA PNG handed to the model: downscaled to `inferenceSize` on
 * its longest edge, never upscaled.
 */
export async function prepareForInference(
  image: NormalizedImage,
  inferenceSize: number,
): Promise<{ buffer: Buffer; dimensions: ImageDimensions }> {
  const buffer = await sharp(image.buffer)
    .resize(inferenceSize, inferenceSize, { fit: 'inside', withoutEnlargement: true })
    // The model requires 4 channels; a JPEG source decodes to 3.
    .ensureAlpha()
    .png({ compressionLevel: 3 })
    .toBuffer();

  const meta = await sharp(buffer).metadata();
  return {
    buffer,
    dimensions: { width: meta.width as number, height: meta.height as number },
  };
}

/**
 * Guarantees a raw buffer really is one byte per pixel.
 *
 * sharp does not promise that a single-band input stays single-band through a
 * pipeline: `sharp(raw, { channels: 1 }).resize(...).raw()` returns THREE bytes
 * per pixel, because the resize runs in sRGB and the band is replicated. Left
 * unchecked, the caller reads the buffer sequentially and every output pixel
 * receives mask byte `i` instead of mask pixel `i` — the mask is stretched
 * along raster order and the cutout comes out diagonally sheared, with large
 * parts of the subject wrongly transparent.
 *
 * A length check alone is not enough either: the buffer is *larger* than
 * expected, so a `length < expected` guard passes.
 *
 * All replicated bands hold identical values, so de-interleaving is exact and
 * lossless. Anything that is not a whole number of bands is a real corruption
 * and throws.
 */
function asSingleChannel(
  buffer: Buffer,
  width: number,
  height: number,
  label: string,
): Buffer {
  const expected = width * height;
  if (buffer.length === expected) return buffer;

  if (buffer.length % expected !== 0) {
    throw new AppError('PROCESSING_FAILED', {
      detail: `${label}: ${buffer.length} bytes is not a whole multiple of ${expected} (${width}x${height})`,
    });
  }

  const channels = buffer.length / expected;
  const flattened = Buffer.allocUnsafe(expected);
  for (let i = 0, source = 0; i < expected; i += 1, source += channels) {
    flattened[i] = buffer[source] as number;
  }
  return flattened;
}

/** Pulls the alpha channel out of an RGBA PNG as a single-channel raster. */
export async function extractAlpha(
  png: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const meta = await sharp(png).metadata();
  if (!meta.hasAlpha) {
    throw new AppError('PROCESSING_FAILED', {
      detail: 'provider returned an image without an alpha channel',
    });
  }

  const width = meta.width as number;
  const height = meta.height as number;
  const raw = await sharp(png).extractChannel(3).toColourspace('b-w').raw().toBuffer();

  return { data: asSingleChannel(raw, width, height, 'extracted alpha'), width, height };
}

/**
 * Scales a mask to the target size, guaranteeing one byte per pixel out.
 *
 * `mitchell` rather than `lanczos3`: a segmentation mask is close to binary, and
 * lanczos overshoots at hard edges. That ringing shows up as a bright halo just
 * outside the silhouette and a dark bite just inside it — visible fringing on
 * exactly the boundary users scrutinise. Mitchell is built to suppress ringing
 * while staying sharper than bilinear.
 */
export async function resizeMask(
  mask: { data: Buffer; width: number; height: number },
  width: number,
  height: number,
): Promise<Buffer> {
  if (mask.width === width && mask.height === height) {
    return asSingleChannel(mask.data, width, height, 'mask');
  }

  const resized = await sharp(mask.data, {
    raw: { width: mask.width, height: mask.height, channels: 1 },
  })
    .resize(width, height, { fit: 'fill', kernel: 'mitchell' })
    // Without this the band is replicated to sRGB and comes back 3 bytes/px.
    .toColourspace('b-w')
    .raw()
    .toBuffer();

  return asSingleChannel(resized, width, height, 'resized mask');
}

/**
 * Composites a mask onto the original at full resolution.
 *
 * Implemented as an explicit RGBA interleave rather than sharp.joinChannel:
 * joinChannel silently discards the joined band for raw single-channel input in
 * sharp 0.35, producing a fully opaque image. The manual loop is also cheaper
 * than a second decode/encode round-trip.
 *
 * Both input rasters are checked for EXACT length before the loop. Interleaving
 * is a stride-sensitive operation: a buffer with one extra band does not fail,
 * it silently shifts every subsequent pixel and shears the result.
 *
 * @returns RGBA raster plus the fraction of non-opaque pixels.
 */
export async function compositeMask(
  image: NormalizedImage,
  mask: { data: Buffer; width: number; height: number },
): Promise<{ rgba: Buffer; width: number; height: number; backgroundRatio: number }> {
  const { width, height } = image;
  const pixels = width * height;

  const alpha = await resizeMask(mask, width, height);
  const rgb = asExactChannels(
    await sharp(image.buffer).removeAlpha().toColourspace('srgb').raw().toBuffer(),
    pixels,
    3,
    'source rgb',
  );

  if (alpha.length !== pixels) {
    throw new AppError('PROCESSING_FAILED', {
      detail: `alpha raster is ${alpha.length} bytes, expected ${pixels}`,
    });
  }

  const rgba = Buffer.allocUnsafe(pixels * 4);
  let transparentish = 0;
  for (let i = 0, j = 0, k = 0; i < pixels; i += 1, j += 3, k += 4) {
    rgba[k] = rgb[j] as number;
    rgba[k + 1] = rgb[j + 1] as number;
    rgba[k + 2] = rgb[j + 2] as number;
    const a = alpha[i] as number;
    rgba[k + 3] = a;
    if (a < 250) transparentish += 1;
  }

  return { rgba, width, height, backgroundRatio: transparentish / pixels };
}

/** Asserts a raw buffer has exactly the expected number of interleaved bands. */
function asExactChannels(
  buffer: Buffer,
  pixels: number,
  channels: number,
  label: string,
): Buffer {
  if (buffer.length !== pixels * channels) {
    throw new AppError('PROCESSING_FAILED', {
      detail: `${label}: ${buffer.length} bytes, expected ${pixels * channels} (${channels} channels)`,
    });
  }
  return buffer;
}

/**
 * Applies the requested background treatment to an RGBA raster and encodes it.
 * Transparent output is always PNG; a filled background may be encoded as JPEG
 * since there is no alpha left to preserve.
 */
export async function renderResult(
  rgba: Buffer,
  dimensions: ImageDimensions,
  fill: BackgroundFill = { type: 'transparent' },
  format: 'png' | 'jpeg' | 'webp' = 'png',
): Promise<{ data: Buffer; mimeType: 'image/png' | 'image/jpeg' | 'image/webp' }> {
  const { width, height } = dimensions;
  const cutoutPng = await sharp(rgba, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 1 })
    .toBuffer();

  let composed: Sharp;
  switch (fill.type) {
    case 'transparent':
      composed = sharp(cutoutPng);
      break;
    case 'color':
      composed = sharp({
        create: { width, height, channels: 4, background: parseColor(fill.color) },
      }).composite([{ input: cutoutPng, blend: 'over' }]);
      break;
    case 'image': {
      const background = await sharp(fill.data)
        .rotate()
        .resize(width, height, { fit: fill.fit ?? 'cover', position: 'centre' })
        .toColourspace('srgb')
        .png({ compressionLevel: 1 })
        .toBuffer();
      composed = sharp(background).composite([{ input: cutoutPng, blend: 'over' }]);
      break;
    }
  }

  if (format === 'jpeg') {
    return {
      data: await composed
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer(),
      mimeType: 'image/jpeg',
    };
  }
  if (format === 'webp') {
    return { data: await composed.webp({ quality: 92 }).toBuffer(), mimeType: 'image/webp' };
  }
  return {
    data: await composed.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer(),
    mimeType: 'image/png',
  };
}

/** Accepts #rgb, #rgba, #rrggbb and #rrggbbaa. Falls back to opaque white. */
export function parseColor(input: string): { r: number; g: number; b: number; alpha: number } {
  const hex = input.trim().replace(/^#/, '');
  const expand = (s: string) => parseInt(s + s, 16);

  if (/^[0-9a-f]{3,4}$/i.test(hex)) {
    return {
      r: expand(hex[0] as string),
      g: expand(hex[1] as string),
      b: expand(hex[2] as string),
      alpha: hex.length === 4 ? expand(hex[3] as string) / 255 : 1,
    };
  }
  if (/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(hex)) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      alpha: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  return { r: 255, g: 255, b: 255, alpha: 1 };
}
