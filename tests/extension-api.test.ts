import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests the extension's API client against a stubbed `chrome` global.
 *
 * The extension is a separate build sharing no bundler with the app, so the
 * risk worth covering is the contract: does it send what the API expects, and
 * does it turn failures into messages a user can act on?
 */

const storage = new Map<string, unknown>();

/** Reads the headers from one recorded fetch call. */
function headersOfCall(mock: ReturnType<typeof vi.fn>, index: number): Record<string, string> {
  const call = mock.mock.calls[index];
  if (!call) throw new Error(`No fetch call recorded at index ${index}`);
  const init = call[1] as RequestInit | undefined;
  return (init?.headers ?? {}) as Record<string, string>;
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: storage.get(key) }),
        set: async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) storage.set(key, value);
        },
        remove: async (key: string) => void storage.delete(key),
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('extension settings', () => {
  it('normalises server addresses and rejects unusable ones', async () => {
    const { normalizeBaseUrl, DEFAULT_SETTINGS } = await import('../extension/src/lib/settings');

    expect(normalizeBaseUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(normalizeBaseUrl('  https://adh.example.com//  ')).toBe('https://adh.example.com');
    expect(normalizeBaseUrl('https://adh.example.com/base/')).toBe('https://adh.example.com/base');
    // A javascript: URL must never become the request target.
    expect(normalizeBaseUrl('javascript:alert(1)')).toBe(DEFAULT_SETTINGS.apiBaseUrl);
    expect(normalizeBaseUrl('not a url')).toBe(DEFAULT_SETTINGS.apiBaseUrl);
    expect(normalizeBaseUrl('')).toBe(DEFAULT_SETTINGS.apiBaseUrl);
  });

  it('defaults to no API key, so nothing is shipped with the extension', async () => {
    const { getSettings } = await import('../extension/src/lib/settings');
    expect((await getSettings()).apiKey).toBe('');
  });

  it('caps the recents list', async () => {
    const { addRecent, getRecents } = await import('../extension/src/lib/settings');

    for (let i = 0; i < 10; i += 1) {
      await addRecent({
        jobId: `job-${i}`,
        filename: `f-${i}.png`,
        createdAt: Date.now() + i,
        thumbnail: '',
      });
    }

    const recents = await getRecents();
    expect(recents.length).toBeLessThanOrEqual(6);
    expect(recents[0]?.jobId).toBe('job-9');
  });
});

describe('extension API client', () => {
  it('posts the image as multipart and reads metadata from headers', async () => {
    const { removeBackground } = await import('../extension/src/lib/api');

    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const form = init.body as FormData;
      expect(form.get('image')).toBeInstanceOf(Blob);
      return new Response(png, {
        status: 200,
        headers: {
          'X-Image-Width': '800',
          'X-Image-Height': '600',
          'X-Image-Bytes': '12345',
          'X-Processing-Time-Ms': '2400',
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await removeBackground(png, 'photo.jpg');

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3000/api/remove-background');
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(result.processingTimeMs).toBe(2400);
    // Same naming convention as the web app, so a file saved from either
    // surface lands identically.
    expect(result.filename).toBe('photo-no-background.png');
  });

  it('names downloads consistently and never stacks the suffix', async () => {
    const { toPngName } = await import('../extension/src/lib/api');

    expect(toPngName('photo.jpg')).toBe('photo-no-background.png');
    expect(toPngName('holiday.HEIC')).toBe('holiday-no-background.png');
    expect(toPngName('no-extension')).toBe('no-extension-no-background.png');
    // Re-processing an already-processed file must not double the suffix.
    expect(toPngName('photo-no-background.png')).toBe('photo-no-background.png');
  });

  it('attaches the user key only when one is configured', async () => {
    const { saveSettings } = await import('../extension/src/lib/settings');
    const { removeBackground } = await import('../extension/src/lib/api');

    const fetchMock = vi.fn(
      async () => new Response(new Blob([new Uint8Array([1])]), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await removeBackground(new Blob([new Uint8Array([1])]), 'a.png');
    expect(headersOfCall(fetchMock, 0).Authorization).toBeUndefined();

    await saveSettings({ apiKey: 'adh_live_secret' });
    await removeBackground(new Blob([new Uint8Array([1])]), 'b.png');
    expect(headersOfCall(fetchMock, 1).Authorization).toBe('Bearer adh_live_secret');
  });

  it('surfaces the API error message rather than a status code', async () => {
    const { removeBackground } = await import('../extension/src/lib/api');

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              error: {
                code: 'FILE_TOO_LARGE',
                message: 'That image is too large. Please upload a smaller file.',
                retryable: false,
              },
            }),
            { status: 413, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );

    await expect(removeBackground(new Blob([new Uint8Array([1])]), 'big.png')).rejects.toThrow(
      /too large/i,
    );
  });

  it('explains an unreachable server instead of leaking a network error', async () => {
    const { removeBackground } = await import('../extension/src/lib/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(removeBackground(new Blob([new Uint8Array([1])]), 'a.png')).rejects.toThrow(
      /Could not reach http:\/\/localhost:3000/,
    );
  });

  it('reports a blocked image download without pretending to work around it', async () => {
    const { fetchImage } = await import('../extension/src/lib/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(fetchImage('https://example.com/photo.jpg')).rejects.toThrow(
      /would not allow the image to be downloaded/i,
    );
  });

  it('derives a sensible filename from an image URL', async () => {
    const { fetchImage } = await import('../extension/src/lib/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(new Blob([new Uint8Array([1])], { type: 'image/jpeg' }), { status: 200 }),
      ),
    );

    expect((await fetchImage('https://example.com/path/sunset.jpg?v=2')).filename).toBe(
      'sunset.jpg',
    );
    expect((await fetchImage('https://example.com/generated')).filename).toBe('generated.jpg');
  });

  it('rejects a link that is not an image', async () => {
    const { fetchImage } = await import('../extension/src/lib/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Blob(['<html>'], { type: 'text/html' }), { status: 200 })),
    );

    await expect(fetchImage('https://example.com/page')).rejects.toThrow(/not point to an image/i);
  });
});
