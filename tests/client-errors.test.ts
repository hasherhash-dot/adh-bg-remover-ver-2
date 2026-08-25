import { describe, expect, it } from 'vitest';
import { errorFromResponseBody, validateFile } from '@/lib/client/api-client';

/**
 * How the browser client explains a failed request.
 *
 * These exist because of a real report: a user saw "Something went wrong on our
 * side" when nothing had gone wrong on our side at all — the dev server was
 * recompiling and returned an HTML page instead of our JSON envelope. Every
 * unparseable response was being blamed on a server fault, which sends people
 * looking for a bug that is not there instead of simply retrying.
 */

const OUR_ENVELOPE = JSON.stringify({
  success: false,
  error: {
    code: 'FILE_TOO_LARGE',
    message: 'That image is too large. Please upload a smaller file.',
    retryable: false,
  },
});

describe('errorFromResponseBody', () => {
  it('uses our own message when the server speaks our envelope', async () => {
    const error = await errorFromResponseBody(OUR_ENVELOPE, 413);

    expect(error.code).toBe('FILE_TOO_LARGE');
    expect(error.message).toMatch(/too large/i);
    expect(error.retryable).toBe(false);
  });

  it.each([502, 503, 504])(
    'reports %i as a temporarily unavailable server, not our fault',
    async (status) => {
      const error = await errorFromResponseBody('<html>502 Bad Gateway</html>', status);

      expect(error.retryable).toBe(true);
      expect(error.message).toMatch(/temporarily unavailable|restarting/i);
      expect(error.message).not.toMatch(/on our side/i);
    },
  );

  it('treats a dead connection (status 0) as unavailable rather than a server bug', async () => {
    const error = await errorFromResponseBody('', 0);

    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/temporarily unavailable|restarting/i);
  });

  it('reports an HTML page from a dev server as an unexpected response', async () => {
    // Exactly the shape that caused the original misleading message.
    const error = await errorFromResponseBody(
      '<!DOCTYPE html><html><body>Compiling...</body></html>',
      404,
    );

    expect(error.retryable).toBe(true);
    expect(error.message).toMatch(/did not expect|unexpected/i);
    expect(error.message).not.toMatch(/on our side/i);
  });

  it('still blames the server for a genuine 500 with no body', async () => {
    const error = await errorFromResponseBody('', 500);

    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toMatch(/on our side/i);
    expect(error.retryable).toBe(true);
  });

  it('maps a bare 429 to the rate-limit message', async () => {
    const error = await errorFromResponseBody('too many requests', 429);

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryable).toBe(true);
  });

  it('never surfaces raw response text to the user', async () => {
    const leaky = 'Error: ENOENT /srv/app/.next/server/app/page.js at Object.<anonymous>';
    const error = await errorFromResponseBody(leaky, 500);

    expect(error.message).not.toContain('ENOENT');
    expect(error.message).not.toContain('/srv/app');
    expect(error.message).not.toContain('Error:');
  });
});

describe('validateFile', () => {
  const file = (name: string, type: string, size: number): File => {
    const f = new File([new Uint8Array(1)], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  it('accepts the supported formats', () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'],
      ['b.png', 'image/png'],
      ['c.webp', 'image/webp'],
      ['d.heic', 'image/heic'],
    ] as const) {
      expect(validateFile(file(name, type, 1024)).ok, name).toBe(true);
    }
  });

  it('names the accepted formats when rejecting a type', () => {
    const result = validateFile(file('notes.txt', 'text/plain', 1024));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/JPG, PNG, WEBP or HEIC/);
    }
  });

  it('names the actual size limit when rejecting a large file', () => {
    const result = validateFile(file('huge.jpg', 'image/jpeg', 400 * 1024 * 1024));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Actionable: says the number, not just "too large".
      expect(result.message).toMatch(/under \d+ MB/);
    }
  });

  it('rejects an empty file', () => {
    const result = validateFile(file('empty.png', 'image/png', 0));
    expect(result.ok).toBe(false);
  });

  it('accepts by extension when the browser reports no MIME type', () => {
    // Some platforms hand over HEIC with an empty type.
    expect(validateFile(file('IMG_0001.heic', '', 2048)).ok).toBe(true);
  });
});
