'use client';

import { useEffect, useState } from 'react';
import { Check, FileArchive, Loader2 } from 'lucide-react';
import { useInView } from '@/hooks/use-in-view';
import { cn } from '@/lib/utils';

/**
 * Batch processing, told as a sequence instead of a paragraph.
 *
 * Five real photographs move queued -> processing -> done, then the ZIP action
 * appears. It runs once, when the section is scrolled to, and never loops: a
 * queue that restarts forever is decoration, and it also implies the product is
 * doing work it is not.
 *
 * Two things are deliberately faithful to the real `BatchQueue`:
 *
 *   No percentages. The server reports no progress fraction while a model is
 *   running, so the real queue shows an indeterminate bar for a processing row.
 *   Inventing "63%" here would be inventing a capability.
 *
 *   The statuses are the product's own — queued, processing, done — not a
 *   marketing paraphrase of them.
 *
 * Reduced motion skips straight to the finished state. The story is "five in,
 * five out, one ZIP", and that is fully legible without watching it happen.
 */

export interface BatchItem {
  filename: string;
  beforeUrl: string;
  afterUrl: string;
}

type Stage = 'queued' | 'processing' | 'done';

/** Gap between one row starting and the next. */
const STEP_MS = 260;
/** How long a row spends visibly processing. */
const WORK_MS = 900;

export interface BatchStripProps {
  items: BatchItem[];
  className?: string;
}

export function BatchStrip({ items, className }: BatchStripProps) {
  const { ref, inView } = useInView<HTMLDivElement>({ margin: 1.1 });
  const [stages, setStages] = useState<Stage[]>(() => items.map(() => 'queued'));
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!inView) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced) {
      setStages(items.map(() => 'done'));
      setFinished(true);
      return;
    }

    const set = (index: number, stage: Stage) =>
      setStages((current) => current.map((value, i) => (i === index ? stage : value)));

    const timers = items.flatMap((_, index) => [
      window.setTimeout(() => set(index, 'processing'), 400 + index * STEP_MS),
      window.setTimeout(() => set(index, 'done'), 400 + index * STEP_MS + WORK_MS),
    ]);

    timers.push(
      window.setTimeout(
        () => setFinished(true),
        400 + (items.length - 1) * STEP_MS + WORK_MS + 200,
      ),
    );

    return () => timers.forEach(window.clearTimeout);
  }, [inView, items]);

  const doneCount = stages.filter((stage) => stage === 'done').length;

  return (
    <div ref={ref} className={cn('overflow-hidden rounded-xl border border-line bg-paper-raised shadow-raised', className)}>
      {/* Queue header, mirroring the real one: a count and the bulk action. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-paper-raised px-4 py-3 sm:px-5">
        <p className="text-[13px] font-medium text-ink">
          {items.length} images
          <span className="ml-2 tabular-nums text-ink-subtle">{doneCount} done</span>
        </p>

        <span
          className={cn(
            'flex min-h-9 items-center gap-2 rounded-md px-3.5 text-[13px] font-semibold transition-all duration-300',
            finished
              ? 'bg-accent text-white opacity-100'
              : 'bg-paper-sunken text-ink-subtle opacity-60',
          )}
        >
          <FileArchive className="size-4" aria-hidden />
          Download all {items.length} as ZIP
        </span>
      </div>

      {/* The strip. Horizontal on desktop, a vertical list on a phone — a row
          of five 60px thumbnails would be unreadable at 375px. */}
      <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item, index) => {
          const stage = stages[index] ?? 'queued';
          return (
            <li key={item.filename} className="flex gap-3 bg-paper-raised p-4 lg:flex-col lg:gap-0">
              <div className="checkerboard checkerboard-sm relative size-16 shrink-0 overflow-hidden rounded-md border border-line lg:size-auto lg:aspect-square lg:w-full">
                {/* Both frames stay mounted; only opacity changes, so the
                    swap costs no decode at the moment it happens. */}
                <img
                  src={item.beforeUrl}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className={cn(
                    'xfade absolute inset-0 size-full object-cover',
                    stage === 'done' ? 'opacity-0' : 'opacity-100',
                    stage === 'processing' && 'grayscale',
                  )}
                />
                <img
                  src={item.afterUrl}
                  alt={`${item.filename}, background removed`}
                  loading="lazy"
                  className={cn(
                    'xfade absolute inset-0 size-full object-contain',
                    stage === 'done' ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </div>

              <div className="min-w-0 flex-1 lg:mt-3">
                <p className="truncate text-[12px] font-medium text-ink">{item.filename}</p>

                <div className="mt-2" aria-live="off">
                  {stage === 'queued' && (
                    <span className="text-[11px] text-ink-subtle">Queued</span>
                  )}

                  {stage === 'processing' && (
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                      <Loader2 className="size-3 animate-spin text-accent" aria-hidden />
                      Removing background
                    </span>
                  )}

                  {stage === 'done' && (
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-success">
                      <Check className="size-3" aria-hidden />
                      Done
                    </span>
                  )}
                </div>

                {/* Indeterminate, because that is what the real row shows. */}
                <span
                  className={cn(
                    'mt-2 block h-1 overflow-hidden rounded-full bg-paper-sunken transition-opacity duration-200',
                    stage === 'processing' ? 'opacity-100' : 'opacity-0',
                  )}
                  aria-hidden
                >
                  <span className="indeterminate block size-full" />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
