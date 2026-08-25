import 'server-only';
import { NextResponse } from 'next/server';
import { AppError, toAppError } from '@/lib/errors';
import { extractApiKey, recordApiKeyUse, verifyApiKey } from '@/lib/auth/api-keys';
import { getSession, type Session } from '@/lib/auth/session';
import { getPlan, type PlanId } from '@/lib/billing/plans';
import {
  clientKeyFromHeaders,
  getRateLimiter,
  type RateLimitRule,
} from './rate-limit';

/**
 * Shared plumbing for route handlers: identity resolution, rate limiting and a
 * single error serialiser. Handlers stay focused on their own logic and cannot
 * accidentally leak an internal message.
 */

export interface RequestContext {
  ownerId: string;
  planId: PlanId;
  /** How the caller was identified. */
  via: 'api-key' | 'session';
  session: Session | null;
}

/**
 * Resolves who is calling: an API key if one was presented, otherwise the
 * browser session. An invalid key is rejected outright rather than silently
 * downgraded to an anonymous session — a caller sending a key expects it to be
 * honoured or refused, not ignored.
 */
export async function resolveContext(request: Request): Promise<RequestContext> {
  const presented = extractApiKey(request.headers);

  if (presented) {
    const record = await verifyApiKey(presented);
    if (!record) {
      throw new AppError('UNAUTHORIZED', { detail: 'invalid or revoked API key' });
    }
    if (!getPlan(record.planId).entitlements.apiAccess) {
      throw new AppError('UNAUTHORIZED', {
        detail: `plan ${record.planId} does not include API access`,
      });
    }
    void recordApiKeyUse(record).catch(() => undefined);
    return { ownerId: record.ownerId, planId: record.planId, via: 'api-key', session: null };
  }

  const session = await getSession();
  return { ownerId: session.ownerId, planId: session.planId, via: 'session', session };
}

/** Applies a rate limit and throws RATE_LIMITED with retry information. */
export async function enforceRateLimit(
  request: Request,
  context: RequestContext,
  rule: RateLimitRule,
  scope: string,
): Promise<{ limit: number; remaining: number; resetAt: number }> {
  const identity =
    context.via === 'api-key'
      ? `key:${context.ownerId}`
      : clientKeyFromHeaders(request.headers, context.ownerId);

  const result = await getRateLimiter().consume(`${scope}:${identity}`, rule);
  if (!result.allowed) {
    throw new AppError('RATE_LIMITED', {
      detail: `retry after ${result.retryAfterSeconds}s`,
    });
  }
  return { limit: result.limit, remaining: result.remaining, resetAt: result.resetAt };
}

export function jsonOk<T extends Record<string, unknown>>(data: T, init?: ResponseInit) {
  return NextResponse.json({ success: true, ...data }, init);
}

/**
 * The single place an error becomes an HTTP response.
 * Only `code`, `message` and `retryable` are emitted — stack traces and
 * upstream detail stay in the server log.
 */
export function jsonError(error: unknown): NextResponse {
  const appError = toAppError(error);

  if (appError.status >= 500 || appError.code === 'INTERNAL_ERROR') {
    console.error('[api]', appError.code, appError.detail ?? appError.message, appError.cause);
  } else if (process.env.NODE_ENV !== 'test') {
    console.warn('[api]', appError.code, appError.detail ?? '');
  }

  const headers: Record<string, string> = {};
  if (appError.code === 'RATE_LIMITED') {
    const match = appError.detail?.match(/(\d+)s/);
    headers['Retry-After'] = match?.[1] ?? '60';
  }

  return NextResponse.json(
    { success: false, error: appError.toJSON() },
    { status: appError.status, headers },
  );
}

/** Wraps a handler so every thrown error becomes a well-formed response. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}

export function rateLimitHeaders(info: {
  limit: number;
  remaining: number;
  resetAt: number;
}): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(info.limit),
    'X-RateLimit-Remaining': String(info.remaining),
    'X-RateLimit-Reset': String(Math.floor(info.resetAt / 1000)),
  };
}
