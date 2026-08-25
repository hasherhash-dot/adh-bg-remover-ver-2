import 'server-only';
import { AppError } from '@/lib/errors';
import { maxUploadBytes, serverEnv } from '@/lib/config/env';
import type { BackgroundFill } from '@/lib/bg-removal/types';
import { sanitizeFilename } from '@/lib/image/detect';

/**
 * Multipart parsing shared by the single and batch endpoints.
 *
 * Every size check happens before the bytes are materialised into a Buffer, so
 * an oversized upload is rejected without being fully copied into memory.
 */

export interface ParsedImagePart {
  data: Buffer;
  filename: string;
}

export interface ParsedRequest {
  images: ParsedImagePart[];
  background: BackgroundFill;
  format: 'png' | 'jpeg' | 'webp';
  /** `binary` streams the image back; `json` wraps it as base64 with metadata. */
  responseMode: 'binary' | 'json';
}

const MAX_BACKGROUND_IMAGE_BYTES = 15 * 1024 * 1024;

export async function parseImageRequest(
  request: Request,
  options: { multiple?: boolean } = {},
): Promise<ParsedRequest> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('multipart/form-data')) {
    throw new AppError('NO_FILE_PROVIDED', {
      detail: `expected multipart/form-data, received "${contentType || 'nothing'}"`,
    });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    throw new AppError('NO_FILE_PROVIDED', { cause: error, detail: 'malformed multipart body' });
  }

  const limit = maxUploadBytes();
  const entries = [...form.getAll('image'), ...form.getAll('images')].filter(
    (entry): entry is File => entry instanceof File,
  );

  if (entries.length === 0) {
    throw new AppError('NO_FILE_PROVIDED');
  }

  const maxBatch = serverEnv().MAX_BATCH_SIZE;
  if (!options.multiple && entries.length > 1) {
    throw new AppError('BATCH_TOO_LARGE', {
      detail: 'this endpoint accepts one image; use /api/batch/remove-background',
    });
  }
  if (entries.length > maxBatch) {
    throw new AppError('BATCH_TOO_LARGE', { detail: `${entries.length} > ${maxBatch}` });
  }

  const images: ParsedImagePart[] = [];
  for (const file of entries) {
    if (file.size > limit) {
      throw new AppError('FILE_TOO_LARGE', { detail: `${file.name}: ${file.size} > ${limit}` });
    }
    images.push({
      data: Buffer.from(await file.arrayBuffer()),
      filename: sanitizeFilename(file.name || 'image'),
    });
  }

  return {
    images,
    background: await parseBackground(form),
    format: parseFormat(form.get('format')),
    responseMode: form.get('response') === 'json' ? 'json' : 'binary',
  };
}

async function parseBackground(form: FormData): Promise<BackgroundFill> {
  const type = String(form.get('background') ?? 'transparent');

  if (type === 'color') {
    const color = String(form.get('backgroundColor') ?? '#ffffff');
    if (!/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color.trim())) {
      throw new AppError('INVALID_FILE_TYPE', { detail: `invalid colour "${color}"` });
    }
    return { type: 'color', color };
  }

  if (type === 'image') {
    const file = form.get('backgroundImage');
    if (!(file instanceof File)) {
      throw new AppError('NO_FILE_PROVIDED', { detail: 'backgroundImage part is missing' });
    }
    if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
      throw new AppError('FILE_TOO_LARGE', { detail: 'background image too large' });
    }
    return { type: 'image', data: Buffer.from(await file.arrayBuffer()) };
  }

  return { type: 'transparent' };
}

function parseFormat(value: FormDataEntryValue | null): 'png' | 'jpeg' | 'webp' {
  const format = String(value ?? 'png');
  return format === 'jpeg' || format === 'webp' ? format : 'png';
}
