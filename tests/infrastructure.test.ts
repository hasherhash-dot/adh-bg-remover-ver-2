import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InProcessJobRunner } from '@/lib/batch/queue';
import { MemoryRateLimiter } from '@/lib/api/rate-limit';
import { MemoryStore, setStore } from '@/lib/persistence/store';
import {
  createApiKey,
  extractApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from '@/lib/auth/api-keys';
import { assertWithinQuota, getUsage, recordUsage } from '@/lib/api/usage';
import { createSignedToken, verifySignedToken } from '@/lib/auth/session';
import { getPlan, PLANS } from '@/lib/billing/plans';
import { createCheckoutSession, isBillingEnabled } from '@/lib/billing/stripe';

beforeEach(() => {
  setStore(new MemoryStore());
});

afterEach(() => {
  setStore(null);
});

describe('InProcessJobRunner', () => {
  it('processes every job and preserves input order in the results', async () => {
    const runner = new InProcessJobRunner<number, number>(3);
    const jobs = Array.from({ length: 10 }, (_, i) => ({ id: String(i), input: i }));

    const results = await runner.runAll(jobs, async (input) => input * 2);

    expect(results).toHaveLength(10);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18,
    ]);
  });

  it('never exceeds the concurrency limit', async () => {
    const concurrency = 2;
    const runner = new InProcessJobRunner<number, number>(concurrency);
    let active = 0;
    let peak = 0;

    await runner.runAll(
      Array.from({ length: 8 }, (_, i) => ({ id: String(i), input: i })),
      async (input) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return input;
      },
    );

    expect(peak).toBeLessThanOrEqual(concurrency);
    expect(peak).toBeGreaterThan(1);
  });

  it('isolates a failing job from the rest of the batch', async () => {
    const runner = new InProcessJobRunner<number, string>(2);

    const results = await runner.runAll(
      [0, 1, 2, 3].map((i) => ({ id: String(i), input: i })),
      async (input) => {
        if (input === 2) throw new Error('boom');
        return `ok-${input}`;
      },
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    const failure = results.find((r) => r.status === 'failed');
    expect(failure?.id).toBe('2');
  });

  it('reports each outcome as it settles', async () => {
    const runner = new InProcessJobRunner<number, number>(1);
    const seen: string[] = [];

    await runner.runAll(
      [1, 2, 3].map((i) => ({ id: String(i), input: i })),
      async (input) => input,
      { onSettled: (outcome) => seen.push(outcome.id) },
    );

    expect(seen).toEqual(['1', '2', '3']);
  });

  it('marks remaining jobs as failed once aborted', async () => {
    const runner = new InProcessJobRunner<number, number>(1);
    const controller = new AbortController();

    const results = await runner.runAll(
      [1, 2, 3, 4].map((i) => ({ id: String(i), input: i })),
      async (input) => {
        if (input === 2) controller.abort();
        return input;
      },
      { signal: controller.signal },
    );

    expect(results.filter((r) => r.status === 'failed').length).toBeGreaterThan(0);
  });
});

describe('MemoryRateLimiter', () => {
  it('allows up to the limit then refuses', async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { limit: 3, windowMs: 60_000 };

    for (let i = 0; i < 3; i += 1) {
      const result = await limiter.consume('key', rule);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2 - i);
    }

    const blocked = await limiter.consume('key', rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('tracks each key independently', async () => {
    const limiter = new MemoryRateLimiter();
    const rule = { limit: 1, windowMs: 60_000 };

    expect((await limiter.consume('a', rule)).allowed).toBe(true);
    expect((await limiter.consume('b', rule)).allowed).toBe(true);
    expect((await limiter.consume('a', rule)).allowed).toBe(false);
  });

  it('frees the window once it has elapsed', async () => {
    vi.useFakeTimers();
    try {
      const limiter = new MemoryRateLimiter();
      const rule = { limit: 1, windowMs: 1000 };

      expect((await limiter.consume('k', rule)).allowed).toBe(true);
      expect((await limiter.consume('k', rule)).allowed).toBe(false);

      vi.advanceTimersByTime(1500);
      expect((await limiter.consume('k', rule)).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('API keys', () => {
  it('stores only a hash and never the plaintext key', async () => {
    const { key } = await createApiKey({ ownerId: 'owner', name: 'CI', planId: 'business' });

    const store = new MemoryStore();
    setStore(store);
    const fresh = await createApiKey({ ownerId: 'owner', name: 'CI', planId: 'business' });
    const records = await store.list('api-keys');

    expect(key).toMatch(/^adh_live_/);
    expect(JSON.stringify(records)).not.toContain(fresh.key);
  });

  it('verifies a valid key and rejects a tampered one', async () => {
    const { key } = await createApiKey({ ownerId: 'owner', name: 'CI', planId: 'business' });

    expect(await verifyApiKey(key)).toMatchObject({ ownerId: 'owner', name: 'CI' });
    expect(await verifyApiKey(`${key}x`)).toBeNull();
    expect(await verifyApiKey('adh_live_completely_made_up_value_here')).toBeNull();
    expect(await verifyApiKey('not-even-close')).toBeNull();
  });

  it('stops honouring a revoked key immediately', async () => {
    const { key, summary } = await createApiKey({
      ownerId: 'owner',
      name: 'temp',
      planId: 'business',
    });
    expect(await verifyApiKey(key)).not.toBeNull();

    expect(await revokeApiKey('owner', summary.id)).toBe(true);
    expect(await verifyApiKey(key)).toBeNull();
    expect(await listApiKeys('owner')).toHaveLength(0);
  });

  it('will not let one owner revoke another owner key', async () => {
    const { summary } = await createApiKey({ ownerId: 'alice', name: 'k', planId: 'business' });
    expect(await revokeApiKey('mallory', summary.id)).toBe(false);
  });

  it('reads a key from either supported header', () => {
    expect(extractApiKey(new Headers({ authorization: 'Bearer abc123' }))).toBe('abc123');
    expect(extractApiKey(new Headers({ 'x-api-key': 'xyz789' }))).toBe('xyz789');
    expect(extractApiKey(new Headers())).toBeNull();
  });
});

describe('session tokens', () => {
  it('round-trips a signed token', () => {
    const token = createSignedToken('anon_123');
    expect(verifySignedToken(token)).toBe('anon_123');
  });

  it('rejects a forged or altered token', () => {
    const token = createSignedToken('anon_123');
    expect(verifySignedToken(token.replace('anon_123', 'anon_999'))).toBeNull();
    expect(verifySignedToken('anon_123.notasignature')).toBeNull();
    expect(verifySignedToken(undefined)).toBeNull();
    expect(verifySignedToken('nodot')).toBeNull();
  });
});

describe('usage and quota', () => {
  it('accumulates usage within the current period', async () => {
    await recordUsage('owner', { images: 3, batches: 1, apiRequests: 1 });
    await recordUsage('owner', { images: 2 });

    const usage = await getUsage('owner', 'free');
    expect(usage.imagesProcessed).toBe(5);
    expect(usage.batchesProcessed).toBe(1);
    expect(usage.remaining).toBe(25);
  });

  it('throws QUOTA_EXCEEDED when the plan allowance is spent', async () => {
    await recordUsage('owner', { images: PLANS.free.entitlements.monthlyImages });

    await expect(assertWithinQuota('owner', 'free')).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
  });

  it('rejects a batch that would exceed the remaining allowance', async () => {
    await recordUsage('owner', { images: 28 });
    await expect(assertWithinQuota('owner', 'free', 5)).rejects.toMatchObject({
      code: 'QUOTA_EXCEEDED',
    });
    await expect(assertWithinQuota('owner', 'free', 2)).resolves.toBeDefined();
  });
});

describe('billing', () => {
  it('is disabled by default and refuses checkout rather than faking it', async () => {
    expect(isBillingEnabled()).toBe(false);
    await expect(
      createCheckoutSession({ planId: 'pro', ownerId: 'owner', returnUrl: '/' }),
    ).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('falls back to the free plan for an unknown id', () => {
    expect(getPlan('enterprise-platinum').id).toBe('free');
    expect(getPlan(undefined).id).toBe('free');
  });
});
