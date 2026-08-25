import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSignedToken,
  resetSigningKeyCache,
  verifySignedToken,
} from '@/lib/auth/session';
import { resetServerEnvCache } from '@/lib/config/env';

/**
 * Session cookie signing.
 *
 * These exist because of a production outage: `signingKey()` threw when
 * AUTH_SECRET was unset in production, and the throw happened while *verifying
 * an incoming cookie*. Every browser that already held a session cookie got a
 * 500 on every request — including background removal, which does not use
 * sessions at all.
 *
 * It survived testing because a request with no cookie never reaches the
 * verification path, and curl sends no cookies. So these tests always exercise
 * the with-cookie case.
 */

/**
 * NODE_ENV is declared readonly by Next's types; these tests need to vary it.
 *
 * Keys are restored individually rather than by replacing `process.env`
 * wholesale — swapping the object out leaves this reference pointing at the old
 * one, and subsequent assignments silently stop reaching the real environment.
 */
const env = process.env as Record<string, string | undefined>;
const MUTATED_KEYS = ['AUTH_SECRET', 'NODE_ENV'] as const;
const original = Object.fromEntries(MUTATED_KEYS.map((key) => [key, env[key]]));

beforeEach(() => {
  resetSigningKeyCache();
  resetServerEnvCache();
});

afterEach(() => {
  for (const key of MUTATED_KEYS) {
    if (original[key] === undefined) delete env[key];
    else env[key] = original[key];
  }
  resetSigningKeyCache();
  resetServerEnvCache();
  vi.restoreAllMocks();
});

describe('signing key resolution', () => {
  it('round-trips a token when AUTH_SECRET is configured', () => {
    env.AUTH_SECRET = 'a'.repeat(64);
    env.NODE_ENV = 'production';
    resetSigningKeyCache();
    resetServerEnvCache();

    const token = createSignedToken('anon_abc');
    expect(verifySignedToken(token)).toBe('anon_abc');
  });

  it('does not throw in production when AUTH_SECRET is missing', () => {
    delete env.AUTH_SECRET;
    env.NODE_ENV = 'production';
    resetSigningKeyCache();
    resetServerEnvCache();
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});

    // THE regression: this used to throw and 500 every request.
    expect(() => createSignedToken('anon_abc')).not.toThrow();
    expect(() => verifySignedToken('anon_abc.somesignature')).not.toThrow();

    // And it must say loudly what the operator should set.
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/AUTH_SECRET/);
  });

  it('still produces unforgeable tokens with the fallback key', () => {
    delete env.AUTH_SECRET;
    env.NODE_ENV = 'production';
    resetSigningKeyCache();
    resetServerEnvCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const token = createSignedToken('anon_abc');
    expect(verifySignedToken(token)).toBe('anon_abc');
    // A tampered id must not verify.
    expect(verifySignedToken(token.replace('anon_abc', 'anon_evil'))).toBeNull();
  });

  it('keeps one key for the life of the process', () => {
    delete env.AUTH_SECRET;
    env.NODE_ENV = 'production';
    resetSigningKeyCache();
    resetServerEnvCache();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Two tokens minted in the same process must verify against each other's key.
    const first = createSignedToken('anon_one');
    const second = createSignedToken('anon_two');
    expect(verifySignedToken(first)).toBe('anon_one');
    expect(verifySignedToken(second)).toBe('anon_two');
  });
});

describe('verifySignedToken never throws on untrusted input', () => {
  beforeEach(() => {
    env.AUTH_SECRET = 'b'.repeat(64);
    env.NODE_ENV = 'production';
    resetSigningKeyCache();
    resetServerEnvCache();
  });

  it('rejects a cookie signed with a different secret rather than failing', () => {
    // Exactly the reported scenario: a cookie left over from the dev server.
    env.AUTH_SECRET = 'dev-secret-value-that-is-long-enough';
    resetSigningKeyCache();
    resetServerEnvCache();
    const foreign = createSignedToken('anon_from_dev');

    env.AUTH_SECRET = 'production-secret-value-long-enough';
    resetSigningKeyCache();
    resetServerEnvCache();

    expect(() => verifySignedToken(foreign)).not.toThrow();
    expect(verifySignedToken(foreign)).toBeNull();
  });

  it.each([
    ['empty string', ''],
    ['no separator', 'nodot'],
    ['leading separator', '.signature'],
    ['only a separator', '.'],
    ['garbage', '%%%.%%%'],
    ['very long', `${'x'.repeat(5000)}.${'y'.repeat(5000)}`],
  ])('returns null for %s', (_label, token) => {
    expect(() => verifySignedToken(token)).not.toThrow();
    expect(verifySignedToken(token)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(verifySignedToken(undefined)).toBeNull();
  });
});
