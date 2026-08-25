import 'server-only';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { serverEnv } from '@/lib/config/env';

/**
 * A deliberately tiny key/value abstraction.
 *
 * Only two things are persisted server-side — API keys and usage counters —
 * and both are small documents keyed by owner. Rather than pull in an ORM
 * before there is a database, the shape a real store must satisfy is defined
 * here and backed by JSON files in development.
 *
 * To move to Postgres: implement `DocumentStore` against your driver and
 * register it in `getStore()`. Nothing else in the codebase changes.
 */
export interface DocumentStore {
  get<T>(collection: string, id: string): Promise<T | null>;
  put<T>(collection: string, id: string, value: T): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  list<T>(collection: string): Promise<Array<{ id: string; value: T }>>;
}

/** In-process store. Used for tests and for `PERSISTENCE_DRIVER=memory`. */
export class MemoryStore implements DocumentStore {
  private readonly data = new Map<string, Map<string, unknown>>();

  private bucket(collection: string): Map<string, unknown> {
    let bucket = this.data.get(collection);
    if (!bucket) {
      bucket = new Map();
      this.data.set(collection, bucket);
    }
    return bucket;
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    return (this.bucket(collection).get(id) as T | undefined) ?? null;
  }

  async put<T>(collection: string, id: string, value: T): Promise<void> {
    this.bucket(collection).set(id, value);
  }

  async delete(collection: string, id: string): Promise<void> {
    this.bucket(collection).delete(id);
  }

  async list<T>(collection: string): Promise<Array<{ id: string; value: T }>> {
    return [...this.bucket(collection).entries()].map(([id, value]) => ({
      id,
      value: value as T,
    }));
  }
}

/**
 * Directory holding development data. Written as a static literal rather than
 * a variable: the bundler traces dynamic `path.resolve(process.cwd(), x)` calls
 * conservatively and ends up including the entire project in the server output.
 */
const DATA_DIR = '.data';

/**
 * JSON-file store for local development.
 *
 * Writes go through a temp file + rename so a crash mid-write cannot leave a
 * truncated document behind. Not suitable for multi-instance deployments —
 * that is what a Postgres implementation is for.
 */
export class FileStore implements DocumentStore {
  private writeChain: Promise<unknown> = Promise.resolve();
  private writeCounter = 0;

  private path(collection: string): string {
    // Collection names are internal constants, never user input, but the
    // traversal guard costs nothing.
    const safe = collection.replace(/[^a-z0-9_-]/gi, '');
    return join(process.cwd(), DATA_DIR, `${safe}.json`);
  }

  private async readAll<T>(collection: string): Promise<Record<string, T>> {
    try {
      const raw = await readFile(this.path(collection), 'utf8');
      return JSON.parse(raw) as Record<string, T>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw error;
    }
  }

  private writeAll<T>(collection: string, data: Record<string, T>): Promise<void> {
    // Serialise writes so concurrent requests cannot clobber each other.
    const task = this.writeChain.then(async () => {
      const target = this.path(collection);
      await mkdir(join(process.cwd(), DATA_DIR), { recursive: true });

      // Unique per write, not just per process. The previous name reused one
      // path for every write in the process, so two writes in flight could
      // collide on it — and on Windows a rename over a file another handle
      // still holds fails with EPERM.
      const temp = `${target}.${process.pid}.${(this.writeCounter += 1)}.tmp`;
      await writeFile(temp, JSON.stringify(data, null, 2), 'utf8');

      try {
        await rename(temp, target);
      } catch (error) {
        // Windows can transiently refuse a rename while an antivirus scanner or
        // the search indexer holds the target. One short retry clears it; if it
        // does not, remove the temp file rather than leaving litter behind.
        if ((error as NodeJS.ErrnoException).code !== 'EPERM') {
          await rm(temp, { force: true });
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
          await rename(temp, target);
        } catch (retryError) {
          await rm(temp, { force: true });
          throw retryError;
        }
      }
    });
    this.writeChain = task.catch(() => undefined);
    return task;
  }

  async get<T>(collection: string, id: string): Promise<T | null> {
    const all = await this.readAll<T>(collection);
    return all[id] ?? null;
  }

  async put<T>(collection: string, id: string, value: T): Promise<void> {
    const all = await this.readAll<T>(collection);
    all[id] = value;
    await this.writeAll(collection, all);
  }

  async delete(collection: string, id: string): Promise<void> {
    const all = await this.readAll<unknown>(collection);
    delete all[id];
    await this.writeAll(collection, all);
  }

  async list<T>(collection: string): Promise<Array<{ id: string; value: T }>> {
    const all = await this.readAll<T>(collection);
    return Object.entries(all).map(([id, value]) => ({ id, value }));
  }
}

let store: DocumentStore | null = null;

export function getStore(): DocumentStore {
  if (store) return store;
  const driver = serverEnv().PERSISTENCE_DRIVER;
  switch (driver) {
    case 'memory':
      store = new MemoryStore();
      break;
    case 'postgres':
      // Intentionally not implemented: see docs/ARCHITECTURE.md. Failing loudly
      // at boot is better than silently falling back to a non-durable store.
      throw new Error(
        'PERSISTENCE_DRIVER=postgres is not implemented. Implement DocumentStore against your database and register it in src/lib/persistence/store.ts.',
      );
    case 'file':
    default:
      store = new FileStore();
  }
  return store;
}

/** Test helper. */
export function setStore(next: DocumentStore | null): void {
  store = next;
}

export const COLLECTIONS = {
  apiKeys: 'api-keys',
  usage: 'usage',
} as const;
