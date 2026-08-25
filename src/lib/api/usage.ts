import 'server-only';
import { COLLECTIONS, getStore } from '@/lib/persistence/store';
import { getPlan, type PlanId } from '@/lib/billing/plans';
import { AppError } from '@/lib/errors';

/**
 * Monthly usage accounting.
 *
 * Counters are keyed by owner + calendar month so a new month resets naturally
 * without a scheduled job. Increments happen only after a successful
 * conversion, so a failed upload never costs the user an image.
 */

export interface UsageRecord {
  ownerId: string;
  /** YYYY-MM */
  period: string;
  imagesProcessed: number;
  batchesProcessed: number;
  apiRequests: number;
  updatedAt: string;
}

export interface UsageSnapshot extends UsageRecord {
  planId: PlanId;
  monthlyLimit: number;
  remaining: number;
}

export function currentPeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function usageId(ownerId: string, period: string): string {
  return `${ownerId}:${period}`;
}

export async function getUsage(ownerId: string, planId: PlanId): Promise<UsageSnapshot> {
  const period = currentPeriod();
  const stored = await getStore().get<UsageRecord>(COLLECTIONS.usage, usageId(ownerId, period));
  const record: UsageRecord = stored ?? {
    ownerId,
    period,
    imagesProcessed: 0,
    batchesProcessed: 0,
    apiRequests: 0,
    updatedAt: new Date().toISOString(),
  };
  const limit = getPlan(planId).entitlements.monthlyImages;

  return {
    ...record,
    planId,
    monthlyLimit: limit,
    remaining: Math.max(0, limit - record.imagesProcessed),
  };
}

/**
 * Throws QUOTA_EXCEEDED when the owner has no images left this month.
 * Called before processing so the user is not made to wait for work that will
 * be rejected.
 */
export async function assertWithinQuota(
  ownerId: string,
  planId: PlanId,
  requested = 1,
): Promise<UsageSnapshot> {
  const usage = await getUsage(ownerId, planId);
  if (usage.remaining < requested) {
    throw new AppError('QUOTA_EXCEEDED', {
      detail: `${usage.imagesProcessed}/${usage.monthlyLimit} used in ${usage.period}`,
    });
  }
  return usage;
}

export async function recordUsage(
  ownerId: string,
  delta: { images?: number; batches?: number; apiRequests?: number },
): Promise<void> {
  const period = currentPeriod();
  const id = usageId(ownerId, period);
  const existing = await getStore().get<UsageRecord>(COLLECTIONS.usage, id);

  const next: UsageRecord = {
    ownerId,
    period,
    imagesProcessed: (existing?.imagesProcessed ?? 0) + (delta.images ?? 0),
    batchesProcessed: (existing?.batchesProcessed ?? 0) + (delta.batches ?? 0),
    apiRequests: (existing?.apiRequests ?? 0) + (delta.apiRequests ?? 0),
    updatedAt: new Date().toISOString(),
  };

  await getStore().put(COLLECTIONS.usage, id, next);
}
