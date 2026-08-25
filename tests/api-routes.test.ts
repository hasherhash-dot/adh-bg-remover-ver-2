import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import JSZip from 'jszip';
import { setAuthDriver, type Session } from '@/lib/auth/session';
import { MemoryStore, setStore } from '@/lib/persistence/store';
import { MemoryRateLimiter, setRateLimiter } from '@/lib/api/rate-limit';
import { resetServerEnvCache } from '@/lib/config/env';
import { resetProvider } from '@/lib/bg-removal/registry';
import { asJpeg, notAnImage, subjectOnFlatBackground } from './fixtures/images';

/**
 * Route-handler tests.
 *
 * The handlers are exercised as functions with real Request objects rather than
 * over HTTP, so the whole chain — auth, rate limiting, quota, parsing,
 * processing, serialisation — runs without a server. The seams that make this
 * possible (`setAuthDriver`, `setStore`, `setRateLimiter`) are the same ones
 * that let production swap in real implementations.
 */

const session: Session = {
  ownerId: 'test-owner',
  userId: null,
  email: null,
  planId: 'free',
  isAnonymous: true,
};

beforeEach(() => {
  process.env.BACKGROUND_REMOVAL_PROVIDER = 'mock';
  process.env.RATE_LIMIT_REQUESTS_PER_MINUTE = '100';
  process.env.RATE_LIMIT_BATCH_PER_HOUR = '100';
  resetServerEnvCache();
  resetProvider();
  setStore(new MemoryStore());
  setRateLimiter(new MemoryRateLimiter());
  setAuthDriver({ id: 'test', getSession: async () => session });
});

afterEach(() => {
  setAuthDriver(null);
  setStore(null);
  setRateLimiter(null);
  resetServerEnvCache();
  resetProvider();
});

function multipart(parts: Record<string, string | { data: Buffer; filename: string }>): Request {
  const form = new FormData();
  for (const [key, value] of Object.entries(parts)) {
    if (typeof value === 'string') {
      form.append(key, value);
    } else {
      form.append(key, new Blob([new Uint8Array(value.data)]), value.filename);
    }
  }
  return new Request('http://localhost/api/remove-background', { method: 'POST', body: form });
}

describe('POST /api/remove-background', () => {
  it('returns a transparent PNG with metadata headers', async () => {
    const { POST } = await import('@/app/api/remove-background/route');
    const image = await subjectOnFlatBackground({ width: 320, height: 240 });

    const response = await POST(multipart({ image: { data: image, filename: 'cat.png' } }));

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toContain('cat.png');
    expect(Number(response.headers.get('x-image-width'))).toBe(320);
    expect(Number(response.headers.get('x-image-height'))).toBe(240);
    expect(Number(response.headers.get('x-processing-time-ms'))).toBeGreaterThanOrEqual(0);
    expect(response.headers.get('x-provider')).toBe('mock');

    const body = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(body).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(meta.width).toBe(320);
  });

  it('returns base64 JSON when response=json', async () => {
    const { POST } = await import('@/app/api/remove-background/route');
    const image = await subjectOnFlatBackground({ width: 120, height: 90 });

    const response = await POST(
      multipart({ image: { data: image, filename: 'x.png' }, response: 'json' }),
    );
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.image.mimeType).toBe('image/png');
    expect(body.metadata.width).toBe(120);
    expect(Buffer.from(body.image.data, 'base64').length).toBeGreaterThan(0);
  });

  it('applies a solid background colour when asked', async () => {
    const { POST } = await import('@/app/api/remove-background/route');
    const image = await subjectOnFlatBackground({ width: 100, height: 100 });

    const response = await POST(
      multipart({
        image: { data: image, filename: 'x.png' },
        background: 'color',
        backgroundColor: '#ff0000',
      }),
    );

    const raw = await sharp(Buffer.from(await response.arrayBuffer())).raw().toBuffer();
    expect([raw[0], raw[1], raw[2]]).toEqual([255, 0, 0]);
  });

  it('rejects a non-image with a user-safe message and no stack trace', async () => {
    const { POST } = await import('@/app/api/remove-background/route');

    const response = await POST(multipart({ image: { data: notAnImage(), filename: 'x.png' } }));
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error.code).toBe('INVALID_FILE_TYPE');
    expect(JSON.stringify(body)).not.toMatch(/at .*\.ts:|Error:|stack/i);
    expect(Object.keys(body.error).sort()).toEqual(['code', 'message', 'retryable']);
  });

  it('rejects a request with no file', async () => {
    const { POST } = await import('@/app/api/remove-background/route');
    const response = await POST(
      new Request('http://localhost/api/remove-background', {
        method: 'POST',
        body: new FormData(),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('NO_FILE_PROVIDED');
  });

  it('rejects a non-multipart body', async () => {
    const { POST } = await import('@/app/api/remove-background/route');
    const response = await POST(
      new Request('http://localhost/api/remove-background', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }),
    );
    expect(response.status).toBe(400);
  });

  it('still returns the image when usage bookkeeping fails', async () => {
    // A processed image must never be thrown away because a counter could not
    // be written. A transient file-rename failure on Windows used to turn a
    // perfectly converted image into a 500.
    const failing = new MemoryStore();
    failing.put = async () => {
      throw new Error('EPERM: operation not permitted, rename');
    };
    setStore(failing);

    const { POST } = await import('@/app/api/remove-background/route');
    const response = await POST(
      multipart({
        image: { data: await subjectOnFlatBackground({ width: 80, height: 60 }), filename: 'a.png' },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await response.arrayBuffer()).length).toBeGreaterThan(0);
  });

  it('answers GET with 405 and an Allow header', async () => {
    const { GET } = await import('@/app/api/remove-background/route');
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('counts a successful conversion against the monthly quota', async () => {
    const { POST } = await import('@/app/api/remove-background/route');
    const { getUsage } = await import('@/lib/api/usage');

    await POST(
      multipart({
        image: { data: await subjectOnFlatBackground({ width: 64, height: 64 }), filename: 'a.png' },
      }),
    );

    const usage = await getUsage('test-owner', 'free');
    expect(usage.imagesProcessed).toBe(1);
    expect(usage.remaining).toBe(usage.monthlyLimit - 1);
  });

  it('does not charge quota for a rejected upload', async () => {
    const { POST } = await import('@/app/api/remove-background/route');
    const { getUsage } = await import('@/lib/api/usage');

    await POST(multipart({ image: { data: notAnImage(), filename: 'bad.png' } }));

    expect((await getUsage('test-owner', 'free')).imagesProcessed).toBe(0);
  });

  it('enforces the rate limit and reports Retry-After', async () => {
    process.env.RATE_LIMIT_REQUESTS_PER_MINUTE = '1';
    resetServerEnvCache();
    const { POST } = await import('@/app/api/remove-background/route');
    const image = await subjectOnFlatBackground({ width: 64, height: 64 });

    const first = await POST(multipart({ image: { data: image, filename: 'a.png' } }));
    expect(first.status).toBe(200);

    const second = await POST(multipart({ image: { data: image, filename: 'b.png' } }));
    expect(second.status).toBe(429);
    expect((await second.json()).error.code).toBe('RATE_LIMITED');
    expect(second.headers.get('retry-after')).toBeTruthy();
  });
});

describe('POST /api/batch/remove-background', () => {
  it('returns a ZIP containing one PNG per image plus a manifest', async () => {
    const { POST } = await import('@/app/api/batch/remove-background/route');

    const form = new FormData();
    for (const name of ['one.png', 'two.png', 'three.png']) {
      const data = await subjectOnFlatBackground({ width: 80, height: 60 });
      form.append('images', new Blob([new Uint8Array(data)]), name);
    }

    const response = await POST(
      new Request('http://localhost/api/batch/remove-background', { method: 'POST', body: form }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    expect(response.headers.get('x-batch-succeeded')).toBe('3');

    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(['_manifest.json', 'one.png', 'three.png', 'two.png']);

    const manifest = JSON.parse(await (zip.file('_manifest.json') as JSZip.JSZipObject).async('string'));
    expect(manifest.summary).toEqual({ total: 3, succeeded: 3, failed: 0 });
  });

  it('keeps good results when one image in the batch fails', async () => {
    const { POST } = await import('@/app/api/batch/remove-background/route');

    const form = new FormData();
    const good = await subjectOnFlatBackground({ width: 80, height: 60 });
    form.append('images', new Blob([new Uint8Array(good)]), 'good.png');
    form.append('images', new Blob([new Uint8Array(notAnImage())]), 'bad.png');

    const response = await POST(
      new Request('http://localhost/api/batch/remove-background', { method: 'POST', body: form }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('x-batch-succeeded')).toBe('1');
    expect(response.headers.get('x-batch-failed')).toBe('1');

    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));
    const manifest = JSON.parse(await (zip.file('_manifest.json') as JSZip.JSZipObject).async('string'));
    expect(manifest.results.find((r: { filename: string }) => r.filename === 'bad.png')).toMatchObject(
      { status: 'failed', error: { code: 'INVALID_FILE_TYPE' } },
    );
  });

  it('deduplicates identical filenames inside the archive', async () => {
    const { POST } = await import('@/app/api/batch/remove-background/route');

    const form = new FormData();
    for (let i = 0; i < 2; i += 1) {
      const data = await asJpeg({ width: 60, height: 60 });
      form.append('images', new Blob([new Uint8Array(data)]), 'photo.jpg');
    }

    const response = await POST(
      new Request('http://localhost/api/batch/remove-background', { method: 'POST', body: form }),
    );
    const zip = await JSZip.loadAsync(Buffer.from(await response.arrayBuffer()));

    expect(Object.keys(zip.files).sort()).toEqual(['_manifest.json', 'photo-2.png', 'photo.png']);
  });

  it('refuses a batch larger than the plan allows', async () => {
    // The free plan allows 20 per batch, matching MAX_BATCH_SIZE and the
    // client-side queue. Earlier it declared 5 while the product happily
    // processed more, so the number was corrected to reality rather than
    // enforced retroactively.
    const { POST } = await import('@/app/api/batch/remove-background/route');

    const form = new FormData();
    for (let i = 0; i < 25; i += 1) {
      const data = await subjectOnFlatBackground({ width: 40, height: 40 });
      form.append('images', new Blob([new Uint8Array(data)]), `img-${i}.png`);
    }

    const response = await POST(
      new Request('http://localhost/api/batch/remove-background', { method: 'POST', body: form }),
    );

    // The free plan caps batches at 5.
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('BATCH_TOO_LARGE');
  });
});

describe('GET /api/usage', () => {
  it('reports the period, limits and plan entitlements', async () => {
    const { GET } = await import('@/app/api/usage/route');
    const response = await GET(new Request('http://localhost/api/usage'));
    const body = await response.json();

    expect(body.success).toBe(true);
    expect(body.usage.monthlyLimit).toBe(30);
    expect(body.plan.id).toBe('free');
    expect(body.usage.period).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('/api/api-keys', () => {
  it('refuses to mint keys for a plan without API access', async () => {
    const { POST } = await import('@/app/api/api-keys/route');
    const response = await POST(
      new Request('http://localhost/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      }),
    );
    expect(response.status).toBe(401);
  });

  it('issues a key once for a plan that includes API access', async () => {
    setAuthDriver({
      id: 'test',
      getSession: async () => ({ ...session, planId: 'business' }),
    });

    const { POST, GET } = await import('@/app/api/api-keys/route');

    const created = await POST(
      new Request('http://localhost/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'CI server' }),
      }),
    );
    const body = await created.json();

    expect(created.status).toBe(201);
    expect(body.key).toMatch(/^adh_live_/);
    expect(body.summary.name).toBe('CI server');

    // The plaintext must never come back from a listing.
    const listed = await (await GET(new Request('http://localhost/api/api-keys'))).json();
    expect(listed.keys).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(body.key);
    expect(listed.keys[0].preview).toContain('…');
  });
});

describe('GET /api/health', () => {
  it('reports the active provider', async () => {
    const { GET } = await import('@/app/api/health/route');
    const body = await (await GET()).json();
    expect(body.status).toBe('ready');
    expect(body.provider).toBe('mock');
  });
});
