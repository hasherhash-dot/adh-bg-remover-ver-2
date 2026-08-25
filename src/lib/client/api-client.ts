import { UPLOAD_LIMITS } from '@/lib/config/public';
import { errorMessageFor, type AppErrorCode } from '@/lib/errors';
import type { BackgroundChoice } from '@/lib/client/types';

/**
 * Browser-side client for the background-removal API.
 *
 * Deliberately thin: it uploads, reads metadata from response headers and
 * turns any failure into a message that is safe to render. Progress is real —
 * it tracks the actual upload via XHR, then switches to an indeterminate
 * "processing" phase because server-side inference has no byte-level progress
 * to report. Nothing here invents a percentage.
 */

export interface ClientProcessedImage {
  blob: Blob;
  objectUrl: string;
  width: number;
  height: number;
  byteSize: number;
  processingTimeMs: number;
  filename: string;
  provider: string;
  source: { width: number; height: number };
}

export class ApiError extends Error {
  constructor(
    readonly code: AppErrorCode | 'NETWORK_ERROR' | 'ABORTED',
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type UploadPhase = 'uploading' | 'processing' | 'done';

export interface RemoveBackgroundParams {
  file: File | Blob;
  filename: string;
  background?: BackgroundChoice;
  signal?: AbortSignal;
  /** `uploadRatio` is genuine byte progress; it is undefined while processing. */
  onPhase?: (phase: UploadPhase, uploadRatio?: number) => void;
}

export async function removeBackground(
  params: RemoveBackgroundParams,
): Promise<ClientProcessedImage> {
  const form = new FormData();
  form.append('image', params.file, params.filename);

  const background = params.background ?? { type: 'transparent' };
  form.append('background', background.type);
  if (background.type === 'color') form.append('backgroundColor', background.color);
  if (background.type === 'image') form.append('backgroundImage', background.file);

  const response = await uploadWithProgress('/api/remove-background', form, params);

  const blob = response.blob;
  const header = (name: string, fallback = 0) => Number(response.headers.get(name) ?? fallback);

  return {
    blob,
    objectUrl: URL.createObjectURL(blob),
    width: header('X-Image-Width'),
    height: header('X-Image-Height'),
    byteSize: header('X-Image-Bytes', blob.size) || blob.size,
    processingTimeMs: header('X-Processing-Time-Ms'),
    provider: response.headers.get('X-Provider') ?? 'unknown',
    filename: filenameFromDisposition(response.headers.get('Content-Disposition')) ??
      replaceExtension(params.filename),
    source: {
      width: header('X-Source-Width'),
      height: header('X-Source-Height'),
    },
  };
}

/**
 * XHR rather than fetch: fetch still cannot report upload progress in any
 * shipping browser, and on a slow connection a 20MB upload with no feedback is
 * the single worst part of the experience.
 */
function uploadWithProgress(
  url: string,
  form: FormData,
  params: Pick<RemoveBackgroundParams, 'signal' | 'onPhase'>,
): Promise<{ blob: Blob; headers: Headers }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'blob';

    params.onPhase?.('uploading', 0);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        params.onPhase?.('uploading', event.loaded / event.total);
      }
    });

    xhr.upload.addEventListener('load', () => {
      // Bytes are delivered; everything after this is server-side work.
      params.onPhase?.('processing');
    });

    xhr.addEventListener('load', async () => {
      const headers = parseHeaders(xhr.getAllResponseHeaders());
      const body = xhr.response as Blob;

      if (xhr.status >= 200 && xhr.status < 300) {
        params.onPhase?.('done');
        resolve({ blob: body, headers });
        return;
      }
      reject(await errorFromBlob(body, xhr.status));
    });

    xhr.addEventListener('error', () => {
      reject(
        new ApiError(
          'NETWORK_ERROR',
          'We could not reach the server. Check your connection and try again.',
          true,
        ),
      );
    });

    xhr.addEventListener('timeout', () => {
      reject(new ApiError('PROCESSING_TIMEOUT', errorMessageFor('PROCESSING_TIMEOUT'), true));
    });

    xhr.addEventListener('abort', () => {
      reject(new ApiError('ABORTED', 'Cancelled.', false));
    });

    params.signal?.addEventListener('abort', () => xhr.abort(), { once: true });

    // Generous: a large image on a slow uplink plus inference.
    xhr.timeout = 180_000;
    xhr.send(form);
  });
}

/**
 * Turns a failed response into a message that names the *right* culprit.
 *
 * Our own errors are a JSON envelope and carry their own wording. Anything else
 * — a proxy page, a dev-server overlay mid-recompile, a truncated body — used
 * to be reported as "something went wrong on our side", which is both vague and
 * frequently untrue: the usual cause is a server that is restarting or briefly
 * unreachable, and the fix is simply to try again.
 */
export async function errorFromResponseBody(text: string, status: number): Promise<ApiError> {
  try {
    const parsed = JSON.parse(text) as {
      error?: { code: AppErrorCode; message: string; retryable: boolean };
    };
    if (parsed.error?.message) {
      return new ApiError(parsed.error.code, parsed.error.message, parsed.error.retryable);
    }
  } catch {
    // Not our envelope — fall through and classify by status.
  }

  if (status === 413) {
    return new ApiError('FILE_TOO_LARGE', errorMessageFor('FILE_TOO_LARGE'), false);
  }
  if (status === 429) {
    return new ApiError('RATE_LIMITED', errorMessageFor('RATE_LIMITED'), true);
  }
  // 0 means the connection died before a status arrived.
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    return new ApiError(
      'PROVIDER_UNAVAILABLE',
      'The server is temporarily unavailable — it may be restarting. Please try again in a moment.',
      true,
    );
  }
  if (status >= 500) {
    return new ApiError('INTERNAL_ERROR', errorMessageFor('INTERNAL_ERROR'), true);
  }
  return new ApiError(
    'INTERNAL_ERROR',
    'The server sent back something we did not expect. Please try again.',
    true,
  );
}

async function errorFromBlob(body: Blob, status: number): Promise<ApiError> {
  const text = await body.text().catch(() => '');
  return errorFromResponseBody(text, status);
}

function parseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    const index = line.indexOf(':');
    if (index > 0) {
      headers.append(line.slice(0, index).trim(), line.slice(index + 1).trim());
    }
  }
  return headers;
}

function filenameFromDisposition(value: string | null): string | null {
  const match = value?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? null;
}

function replaceExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return `${dot > 0 ? filename.slice(0, dot) : filename}.png`;
}

/** Client-side pre-flight so obvious problems never reach the network. */
export function validateFile(file: File): { ok: true } | { ok: false; message: string } {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const typeOk =
    (UPLOAD_LIMITS.acceptedMimeTypes as readonly string[]).includes(file.type) ||
    (UPLOAD_LIMITS.acceptedExtensions as readonly string[]).includes(extension);

  if (!typeOk) {
    return {
      ok: false,
      message: 'That file is not a supported image. Use a JPG, PNG, WEBP or HEIC file.',
    };
  }
  if (file.size > UPLOAD_LIMITS.maxFileSizeBytes) {
    const limitMb = Math.round(UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024));
    return {
      ok: false,
      message: `That image is too large. Try an image under ${limitMb} MB.`,
    };
  }
  if (file.size === 0) {
    return { ok: false, message: 'That file is empty.' };
  }
  return { ok: true };
}
