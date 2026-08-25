/**
 * Job store shared by the service worker, the popup and the result page.
 *
 * IndexedDB rather than chrome.storage because the payloads are image blobs.
 * chrome.storage serialises to JSON, which would mean base64 — a third more
 * bytes, plus an encode and decode on every hop. IndexedDB stores Blobs
 * natively and is available in an MV3 service worker.
 */

const DB_NAME = 'adh-extension';
const DB_VERSION = 1;
const STORE = 'jobs';
const MAX_JOBS = 12;

export type JobState = 'pending' | 'processing' | 'done' | 'error';

export interface Job {
  id: string;
  state: JobState;
  filename: string;
  /** Page the image came from, when started via the context menu. */
  sourceUrl?: string;
  original: Blob | null;
  result: Blob | null;
  width?: number;
  height?: number;
  byteSize?: number;
  processingTimeMs?: number;
  error?: string;
  createdAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
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

export async function putJob(job: Job): Promise<void> {
  const db = await open();
  try {
    const transaction = db.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    await promisify(store.put(job));
    await prune(store);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function getJob(id: string): Promise<Job | null> {
  const db = await open();
  try {
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    return (await promisify(store.get(id) as IDBRequest<Job | undefined>)) ?? null;
  } finally {
    db.close();
  }
}

export async function patchJob(id: string, patch: Partial<Job>): Promise<Job | null> {
  const existing = await getJob(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  await putJob(next);
  return next;
}

/** Old jobs hold full-size blobs; keeping every one would grow without bound. */
async function prune(store: IDBObjectStore): Promise<void> {
  const count = await promisify(store.count());
  if (count <= MAX_JOBS) return;

  let toRemove = count - MAX_JOBS;
  await new Promise<void>((resolve) => {
    const cursorRequest = store.index('createdAt').openCursor(null, 'next');
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

export function createJobId(): string {
  return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const JOB_UPDATED = 'adh:job-updated';

/**
 * Broadcasts a job change. Nothing may be listening (no result tab open yet),
 * and sendMessage rejects in that case — which is not an error worth surfacing.
 */
export function broadcastJob(jobId: string): void {
  chrome.runtime.sendMessage({ type: JOB_UPDATED, jobId }).catch(() => undefined);
}
