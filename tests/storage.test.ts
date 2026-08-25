import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { EphemeralStorage, LocalTempStorage, persistResult, setStorage } from '@/lib/storage';
import { resetServerEnvCache } from '@/lib/config/env';

let directory: string;
/** LocalTempStorage resolves against process.cwd(), so keep paths relative. */
let relativeDir: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'adh-storage-'));
  relativeDir = relative(process.cwd(), directory);
});

afterEach(async () => {
  setStorage(null);
  resetServerEnvCache();
  await rm(directory, { recursive: true, force: true });
});

describe('EphemeralStorage', () => {
  it('stores nothing, which is the privacy-preserving default', async () => {
    const storage = new EphemeralStorage();

    expect(storage.persists).toBe(false);
    expect(await storage.put()).toBeNull();
    expect(await storage.get()).toBeNull();
    expect(await storage.sweep()).toBe(0);
  });

  it('makes persistResult a no-op', async () => {
    setStorage(new EphemeralStorage());
    expect(await persistResult('a.png', Buffer.from([1, 2, 3]), 'image/png')).toBeNull();
  });
});

describe('LocalTempStorage', () => {
  it('round-trips an object', async () => {
    const storage = new LocalTempStorage(relativeDir, 900);
    const payload = Buffer.from('png-bytes');

    const stored = await storage.put('result.png', payload, 'image/png');
    expect(stored.byteSize).toBe(payload.length);
    expect(stored.expiresAt).toBeGreaterThan(Date.now());

    expect(await storage.get('result.png')).toEqual(payload);
  });

  it('returns null for a missing key rather than throwing', async () => {
    const storage = new LocalTempStorage(relativeDir, 900);
    expect(await storage.get('nope.png')).toBeNull();
  });

  it('deletes an object and tolerates deleting it twice', async () => {
    const storage = new LocalTempStorage(relativeDir, 900);
    await storage.put('gone.png', Buffer.from('x'), 'image/png');

    await storage.delete('gone.png');
    expect(await storage.get('gone.png')).toBeNull();
    await expect(storage.delete('gone.png')).resolves.toBeUndefined();
  });

  it('flattens keys so a traversal attempt cannot escape the directory', async () => {
    const storage = new LocalTempStorage(relativeDir, 900);

    const stored = await storage.put('../../escaped.png', Buffer.from('x'), 'image/png');
    expect(stored.key).not.toContain('/');
    expect(stored.key).not.toContain('..' + '/');

    const entries = await readdir(directory);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toBe(stored.key);
  });

  it('sweeps files older than the TTL and keeps fresh ones', async () => {
    const storage = new LocalTempStorage(relativeDir, 60);

    const stale = join(directory, 'stale.png');
    await writeFile(stale, 'old');
    const longAgo = new Date(Date.now() - 10 * 60_000);
    await utimes(stale, longAgo, longAgo);

    await writeFile(join(directory, 'fresh.png'), 'new');

    const removed = await storage.sweep();

    expect(removed).toBe(1);
    expect(await readdir(directory)).toEqual(['fresh.png']);
  });

  it('does not sweep more than once a minute', async () => {
    const storage = new LocalTempStorage(relativeDir, 60);
    await storage.sweep();
    // The second call is throttled and reports no work rather than rescanning.
    expect(await storage.sweep()).toBe(0);
  });
});

describe('storage driver selection', () => {
  it('refuses an unimplemented driver instead of silently dropping data', async () => {
    setStorage(null);
    process.env.STORAGE_DRIVER = 's3';
    resetServerEnvCache();

    const { getStorage } = await import('@/lib/storage');
    expect(() => getStorage()).toThrowError(expect.objectContaining({ code: 'NOT_IMPLEMENTED' }));

    delete process.env.STORAGE_DRIVER;
    resetServerEnvCache();
  });
});
