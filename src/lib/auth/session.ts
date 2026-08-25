import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { serverEnv } from '@/lib/config/env';
import { DEFAULT_PLAN, type PlanId } from '@/lib/billing/plans';

/**
 * Authentication boundary.
 *
 * There are no user accounts yet, but everything downstream — usage counters,
 * quotas, API keys, history — needs a stable owner identity. Rather than bolt
 * that on later, the whole app talks to `getSession()` today and the anonymous
 * driver satisfies it with a signed cookie.
 *
 * Adding real accounts means writing an `AuthDriver` that returns a `Session`
 * with a real `userId`. No caller changes.
 */

export const SESSION_COOKIE = 'adh_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export interface Session {
  /** Stable identifier used to key usage and ownership. */
  ownerId: string;
  /** Present only once real accounts exist. */
  userId: string | null;
  email: string | null;
  planId: PlanId;
  isAnonymous: boolean;
}

export interface AuthDriver {
  readonly id: string;
  getSession(): Promise<Session>;
}

let cachedKey: string | null = null;

/**
 * Resolves the key used to sign the session cookie.
 *
 * This used to throw when AUTH_SECRET was unset in production. That looked like
 * "fail loudly" but behaved like an outage: the throw happened while verifying
 * an incoming cookie, so every browser that already had one got a 500 on every
 * request — including image processing, which does not depend on sessions at
 * all. A request without a cookie skipped the code path entirely, which is why
 * curl kept passing while real browsers failed.
 *
 * A random per-process key is the right fallback. It is not a weaker secret —
 * 32 random bytes are stronger than most configured ones — it is simply not
 * durable: sessions and usage counters reset when the process restarts. The
 * product keeps working and the operator gets told exactly what to set.
 */
function signingKey(): string {
  if (cachedKey) return cachedKey;

  const secret = serverEnv().AUTH_SECRET;
  if (secret && secret.length >= 16) {
    cachedKey = secret;
    return cachedKey;
  }

  if (serverEnv().NODE_ENV === 'production') {
    console.error(
      '[auth] AUTH_SECRET is not set. Falling back to a random key generated for ' +
        'this process: existing sessions are invalidated and usage counters reset ' +
        'on every restart. Set AUTH_SECRET to a 32-byte hex string ' +
        '(node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").',
    );
    cachedKey = randomBytes(32).toString('hex');
    return cachedKey;
  }

  cachedKey = 'development-only-insecure-session-key';
  return cachedKey;
}

/** Test helper — forces the next call to re-read AUTH_SECRET. */
export function resetSigningKeyCache(): void {
  cachedKey = null;
}

function sign(value: string): string {
  return createHmac('sha256', signingKey()).update(value).digest('base64url');
}

export function createSignedToken(id: string): string {
  return `${id}.${sign(id)}`;
}

/**
 * Verifies a cookie value and returns the id it carries, or null.
 *
 * A cookie is untrusted input from the network. Every failure mode — malformed,
 * forged, or signed with a key this process no longer has (a leftover from a
 * different environment, say) — means "no session", never an exception. An
 * unverifiable cookie must cost the visitor a new session, not a 500.
 */
export function verifySignedToken(token: string | undefined): string | null {
  if (!token) return null;

  try {
    const separator = token.lastIndexOf('.');
    if (separator <= 0) return null;

    const id = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = sign(id);

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    return timingSafeEqual(a, b) ? id : null;
  } catch {
    return null;
  }
}

/**
 * Anonymous driver: issues a signed, http-only cookie so a visitor keeps the
 * same identity across requests without ever creating an account.
 */
class AnonymousAuthDriver implements AuthDriver {
  readonly id = 'anonymous';

  async getSession(): Promise<Session> {
    const jar = await cookies();
    const existing = verifySignedToken(jar.get(SESSION_COOKIE)?.value);
    const ownerId = existing ?? `anon_${randomBytes(12).toString('hex')}`;

    if (!existing) {
      // Route handlers may set cookies; server components may not. Swallowing
      // the error keeps read-only rendering working — the next mutating
      // request will persist the identity.
      try {
        jar.set(SESSION_COOKIE, createSignedToken(ownerId), {
          httpOnly: true,
          sameSite: 'lax',
          secure: serverEnv().NODE_ENV === 'production',
          path: '/',
          maxAge: SESSION_MAX_AGE_SECONDS,
        });
      } catch {
        /* read-only context */
      }
    }

    return {
      ownerId,
      userId: null,
      email: null,
      planId: DEFAULT_PLAN,
      isAnonymous: true,
    };
  }
}

/**
 * Placeholder for a real provider. Kept as an explicit failure rather than a
 * silent fallback so a misconfigured production deploy is caught immediately.
 */
class NextAuthDriver implements AuthDriver {
  readonly id = 'nextauth';

  async getSession(): Promise<Session> {
    throw new Error(
      'AUTH_DRIVER=nextauth is not implemented. Install next-auth, implement AuthDriver in src/lib/auth/session.ts, and register it below.',
    );
  }
}

let driver: AuthDriver | null = null;

export function getAuthDriver(): AuthDriver {
  if (driver) return driver;
  driver =
    serverEnv().AUTH_DRIVER === 'nextauth' ? new NextAuthDriver() : new AnonymousAuthDriver();
  return driver;
}

export function getSession(): Promise<Session> {
  return getAuthDriver().getSession();
}

/** Test helper. */
export function setAuthDriver(next: AuthDriver | null): void {
  driver = next;
}

export function planFor(session: Session): PlanId {
  return session.planId;
}
