/**
 * Application error taxonomy.
 *
 * Every failure the user can hit is represented by an `AppErrorCode`. Each code
 * maps to a status, a human-readable message and whether retrying makes sense.
 * Raw exception messages and stack traces never reach the client — the API
 * serialiser only emits the fields defined here.
 */

export const ERROR_CODES = [
  'INVALID_FILE_TYPE',
  'FILE_TOO_LARGE',
  'IMAGE_TOO_LARGE',
  'CORRUPTED_IMAGE',
  'NO_FILE_PROVIDED',
  'BATCH_TOO_LARGE',
  'PROCESSING_FAILED',
  'PROCESSING_TIMEOUT',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_MISCONFIGURED',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'QUOTA_EXCEEDED',
  'NOT_FOUND',
  'NOT_IMPLEMENTED',
  'INTERNAL_ERROR',
] as const;

export type AppErrorCode = (typeof ERROR_CODES)[number];

interface ErrorDefinition {
  status: number;
  /** Shown directly to the user. Must be plain language, never technical. */
  message: string;
  /** Whether the UI should offer a "Try again" affordance. */
  retryable: boolean;
}

const ERROR_DEFINITIONS: Record<AppErrorCode, ErrorDefinition> = {
  INVALID_FILE_TYPE: {
    status: 415,
    message: "That file isn't a supported image. Try a JPG, PNG, WEBP or HEIC file.",
    retryable: false,
  },
  FILE_TOO_LARGE: {
    status: 413,
    message: 'That image is too large. Please upload a smaller file.',
    retryable: false,
  },
  IMAGE_TOO_LARGE: {
    status: 413,
    message: 'That image has too many pixels to process safely. Try a smaller version.',
    retryable: false,
  },
  CORRUPTED_IMAGE: {
    status: 422,
    message: "We couldn't read this image. It may be damaged or incomplete.",
    retryable: false,
  },
  NO_FILE_PROVIDED: {
    status: 400,
    message: 'No image was received. Please choose a file and try again.',
    retryable: false,
  },
  BATCH_TOO_LARGE: {
    status: 413,
    message: 'Too many images in one request. Please upload fewer images at a time.',
    retryable: false,
  },
  PROCESSING_FAILED: {
    status: 500,
    message: 'Something went wrong while processing this image. Please try again.',
    retryable: true,
  },
  PROCESSING_TIMEOUT: {
    status: 504,
    message: 'This image took too long to process. Please try again.',
    retryable: true,
  },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    message: 'Background removal is temporarily unavailable. Please try again shortly.',
    retryable: true,
  },
  PROVIDER_MISCONFIGURED: {
    status: 500,
    message: 'Background removal is not configured correctly on this server.',
    retryable: false,
  },
  RATE_LIMITED: {
    status: 429,
    message: "You're going a little fast. Please wait a moment and try again.",
    retryable: true,
  },
  UNAUTHORIZED: {
    status: 401,
    message: 'This request needs a valid API key.',
    retryable: false,
  },
  QUOTA_EXCEEDED: {
    status: 402,
    message: "You've used all the images included in your plan this month.",
    retryable: false,
  },
  NOT_FOUND: { status: 404, message: 'We could not find what you were looking for.', retryable: false },
  NOT_IMPLEMENTED: {
    status: 501,
    message: 'This feature is not enabled on this deployment.',
    retryable: false,
  },
  INTERNAL_ERROR: {
    status: 500,
    message: 'Something went wrong on our side. Please try again.',
    retryable: true,
  },
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  /** Safe to render in the UI. */
  readonly userMessage: string;
  readonly retryable: boolean;
  /** Server-side only diagnostic detail. Never serialised to the client. */
  readonly detail?: string;

  constructor(code: AppErrorCode, options: { detail?: string; cause?: unknown } = {}) {
    const def = ERROR_DEFINITIONS[code];
    super(`${code}: ${options.detail ?? def.message}`, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = def.status;
    this.userMessage = def.message;
    this.retryable = def.retryable;
    if (options.detail !== undefined) this.detail = options.detail;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.userMessage,
      retryable: this.retryable,
    };
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Normalises anything thrown anywhere in the stack into an AppError so the API
 * layer has exactly one shape to serialise.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  if (error instanceof Error) {
    if (error.name === 'AbortError' || /timeout/i.test(error.message)) {
      return new AppError('PROCESSING_TIMEOUT', { cause: error, detail: error.message });
    }
    return new AppError('INTERNAL_ERROR', { cause: error, detail: error.message });
  }
  return new AppError('INTERNAL_ERROR', { detail: String(error) });
}

export function errorMessageFor(code: AppErrorCode): string {
  return ERROR_DEFINITIONS[code].message;
}
