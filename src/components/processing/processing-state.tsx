'use client';

import { useEffect, useState } from 'react';
import { cn, formatBytes } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import type { JobStatus } from '@/lib/client/types';

/**
 * The waiting screen.
 *
 * Honesty rule: the bar shows *upload* progress, which is genuinely measurable.
 * Once the bytes are delivered the bar becomes indeterminate rather than
 * inventing a percentage for server-side inference, and the label says what is
 * actually happening. Nothing here completes unless the work does.
 *
 * The user's own image is the loading animation — dimmed, with a soft sweep
 * passing over it. That reads as "we are working on *this*" in a way no
 * spinner does, and it keeps their picture on screen the whole time.
 */

export interface ProcessingStateProps {
  imageUrl: string;
  filename: string;
  fileSize: number;
  status: JobStatus;
  /** 0..1 during upload, null while the server is working. */
  uploadRatio: number | null;
  className?: string;
}

const PROCESSING_DETAIL = [
  'Finding the edges of your subject',
  'Separating foreground from background',
  'Refining fine detail like hair and edges',
];

export function ProcessingState({
  imageUrl,
  filename,
  fileSize,
  status,
  uploadRatio,
  className,
}: ProcessingStateProps) {
  const isUploading = status === 'uploading';
  const percent = isUploading && uploadRatio !== null ? uploadRatio * 100 : null;

  const [aspect, setAspect] = useState(4 / 3);
  const [detailIndex, setDetailIndex] = useState(0);

  // Rotating detail lines keep a long wait from feeling stalled, without ever
  // implying progress that has not happened.
  useEffect(() => {
    if (status !== 'processing') return;
    const timer = setInterval(
      () => setDetailIndex((index) => (index + 1) % PROCESSING_DETAIL.length),
      2800,
    );
    return () => clearInterval(timer);
  }, [status]);

  const title =
    status === 'queued' ? 'Queued' : isUploading ? 'Uploading' : 'Removing background';
  const detail =
    status === 'queued'
      ? 'Waiting for a free slot'
      : isUploading
        ? 'Sending your image securely'
        : PROCESSING_DETAIL[detailIndex];

  return (
    <div className={cn('flex flex-col gap-5', className)}>
      <div
        style={{
          aspectRatio: `${aspect}`,
          width: `min(100%, calc(58vh * ${aspect.toFixed(4)}))`,
        }}
        className="relative mx-auto overflow-hidden rounded-lg border border-line bg-paper-sunken"
      >
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) setAspect(naturalWidth / naturalHeight);
          }}
          className="absolute inset-0 size-full object-contain opacity-40 saturate-50"
        />

        {/* Sweep — decorative, and it stops when the user prefers less motion. */}
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="absolute inset-x-0 h-[14%] animate-sweep"
            style={{
              background:
                'linear-gradient(to bottom, transparent, rgb(215 242 75 / 0.45), transparent)',
            }}
          />
        </div>

        <div className="absolute inset-0 flex items-center justify-center bg-paper/25 backdrop-blur-[1px]">
          <div className="flex items-center gap-2.5 rounded-full border border-line bg-paper-raised/95 px-4 py-2 shadow-raised">
            <PulsingDot />
            <span className="text-sm font-medium tracking-tight text-ink">{title}…</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-col gap-2.5" role="status" aria-live="polite">
        <div className="flex items-baseline justify-between gap-4">
          <p className="truncate text-sm font-medium text-ink" title={filename}>
            {filename}
          </p>
          <p className="shrink-0 text-xs tabular-nums text-ink-subtle">
            {percent !== null ? `${Math.round(percent)}%` : formatBytes(fileSize)}
          </p>
        </div>

        <Progress value={percent} label={`${title} ${filename}`} />

        <p className="text-xs text-ink-muted transition-opacity duration-300">{detail}</p>
      </div>
    </div>
  );
}

function PulsingDot() {
  return (
    <span className="relative flex size-2" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-ink opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-ink" />
    </span>
  );
}

/** Compact inline status used inside the batch queue. */
export function InlineProcessing({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
      <span className="relative flex size-1.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-ink opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-ink" />
      </span>
      {label}
    </span>
  );
}
