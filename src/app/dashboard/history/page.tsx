'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, ImageOff, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/dashboard/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  clearHistoryItems,
  deleteHistoryItem,
  historyFootprintBytes,
  listHistoryItems,
} from '@/lib/history/local-history';
import { cutoutFilename, formatBytes, formatRelativeTime } from '@/lib/utils';
import type { HistoryItem } from '@/lib/client/types';

/**
 * Processing history.
 *
 * Reads exclusively from IndexedDB. Nothing on this page hits the network,
 * which is the point: the images never left the browser in the first place.
 */
export default function HistoryPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [footprint, setFootprint] = useState(0);

  const load = useCallback(async () => {
    const [list, bytes] = await Promise.all([listHistoryItems(), historyFootprintBytes()]);
    setItems(list);
    setFootprint(bytes);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    await deleteHistoryItem(id);
    await load();
    toast({ tone: 'success', title: 'Removed from history' });
  };

  const clearAll = async () => {
    await clearHistoryItems();
    await load();
    toast({ tone: 'success', title: 'History cleared' });
  };

  const download = (item: HistoryItem) => {
    const blob = item.result ?? item.thumbnail;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = cutoutFilename(item.filename);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">History</h1>
          <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-muted">
            Stored in this browser only. Clearing your site data removes it, and it will not appear
            on your other devices.
          </p>
        </div>
        {items && items.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-ink-subtle">{formatBytes(footprint)} stored</span>
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <Trash2 aria-hidden />
              Clear all
            </Button>
          </div>
        )}
      </header>

      {items === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ImageOff className="size-5" aria-hidden />}
          title="No history yet"
          body="Every image you process is saved here in your browser so you can download it again later."
          action={{ href: '/remove-background', label: 'Remove a background' }}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="group flex flex-col overflow-hidden rounded-lg border border-line bg-paper-raised"
            >
              <HistoryThumb blob={item.thumbnail} filename={item.filename} />
              <div className="flex flex-1 flex-col p-3.5">
                <p className="truncate text-[13px] font-medium text-ink" title={item.filename}>
                  {item.filename}
                </p>
                <p className="mt-1 text-xs tabular-nums text-ink-subtle">
                  {item.width} × {item.height} · {formatBytes(item.byteSize)}
                </p>
                <p className="mt-0.5 text-xs text-ink-subtle">
                  {formatRelativeTime(item.createdAt)}
                </p>
                <div className="mt-3 flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => download(item)}
                  >
                    <Download aria-hidden />
                    Download
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(item.id)}
                    aria-label={`Delete ${item.filename} from history`}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HistoryThumb({ blob, filename }: { blob: Blob; filename: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  return (
    <div className="checkerboard checkerboard-sm aspect-4/3 w-full overflow-hidden border-b border-line">
      {url && (
        <img
          src={url}
          alt={`Background-removed version of ${filename}`}
          loading="lazy"
          className="size-full object-contain"
        />
      )}
    </div>
  );
}
