import { getSettings } from './settings';

/**
 * Client for the ADH API.
 *
 * The extension ships no credentials. It calls whatever deployment the user
 * configured, attaching the user's own key only if they entered one. Error
 * bodies from the API are already written for end users, so they are surfaced
 * as-is rather than being re-worded here.
 */

export interface RemoveResult {
  blob: Blob;
  width: number;
  height: number;
  byteSize: number;
  processingTimeMs: number;
  filename: string;
}

export class ExtensionApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ExtensionApiError';
  }
}

export async function removeBackground(
  file: Blob,
  filename: string,
  signal?: AbortSignal,
): Promise<RemoveResult> {
  const settings = await getSettings();

  const form = new FormData();
  form.append('image', file, filename);

  const headers: Record<string, string> = {};
  if (settings.apiKey) headers.Authorization = `Bearer ${settings.apiKey}`;

  let response: Response;
  try {
    response = await fetch(`${settings.apiBaseUrl}/api/remove-background`, {
      method: 'POST',
      body: form,
      headers,
      signal,
    });
  } catch (error) {
    throw new ExtensionApiError(
      `Could not reach ${settings.apiBaseUrl}. Check the server address in the extension options.`,
      true,
    );
  }

  if (!response.ok) {
    throw new ExtensionApiError(await readErrorMessage(response), response.status >= 500);
  }

  const blob = await response.blob();
  const header = (name: string) => Number(response.headers.get(name) ?? 0);

  return {
    blob,
    width: header('X-Image-Width'),
    height: header('X-Image-Height'),
    byteSize: header('X-Image-Bytes') || blob.size,
    processingTimeMs: header('X-Processing-Time-Ms'),
    filename: toPngName(filename),
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const parsed = (await response.json()) as { error?: { message?: string } };
    if (parsed.error?.message) return parsed.error.message;
  } catch {
    // Not JSON — fall through.
  }
  if (response.status === 404) {
    return 'The server address is reachable but has no background remover at that path.';
  }
  return 'The server could not process that image.';
}

/**
 * Fetches an image the user right-clicked.
 *
 * This uses the extension's host permissions, which the user granted at
 * install. It does not defeat any site protection: a server that refuses the
 * request still refuses it, and that refusal is reported plainly instead of
 * being worked around.
 */
export async function fetchImage(
  url: string,
): Promise<{ blob: Blob; filename: string }> {
  if (url.startsWith('data:')) {
    const blob = await (await fetch(url)).blob();
    return { blob, filename: `image.${extensionForType(blob.type)}` };
  }

  let response: Response;
  try {
    response = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
  } catch {
    throw new ExtensionApiError(
      'This site would not allow the image to be downloaded. Save it to your device and use the extension popup instead.',
      false,
    );
  }

  if (!response.ok) {
    throw new ExtensionApiError(
      `The image could not be downloaded (${response.status}). Try saving it and uploading through the popup.`,
      false,
    );
  }

  const blob = await response.blob();
  if (!blob.type.startsWith('image/') && blob.type !== '') {
    throw new ExtensionApiError('That link does not point to an image.', false);
  }

  return { blob, filename: filenameFromUrl(url, blob.type) };
}

function filenameFromUrl(url: string, mimeType: string): string {
  try {
    const pathname = new URL(url).pathname;
    const base = decodeURIComponent(pathname.split('/').pop() ?? '');
    const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 80);
    if (cleaned && /\.[a-z0-9]{2,5}$/i.test(cleaned)) return cleaned;
    if (cleaned) return `${cleaned}.${extensionForType(mimeType)}`;
  } catch {
    // Fall through to the generic name.
  }
  return `image.${extensionForType(mimeType)}`;
}

function extensionForType(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/heic': 'heic',
  };
  return map[mimeType] ?? 'png';
}

/**
 * Names a downloaded cutout: `photo.jpg` -> `photo-no-background.png`.
 *
 * Matches the web app exactly, so the same image saved from either surface
 * lands with the same name. The suffix never stacks on a repeat download, and
 * the original extension never survives into the name of a PNG.
 */
export function toPngName(filename: string): string {
  const suffix = '-no-background';
  const dot = filename.lastIndexOf('.');
  const stem = (dot > 0 ? filename.slice(0, dot) : filename).trim() || 'image';
  const deduped = stem.endsWith(suffix) ? stem : `${stem}${suffix}`;
  return `${deduped}.png`;
}
