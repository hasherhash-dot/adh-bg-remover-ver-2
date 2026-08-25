import { AppError } from '@/lib/errors';
import {
  detectImageType,
  isSupportedInputType,
  sanitizeFilename,
  type DetectedImageType,
} from './detect';

export interface ValidationLimits {
  maxBytes: number;
  maxMegapixels: number;
}

export interface ValidatedUpload {
  data: Buffer;
  mimeType: DetectedImageType;
  filename: string;
  byteSize: number;
}

/**
 * Validates raw upload bytes.
 *
 * Order matters: size is checked before decoding so an oversized payload never
 * reaches an image decoder, and the type is derived from content rather than
 * from the `Content-Type` the client claimed.
 *
 * @throws AppError with a user-safe code
 */
export function validateUploadBytes(
  data: Buffer,
  declaredName: string,
  limits: ValidationLimits,
): ValidatedUpload {
  if (data.length === 0) {
    throw new AppError('NO_FILE_PROVIDED', { detail: 'empty buffer' });
  }
  if (data.length > limits.maxBytes) {
    throw new AppError('FILE_TOO_LARGE', {
      detail: `${data.length} bytes exceeds limit of ${limits.maxBytes}`,
    });
  }

  const detected = detectImageType(data);
  if (!isSupportedInputType(detected)) {
    throw new AppError('INVALID_FILE_TYPE', {
      detail: `detected type: ${detected ?? 'unknown'}`,
    });
  }

  return {
    data,
    mimeType: detected,
    filename: sanitizeFilename(declaredName),
    byteSize: data.length,
  };
}

/**
 * Guards against decompression bombs: a small file can declare enormous
 * dimensions, so pixel count is checked after the header is parsed but before
 * the full raster is materialised.
 */
export function assertPixelBudget(
  width: number | undefined,
  height: number | undefined,
  maxMegapixels: number,
): asserts width is number {
  if (!width || !height || width < 1 || height < 1) {
    throw new AppError('CORRUPTED_IMAGE', { detail: 'missing image dimensions' });
  }
  const megapixels = (width * height) / 1_000_000;
  if (megapixels > maxMegapixels) {
    throw new AppError('IMAGE_TOO_LARGE', {
      detail: `${megapixels.toFixed(1)}MP exceeds ${maxMegapixels}MP`,
    });
  }
}
