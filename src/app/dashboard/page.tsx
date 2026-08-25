'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ImageOff, Sparkles } from 'lucide-react';
import { StatTile } from '@/components/dashboard/stat-tile';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { listHistoryItems } from '@/lib/history/local-history';
import { formatBytes, formatRelativeTime } from '@/lib/utils';
import type { HistoryItem } from '@/lib/client/types';

interface UsageResponse {
  usage: {
    period: string;
    imagesProcessed: number;
    batchesProcessed: number;
    apiRequests: number;
    monthlyLimit: number;
    remaining: number;
  };
  plan: { id: string; name: string };
}

/**
 * Overview.
 *
 * Usage figures come from the server (they are authoritative for quota);
 * recent activity comes from this browser's IndexedDB, because that is where
 * the images themselves live.
 */
export default function DashboardOverview() {
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [recent, setRecent] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;

    void fetch('/api/usage')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('failed'))))
      .then((data: UsageResponse) => active && setUsage(data))
      .catch(() => active && setFailed(true));

    void listHistoryItems().then((items) => active && setRecent(items.slice(0, 5)));

    return () => {
      active = false;
    };
  }, []);

  const used = usage?.usage.imagesProcessed ?? 0;
  const limit = usage?.usage.monthlyLimit ?? 0;
  const percentUsed = limit > 0 ? (used / limit) * 100 : 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">Overview</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {usage ? `Billing period ${usage.usage.period}` : 'Loading your usage…'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {usage && <Badge variant="outline">{usage.plan.name} plan</Badge>}
          <Button variant="accent" size="sm" asChild>
            <Link href="/remove-background">
              <Sparkles aria-hidden />
              New image
            </Link>
          </Button>
        </div>
      </header>

      {failed && (
        <p className="rounded-md border border-danger/25 bg-danger-soft/40 p-4 text-sm text-ink">
          We couldn&apos;t load your usage just now. Refresh to try again.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        {usage ? (
          <>
            <StatTile
              label="Images processed"
              value={used.toLocaleString()}
              hint={`of ${limit.toLocaleString()} this month`}
            />
            <StatTile
              label="Remaining"
              value={usage.usage.remaining.toLocaleString()}
              hint={usage.usage.remaining === 0 ? 'Quota reached' : 'Resets on the 1st'}
            />
            <StatTile
              label="Batches"
              value={usage.usage.batchesProcessed.toLocaleString()}
              hint={`${usage.usage.apiRequests.toLocaleString()} API requests`}
            />
          </>
        ) : (
          Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[116px] rounded-lg" />
          ))
        )}
      </div>

      {usage && (
        <div className="rounded-lg border border-line bg-paper-raised p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-sm font-medium text-ink">Monthly quota</p>
            <p className="text-xs tabular-nums text-ink-muted">
              {used} / {limit}
            </p>
          </div>
          <Progress value={percentUsed} label="Monthly quota used" />
          {percentUsed > 80 && (
            <p className="mt-3 text-xs text-warning">
              You&apos;ve used {Math.round(percentUsed)}% of this month&apos;s images. The counter
              resets on the 1st.
            </p>
          )}
        </div>
      )}

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight text-ink">Recent activity</h2>
          {recent && recent.length > 0 && (
            <Link
              href="/dashboard/history"
              className="-my-1 inline-flex min-h-8 items-center rounded-xs px-1 text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
            >
              View all
            </Link>
          )}
        </div>

        {recent === null ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-16 rounded-md" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<ImageOff className="size-5" aria-hidden />}
            title="Nothing processed yet"
            body="Images you process appear here. They're stored in this browser only — never uploaded to us for storage."
            action={{ href: '/remove-background', label: 'Remove a background' }}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-md border border-line bg-paper-raised p-2.5"
              >
                <ThumbnailPreview blob={item.thumbnail} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{item.filename}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-ink-subtle">
                    {item.width} × {item.height} · {formatBytes(item.byteSize)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-ink-subtle">
                  {formatRelativeTime(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Object URLs must be revoked or a long dashboard session leaks blobs. */
function ThumbnailPreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return (
    <span className="checkerboard checkerboard-sm size-11 shrink-0 overflow-hidden rounded-xs border border-line">
      {url && <img src={url} alt="" className="size-full object-cover" />}
    </span>
  );
}
