'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { GlobalDropOverlay, UploadZone } from '@/components/upload/upload-zone';
import { ProcessingState } from '@/components/processing/processing-state';
import { ResultView } from '@/components/result/result-view';
import { BatchQueue } from '@/components/batch/batch-queue';
import { useImageJobs } from '@/hooks/use-image-jobs';
import type { ImageJob } from '@/lib/client/types';
import { cn } from '@/lib/utils';

/**
 * The whole upload → process → preview → download flow in one component.
 *
 * It renders one of three states, chosen by what the queue contains:
 *   empty      → the upload zone
 *   single     → focused processing / result view
 *   batch      → queue list with a preview pane for the selected item
 *
 * This is the only stateful piece the marketing page embeds, which is what
 * makes the hero uploader the real product rather than a screenshot of it. It
 * is deliberately the same size everywhere: on the landing page the uploader is
 * the main event, not a teaser for one.
 */

export interface BackgroundRemoverStudioProps {
  className?: string;
}

export function BackgroundRemoverStudio({ className }: BackgroundRemoverStudioProps) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { jobs, stats, addFiles, retry, cancel, remove, clear } = useImageJobs({
    onError: (message) => toast({ tone: 'error', title: 'Upload problem', description: message }),
  });

  const isBatch = jobs.length > 1;

  const selectedJob = useMemo<ImageJob | null>(() => {
    if (jobs.length === 0) return null;
    if (!isBatch) return jobs[0] ?? null;
    return jobs.find((job) => job.id === selectedId) ?? jobs.find((j) => j.status === 'done') ?? null;
  }, [isBatch, jobs, selectedId]);

  const handleFiles = useCallback(
    (files: File[], source: 'drop' | 'browse' | 'paste' = 'drop') => {
      addFiles(files, source);
    },
    [addFiles],
  );

  // Warn before leaving with work in flight — losing a batch to a stray
  // navigation is the kind of thing that makes a tool feel unserious.
  useEffect(() => {
    if (!stats.isBusy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [stats.isBusy]);

  const startOver = useCallback(() => {
    clear();
    setSelectedId(null);
  }, [clear]);

  return (
    <div className={cn('relative', className)}>
      <GlobalDropOverlay onFiles={(files) => handleFiles(files, 'drop')} enabled />

      {jobs.length === 0 && (
        <UploadZone onFiles={handleFiles} multiple />
      )}

      {/* Single-image flow */}
      {jobs.length === 1 && selectedJob && (
        <SingleJobView job={selectedJob} onRetry={() => retry(selectedJob.id)} onStartOver={startOver} onCancel={() => cancel(selectedJob.id)} />
      )}

      {/* Batch flow */}
      {isBatch && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <div className="order-2 lg:order-1">
            <BatchQueue
              jobs={jobs}
              onRetry={retry}
              onRemove={remove}
              onAddFiles={(files) => handleFiles(files, 'browse')}
              onClear={startOver}
              onSelect={(job) => setSelectedId(job.id)}
              selectedId={selectedJob?.id ?? null}
            />
          </div>
          <div className="order-1 lg:order-2">
            {selectedJob?.status === 'done' && selectedJob.result ? (
              <div className="lg:sticky lg:top-24">
                <ResultView job={selectedJob} onStartOver={startOver} compact />
              </div>
            ) : (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong p-8 text-center">
                <p className="text-sm font-medium text-ink">Preview</p>
                <p className="max-w-56 text-xs text-ink-muted">
                  Select a finished image from the queue to compare and download it.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SingleJobView({
  job,
  onRetry,
  onStartOver,
  onCancel,
}: {
  job: ImageJob;
  onRetry: () => void;
  onStartOver: () => void;
  onCancel: () => void;
}) {
  if (job.status === 'error') {
    return (
      <div className="flex flex-col items-center gap-5 rounded-lg border border-danger/25 bg-danger-soft/40 px-6 py-12 text-center animate-fade-in">
        <span className="flex size-12 items-center justify-center rounded-lg border border-danger/25 bg-paper-raised">
          <AlertTriangle className="size-5 text-danger" aria-hidden />
        </span>
        <div className="max-w-md">
          <h3 className="text-base font-semibold tracking-tight text-ink">
            We couldn&apos;t process this image
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{job.error?.message}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {job.error?.retryable !== false && (
            <Button variant="primary" onClick={onRetry}>
              <RotateCw aria-hidden />
              Try again
            </Button>
          )}
          <Button variant="outline" onClick={onStartOver}>
            Choose another image
          </Button>
        </div>
      </div>
    );
  }

  if (job.status === 'done' && job.result) {
    return <ResultView job={job} onStartOver={onStartOver} />;
  }

  if (job.status === 'cancelled') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-paper-raised px-6 py-12 text-center">
        <p className="text-sm text-ink-muted">Cancelled.</p>
        <Button variant="outline" onClick={onStartOver}>
          Start over
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ProcessingState
        imageUrl={job.originalUrl}
        filename={job.filename}
        fileSize={job.originalSize}
        status={job.status}
        uploadRatio={job.uploadRatio}
      />
      <div className="flex justify-center">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
