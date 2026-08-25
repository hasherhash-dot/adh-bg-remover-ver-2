import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { COLLECTIONS, getStore } from '@/lib/persistence/store';
import type { PlanId } from '@/lib/billing/plans';

/**
 * API key issuance and verification.
 *
 * Keys are shown to the user exactly once, at creation. Only a SHA-256 digest
 * is stored, so a leaked datastore does not leak usable credentials. Lookup is
 * by digest, which keeps verification O(1) and constant-time.
 */

const KEY_PREFIX = 'adh_live_';
const SECRET_BYTES = 24;

export interface ApiKeyRecord {
  /** SHA-256 of the full key. Also the storage id. */
  hash: string;
  ownerId: string;
  name: string;
  /** First characters of the key, safe to display in a list. */
  preview: string;
  planId: PlanId;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  revokedAt: string | null;
}

/** What the dashboard is allowed to see. Never contains the secret. */
export type ApiKeySummary = Omit<ApiKeyRecord, 'hash'> & { id: string };

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateApiKey(): string {
  return `${KEY_PREFIX}${randomBytes(SECRET_BYTES).toString('base64url')}`;
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length > KEY_PREFIX.length + 16;
}

export async function createApiKey(params: {
  ownerId: string;
  name: string;
  planId: PlanId;
}): Promise<{ key: string; summary: ApiKeySummary }> {
  const key = generateApiKey();
  const hash = hashKey(key);
  const record: ApiKeyRecord = {
    hash,
    ownerId: params.ownerId,
    name: params.name.slice(0, 64) || 'Untitled key',
    preview: `${key.slice(0, KEY_PREFIX.length + 4)}…${key.slice(-4)}`,
    planId: params.planId,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    requestCount: 0,
    revokedAt: null,
  };

  await getStore().put(COLLECTIONS.apiKeys, hash, record);
  return { key, summary: toSummary(record) };
}

export async function listApiKeys(ownerId: string): Promise<ApiKeySummary[]> {
  const all = await getStore().list<ApiKeyRecord>(COLLECTIONS.apiKeys);
  return all
    .map(({ value }) => value)
    .filter((record) => record.ownerId === ownerId && !record.revokedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toSummary);
}

export async function revokeApiKey(ownerId: string, id: string): Promise<boolean> {
  const record = await getStore().get<ApiKeyRecord>(COLLECTIONS.apiKeys, id);
  if (!record || record.ownerId !== ownerId) return false;
  await getStore().put(COLLECTIONS.apiKeys, id, {
    ...record,
    revokedAt: new Date().toISOString(),
  });
  return true;
}

/**
 * Verifies a presented key.
 *
 * The digest comparison is constant-time. A revoked key is treated exactly like
 * an unknown one so callers cannot probe for previously valid keys.
 */
export async function verifyApiKey(presented: string): Promise<ApiKeyRecord | null> {
  if (!looksLikeApiKey(presented)) return null;

  const digest = hashKey(presented);
  const record = await getStore().get<ApiKeyRecord>(COLLECTIONS.apiKeys, digest);
  if (!record || record.revokedAt) return null;

  const a = Buffer.from(digest, 'hex');
  const b = Buffer.from(record.hash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return record;
}

/** Fire-and-forget usage stamp; never blocks the request path. */
export async function recordApiKeyUse(record: ApiKeyRecord): Promise<void> {
  await getStore().put(COLLECTIONS.apiKeys, record.hash, {
    ...record,
    lastUsedAt: new Date().toISOString(),
    requestCount: record.requestCount + 1,
  });
}

function toSummary(record: ApiKeyRecord): ApiKeySummary {
  const { hash, ...rest } = record;
  return { id: hash, ...rest };
}

/** Extracts a bearer token or `x-api-key` header from a request. */
export function extractApiKey(headers: Headers): string | null {
  const header = headers.get('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return headers.get('x-api-key');
}
