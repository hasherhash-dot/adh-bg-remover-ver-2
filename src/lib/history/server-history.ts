import 'server-only';
import { getStore } from '@/lib/persistence/store';

/**
 * Server-side processing history.
 *
 * METADATA ONLY. No image bytes are ever written here — uploads stay in memory
 * for the life of the request and are then discarded. The dashboard's visual
 * history (with thumbnails) lives in the browser's IndexedDB, which is why the
 * two are separate modules: this one exists so API consumers can reconcile what
 * they submitted, without the service retaining anyone's photographs.
 */

const COLLECTION = 'history';
const MAX_ENTRIES_PER_OWNER = 100;

export interface HistoryEntry {
  id: string;
  filename: string;
  width: number;
  height: number;
  byteSize: number;
  processingTimeMs: number;
  createdAt: string;
}

export async function appendHistory(
  ownerId: string,
  entry: Omit<HistoryEntry, 'id' | 'createdAt'>,
): Promise<void> {
  const existing = (await getStore().get<HistoryEntry[]>(COLLECTION, ownerId)) ?? [];
  const next: HistoryEntry[] = [
    {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, MAX_ENTRIES_PER_OWNER);

  // History is a nicety; never fail a successful conversion because of it.
  await getStore()
    .put(COLLECTION, ownerId, next)
    .catch(() => undefined);
}

export async function listHistory(ownerId: string, limit = 50): Promise<HistoryEntry[]> {
  const entries = (await getStore().get<HistoryEntry[]>(COLLECTION, ownerId)) ?? [];
  return entries.slice(0, limit);
}

export async function clearHistory(ownerId: string): Promise<void> {
  await getStore().delete(COLLECTION, ownerId);
}
