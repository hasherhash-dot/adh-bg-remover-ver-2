/**
 * Configuration that is safe to ship to the browser.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, so these must be
 * referenced as full static property accesses rather than dynamic lookups.
 */

export const publicConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  analyticsDriver: process.env.NEXT_PUBLIC_ANALYTICS_DRIVER ?? 'none',
  analyticsEndpoint: process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT ?? '',
} as const;

/**
 * Client-side upload constraints. The server re-validates every one of these —
 * these values exist purely so the UI can fail fast and give better messages.
 */
export const UPLOAD_LIMITS = {
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxBatchFiles: 20,
  acceptedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ] as const,
  acceptedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'] as const,
} as const;

export const ACCEPT_ATTRIBUTE = [
  ...UPLOAD_LIMITS.acceptedMimeTypes,
  ...UPLOAD_LIMITS.acceptedExtensions,
].join(',');
