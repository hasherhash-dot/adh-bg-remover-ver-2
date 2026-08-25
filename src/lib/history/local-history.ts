import type { HistoryItem } from '@/lib/client/types';

/**
 * Browser-local processing history (IndexedDB).
 *
 * Images live in the user's own browser and are never uploaded for storage —
 * the server keeps metadata only. This is a deliberate product decision: a
 * background remover should not become a photo archive by default.
 *
 * Blobs are stored directly; IndexedDB handles them natively without base64
 * inflation. The store is capped so it cannot grow without bound.
 */

const DB_NAME = 'adh-bg-remover';
const DB_VERSION = 1;
const STORE = 'history';
const MAX_ITEMS = 50;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * History is a convenience feature. Every operation degrades to a no-op if
 * IndexedDB is unavailable (private browsing, disabled storage, quota) rather
 * than breaking the main flow.
 */
async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
  fallback: T,
): Promise<T> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDatabase();
    const transaction = db.transaction(STORE, mode);
    const result = await fn(transaction.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return result;
  } catch {
    return fallback;
  } finally {
    db?.close();
  }
}

export async function addHistoryItem(item: HistoryItem): Promise<void> {
  await withStore('readwrite', async (store) => {
    await promisify(store.put(item));
    await pruneOldest(store);
  }, undefined);
}

async function pruneOldest(store: IDBObjectStore): Promise<void> {
  const count = await promisify(store.count());
  if (count <= MAX_ITEMS) return;

  const index = store.index('createdAt');
  let toRemove = count - MAX_ITEMS;
  await new Promise<void>((resolve) => {
    const cursorRequest = index.openCursor(null, 'next');
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || toRemove <= 0) {
        resolve();
        return;
      }
      cursor.delete();
      toRemove -= 1;
      cursor.continue();
    };
    cursorRequest.onerror = () => resolve();
  });
}

export async function listHistoryItems(): Promise<HistoryItem[]> {
  return withStore<HistoryItem[]>(
    'readonly',
    async (store) => {
      const all = await promisify(store.getAll() as IDBRequest<HistoryItem[]>);
      return all.sort((a, b) => b.createdAt - a.createdAt);
    },
    [],
  );
}

export async function deleteHistoryItem(id: string): Promise<void> {
  await withStore('readwrite', (store) => promisify(store.delete(id)), undefined);
}

export async function clearHistoryItems(): Promise<void> {
  await withStore('readwrite', (store) => promisify(store.clear()), undefined);
}

/** Rough total size of stored blobs, for the dashboard's storage line. */
export async function historyFootprintBytes(): Promise<number> {
  const items = await listHistoryItems();
  return items.reduce(
    (total, item) => total + item.thumbnail.size + (item.result?.size ?? 0),
    0,
  );
}

/**
 * Produces a small preview from a result blob using createImageBitmap + canvas,
 * which keeps the work off the main thread's decode path where supported.
 */
export async function makeThumbnailBlob(source: Blob, size = 240): Promise<Blob> {
  const bitmap = await createImageBitmap(source);
  const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    return source;
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? source), 'image/png');
  });
}
