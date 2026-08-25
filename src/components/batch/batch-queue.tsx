'use client';

import { useState } from 'react';
import JSZip from 'jszip';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileArchive,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { InlineProcessing } from '@/components/processing/processing-state';
import { AddMoreButton } from '@/components/upload/upload-zone';
import { track } from '@/lib/analytics';
import { cn, cutoutFilename, formatBytes } from '@/lib/utils';
import type { ImageJob } from '@/lib/client/types';

/**
 * The batch view: one row per image with its own status, error and download.
 * Rows are independent — a failure never blocks the others, and each can be
 * retried on its own.
 *
 * "Download all" zips completed results in the browser. The blobs are already
 * local, so there is no reason to make the user wait on another round trip.
 */

export interface BatchQueueProps {
  jobs: ImageJob[];
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onAddFiles: (files: File[]) => void;
  onClear: () => void;
  onSelect?: (job: ImageJob) => void;
  selectedId?: string | null;
}

export function BatchQueue({
  jobs,
  onRetry,
  onRemove,
  onAddFiles,
  onClear,
  onSelect,
  selectedId,
}: BatchQueueProps) {
  const { toast } = useToast();
  const [zipping, setZipping] = useState(false);

  const completed = jobs.filter((job) => job.status === 'done' && job.result);
  const failed = jobs.filter((job) => job.status === 'error');
  const pending = jobs.filter(
    (job) => job.status === 'uploading' || job.status === 'processing' || job.status === 'queued',
  );
  const allSettled = pending.length === 0;

  const downloadAll = async () => {
    if (completed.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();

      for (const job of completed) {
        if (!job.result) continue;
        const base = cutoutFilename(job.filename);
        let name = base;
        let counter = 2;
        while (used.has(name)) {
          name = base.replace(/\.png$/, `-${counter}.png`);
          counter += 1;
        }
        used.add(name);
        zip.file(name, job.result.blob);
      }

      const archive = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        // PNG data is already compressed; a higher level buys almost nothing.
        compressionOptions: { level: 1 },
      });

      const url = URL.createObjectURL(archive);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'backgrounds-removed.zip';
      anchor.click();
      URL.revokeObjectURL(url);

      track('batch_download_all', { count: completed.length });
    } catch {
      toast({
        tone: 'error',
        title: "We couldn't build the ZIP file",
        description: 'Try downloading the images individually.',
      });
    } finally {
      setZipping(false);
    }
  };

  const downloadOne = (job: ImageJob) => {
    if (!job.result) return;
    const anchor = document.createElement('a');
    anchor.href = job.result.url;
    anchor.download = cutoutFilename(job.filename);
    anchor.click();
    track('download_clicked', { format: 'png', background: 'transparent' });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            {jobs.length} image{jobs.length === 1 ? '' : 's'}
          </h2>
          {completed.length > 0 && (
            <Badge variant="success" size="sm">
              {completed.length} done
            </Badge>
          )}
          {pending.length > 0 && (
            <Badge variant="neutral" size="sm">
              {pending.length} in progress
            </Badge>
          )}
          {failed.length > 0 && (
            <Badge variant="danger" size="sm">
              {failed.length} failed
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <AddMoreButton onFiles={onAddFiles} />
          <Button variant="ghost" size="sm" onClick={onClear}>
            <Trash2 aria-hidden />
            Clear
          </Button>
        </div>
      </div>

      {/* Download all rises to the top once everything has settled — that is
          the moment it becomes the thing the user wants. */}
      {completed.length > 1 && allSettled && (
        <Button
          variant="accent"
          size="lg"
          onClick={downloadAll}
          loading={zipping}
          loadingLabel="Building ZIP…"
          className="w-full animate-fade-up"
        >
          <FileArchive aria-hidden />
          Download all {completed.length} as ZIP
        </Button>
      )}

      <ul className="flex flex-col gap-2" aria-label="Processing queue">
        {jobs.map((job) => (
          <li key={job.id}>
            <BatchRow
              job={job}
              selected={selectedId === job.id}
              onRetry={() => onRetry(job.id)}
              onRemove={() => onRemove(job.id)}
              onDownload={() => downloadOne(job)}
              onSelect={onSelect ? () => onSelect(job) : undefined}
            />
          </li>
        ))}
      </ul>

      {/* While work is still running, keep the action available but quiet. */}
      {completed.length > 1 && !allSettled && (
        <Button
          variant="outline"
          size="md"
          onClick={downloadAll}
          loading={zipping}
          loadingLabel="Building ZIP…"
          className="w-full"
        >
          <FileArchive aria-hidden />
          Download {completed.length} finished
        </Button>
      )}
    </div>
  );
}

function BatchRow({
  job,
  selected,
  onRetry,
  onRemove,
  onDownload,
  onSelect,
}: {
  job: ImageJob;
  selected: boolean;
  onRetry: () => void;
  onRemove: () => void;
  onDownload: () => void;
  onSelect?: () => void;
}) {
  const isBusy = job.status === 'uploading' || job.status === 'processing';
  const isDone = job.status === 'done' && Boolean(job.result);
  const percent =
    job.status === 'uploading' && job.uploadRatio !== null ? job.uploadRatio * 100 : null;
  const selectable = Boolean(onSelect) && isDone;

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border p-2.5 transition-colors',
        selected
          ? 'border-ink bg-paper-sunken/50'
          : 'border-line bg-paper-raised hover:border-line-strong',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={!selectable}
        className={cn(
          'checkerboard checkerboard-sm relative size-12 shrink-0 overflow-hidden rounded-xs border border-line',
          selectable && 'cursor-pointer transition-opacity hover:opacity-75',
        )}
        aria-label={selectable ? `Preview ${job.filename}` : undefined}
      >
        <img
          src={job.result?.url ?? job.originalUrl}
          alt=""
          loading="lazy"
          className={cn('size-full object-cover', isBusy && 'opacity-50')}
        />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-ink" title={job.filename}>
          {job.filename}
        </p>

        {isDone && job.result ? (
          <p className="mt-0.5 text-xs tabular-nums text-ink-subtle">
            {job.result.width} × {job.result.height} · {formatBytes(job.result.byteSize)}
          </p>
        ) : job.status === 'error' ? (
          <p className="mt-0.5 flex items-start gap-1.5 text-xs text-danger">
            <AlertCircle className="mt-px size-3 shrink-0" aria-hidden />
            <span className="line-clamp-2">{job.error?.message}</span>
          </p>
        ) : job.status === 'queued' ? (
          <p className="mt-0.5 text-xs text-ink-subtle">Queued</p>
        ) : job.status === 'cancelled' ? (
          <p className="mt-0.5 text-xs text-ink-subtle">Cancelled</p>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1">
            <InlineProcessing
              label={job.status === 'uploading' ? 'Uploading' : 'Removing background'}
            />
            <Progress value={percent} size="sm" label={job.filename} />
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {isDone && (
          <>
            <CheckCircle2 className="size-4 text-success" aria-label="Completed" />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDownload}
              aria-label={`Download ${job.filename}`}
            >
              <Download aria-hidden />
            </Button>
          </>
        )}
        {job.status === 'error' && job.error?.retryable !== false && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onRetry}
            aria-label={`Try ${job.filename} again`}
          >
            <RotateCw aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={isBusy ? `Cancel ${job.filename}` : `Remove ${job.filename}`}
        >
          <X aria-hidden />
        </Button>
      </div>
    </div>
  );
}
