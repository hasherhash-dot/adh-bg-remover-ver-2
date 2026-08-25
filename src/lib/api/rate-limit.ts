import 'server-only';
import { serverEnv } from '@/lib/config/env';

/**
 * Sliding-window rate limiting.
 *
 * The interface is the point: route handlers call `limiter.consume(key, rule)`
 * and never learn whether the counter lives in this process or in Redis. The
 * in-memory driver is correct for a single instance and is what runs locally;
 * a multi-instance deployment must register a shared driver (see below), or
 * limits apply per-instance.
 */

export interface RateLimitRule {
  /** Requests allowed within the window. */
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch milliseconds when the window frees up. */
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  readonly id: string;
  consume(key: string, rule: RateLimitRule): Promise<RateLimitResult>;
}

/**
 * Timestamp-log limiter: exact sliding window, bounded memory per key because
 * expired entries are pruned on every read.
 */
export class MemoryRateLimiter implements RateLimiter {
  readonly id = 'memory';
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  async consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    this.sweep(now);

    const cutoff = now - rule.windowMs;
    const timestamps = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= rule.limit) {
      const oldest = timestamps[0] as number;
      const resetAt = oldest + rule.windowMs;
      this.hits.set(key, timestamps);
      return {
        allowed: false,
        limit: rule.limit,
        remaining: 0,
        resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit - timestamps.length,
      resetAt: now + rule.windowMs,
      retryAfterSeconds: 0,
    };
  }

  /** Drops keys that have gone quiet so the map cannot grow without bound. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const maxWindow = 60 * 60 * 1000;
    for (const [key, timestamps] of this.hits) {
      const live = timestamps.filter((t) => t > now - maxWindow);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }

  reset(): void {
    this.hits.clear();
  }
}

/** Disables limiting entirely. Only for trusted internal deployments. */
export class NoopRateLimiter implements RateLimiter {
  readonly id = 'none';
  async consume(_key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    return {
      allowed: true,
      limit: rule.limit,
      remaining: rule.limit,
      resetAt: Date.now() + rule.windowMs,
      retryAfterSeconds: 0,
    };
  }
}

let limiter: RateLimiter | null = null;

export function getRateLimiter(): RateLimiter {
  if (limiter) return limiter;
  limiter = serverEnv().RATE_LIMIT_DRIVER === 'none' ? new NoopRateLimiter() : new MemoryRateLimiter();
  return limiter;
}

/** Test helper / extension point for a Redis-backed limiter. */
export function setRateLimiter(next: RateLimiter | null): void {
  limiter = next;
}

export function singleImageRule(): RateLimitRule {
  return { limit: serverEnv().RATE_LIMIT_REQUESTS_PER_MINUTE, windowMs: 60_000 };
}

export function batchRule(): RateLimitRule {
  return { limit: serverEnv().RATE_LIMIT_BATCH_PER_HOUR, windowMs: 60 * 60_000 };
}

/**
 * Best-effort client identity for anonymous rate limiting.
 * Proxy headers are spoofable, so this is a courtesy limit — quota enforcement
 * relies on the signed session or an API key instead.
 */
export function clientKeyFromHeaders(headers: Headers, fallback: string): string {
  const forwarded = headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || headers.get('x-real-ip');
  return ip ? `ip:${ip}` : `owner:${fallback}`;
}
