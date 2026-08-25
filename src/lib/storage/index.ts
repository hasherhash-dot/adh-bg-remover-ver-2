import 'server-only';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '@/lib/errors';
import { serverEnv } from '@/lib/config/env';

/**
 * Object storage boundary.
 *
 * The product does not need durable storage to work: an upload is processed in
 * memory and the result is streamed straight back. That is the privacy-
 * preserving default, and it is why `EphemeralStorage` — which stores nothing —
 * is a real driver rather than a placeholder.
 *
 * `local` exists for deployments that genuinely want results on disk for a
 * short window (debugging, audit, an async download link). It is TTL-swept so
 * temporary files cannot accumulate.
 *
 * S3, R2 and Supabase are the intended next drivers. They are not implemented,
 * and selecting one fails loudly at construction rather than silently degrading
 * to no storage — losing data quietly is worse than refusing to start.
 */

export interface StoredObject {
  key: string;
  byteSize: number;
  contentType: string;
  /** Epoch ms after which the object may be swept. */
  expiresAt: number;
}

export interface StorageDriver {
  readonly id: string;
  /** True when the driver actually persists anything. */
  readonly persists: boolean;

  put(key: string, data: Buffer, contentType: string): Promise<StoredObject | null>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** Removes expired objects. Safe to call often; cheap when there is nothing to do. */
  sweep(): Promise<number>;
}

/** Stores nothing. The default, and the reason uploads leave no trace. */
export class EphemeralStorage implements StorageDriver {
  readonly id = 'ephemeral';
  readonly persists = false;

  async put(): Promise<null> {
    return null;
  }
  async get(): Promise<null> {
    return null;
  }
  async delete(): Promise<void> {}
  async sweep(): Promise<number> {
    return 0;
  }
}

/**
 * Temp-directory storage with a TTL.
 *
 * Keys are sanitised to a flat filename: they come from server-generated ids,
 * but treating them as untrusted costs nothing and removes any path-traversal
 * question entirely.
 */
export class LocalTempStorage implements StorageDriver {
  readonly id = 'local';
  readonly persists = true;

  private lastSweep = 0;

  constructor(
    private readonly directory: string,
    private readonly ttlSeconds: number,
  ) {}

  private safeKey(key: string): string {
    const flat = key.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!flat || flat === '.' || flat === '..') {
      throw new AppError('INTERNAL_ERROR', { detail: 'invalid storage key' });
    }
    return flat;
  }

  /**
   * Resolves the storage root.
   *
   * STORAGE_TEMP_DIR is configuration, so the bundler cannot know it
   * statically; without the opt-out below it traces the entire project into the
   * server bundle "just in case". The directory is operator-controlled, never
   * user input.
   */
  private root(): string {
    return join(/* turbopackIgnore: true */ process.cwd(), this.directory);
  }

  private path(key: string): string {
    return join(this.root(), this.safeKey(key));
  }

  async put(key: string, data: Buffer, contentType: string): Promise<StoredObject> {
    await mkdir(this.root(), { recursive: true });
    await writeFile(this.path(key), data);

    // Opportunistic cleanup keeps the directory bounded without a cron job.
    void this.sweep().catch(() => undefined);

    return {
      key: this.safeKey(key),
      byteSize: data.length,
      contentType,
      expiresAt: Date.now() + this.ttlSeconds * 1000,
    };
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async sweep(): Promise<number> {
    const now = Date.now();
    // At most one sweep a minute; the work is proportional to directory size.
    if (now - this.lastSweep < 60_000) return 0;
    this.lastSweep = now;

    const root = this.root();
    let removed = 0;

    try {
      for (const entry of await readdir(root)) {
        const full = join(root, entry);
        try {
          const info = await stat(full);
          if (now - info.mtimeMs > this.ttlSeconds * 1000) {
            await unlink(full);
            removed += 1;
          }
        } catch {
          // Another process may have removed it first; that is the goal anyway.
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }

    return removed;
  }
}

let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = serverEnv();

  switch (env.STORAGE_DRIVER) {
    case 'local':
      driver = new LocalTempStorage(env.STORAGE_TEMP_DIR, env.STORAGE_TTL_SECONDS);
      break;
    case 's3':
    case 'r2':
    case 'supabase':
      throw new AppError('NOT_IMPLEMENTED', {
        detail: `STORAGE_DRIVER=${env.STORAGE_DRIVER} is not implemented. Implement StorageDriver in src/lib/storage/index.ts and register it here.`,
      });
    case 'ephemeral':
    default:
      driver = new EphemeralStorage();
  }

  return driver;
}

/** Test helper. */
export function setStorage(next: StorageDriver | null): void {
  driver = next;
}

/**
 * Persists a finished result if — and only if — a durable driver is configured.
 * Storage is never allowed to fail a conversion that already succeeded.
 */
export async function persistResult(
  key: string,
  data: Buffer,
  contentType: string,
): Promise<StoredObject | null> {
  try {
    const storage = getStorage();
    if (!storage.persists) return null;
    return await storage.put(key, data, contentType);
  } catch (error) {
    console.error('[storage] failed to persist result', error);
    return null;
  }
}
