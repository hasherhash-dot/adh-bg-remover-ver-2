'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { removeBackground, validateFile, ApiError } from '@/lib/client/api-client';
import { UPLOAD_LIMITS } from '@/lib/config/public';
import { track } from '@/lib/analytics';
import { addHistoryItem, makeThumbnailBlob } from '@/lib/history/local-history';
import type { BackgroundChoice, ImageJob } from '@/lib/client/types';
import { createId } from '@/lib/utils';

/**
 * Owns the processing queue for the whole studio — one image or fifty, the
 * state machine is the same.
 *
 * Design notes:
 *  - Work runs with bounded concurrency from the browser against the single
 *    -image endpoint. That gives per-item progress, per-item errors and
 *    per-item retry, none of which a single batch request can offer.
 *  - Object URLs are revoked on removal and on unmount; a long batch session
 *    would otherwise pin every original and every result in memory.
 *  - Jobs are updated by id rather than by index so a concurrent completion
 *    cannot write into the wrong slot.
 */

const DEFAULT_CONCURRENCY = 3;

export interface UseImageJobsOptions {
  concurrency?: number;
  background?: BackgroundChoice;
  onError?: (message: string, retry?: () => void) => void;
  saveToHistory?: boolean;
}

export function useImageJobs(options: UseImageJobsOptions = {}) {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    background,
    onError,
    saveToHistory = true,
  } = options;

  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const objectUrls = useRef(new Set<string>());
  const running = useRef(0);
  const queue = useRef<string[]>([]);
  const jobsRef = useRef<ImageJob[]>([]);

  // Callbacks captured in refs so the pump does not need them as dependencies.
  const backgroundRef = useRef(background);
  backgroundRef.current = background;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  jobsRef.current = jobs;

  const trackUrl = useCallback((url: string) => {
    objectUrls.current.add(url);
    return url;
  }, []);

  const releaseUrl = useCallback((url: string | undefined | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    objectUrls.current.delete(url);
  }, []);

  const patchJob = useCallback((id: string, patch: Partial<ImageJob>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const process = useCallback(
    async (id: string) => {
      const job = jobsRef.current.find((item) => item.id === id);
      if (!job) return;

      const controller = new AbortController();
      controllers.current.set(id, controller);
      patchJob(id, { status: 'uploading', uploadRatio: 0, error: null });
      track('background_removal_started', { bytes: job.file.size, mimeType: job.file.type });

      const startedAt = performance.now();

      try {
        const result = await removeBackground({
          file: job.file,
          filename: job.filename,
          background: backgroundRef.current,
          signal: controller.signal,
          onPhase: (phase, ratio) => {
            patchJob(id, {
              status: phase === 'uploading' ? 'uploading' : 'processing',
              uploadRatio: phase === 'uploading' ? (ratio ?? 0) : null,
            });
          },
        });

        trackUrl(result.objectUrl);

        const completed: Partial<ImageJob> = {
          status: 'done',
          uploadRatio: null,
          result: {
            url: result.objectUrl,
            blob: result.blob,
            width: result.width,
            height: result.height,
            byteSize: result.byteSize,
            processingTimeMs: result.processingTimeMs,
            filename: result.filename,
          },
        };
        patchJob(id, completed);

        track('background_removal_completed', {
          durationMs: Math.round(performance.now() - startedAt),
          width: result.width,
          height: result.height,
          bytes: result.byteSize,
        });

        if (saveToHistory) {
          void persistToHistory(result.blob, {
            filename: result.filename,
            width: result.width,
            height: result.height,
            byteSize: result.byteSize,
            processingTimeMs: result.processingTimeMs,
          });
        }
      } catch (error) {
        const apiError =
          error instanceof ApiError
            ? error
            : new ApiError('INTERNAL_ERROR', 'Something went wrong. Please try again.', true);

        if (apiError.code === 'ABORTED') {
          patchJob(id, { status: 'cancelled', uploadRatio: null });
        } else {
          patchJob(id, {
            status: 'error',
            uploadRatio: null,
            error: { message: apiError.message, retryable: apiError.retryable },
          });
          track('background_removal_failed', { code: apiError.code });
          onErrorRef.current?.(apiError.message);
        }
      } finally {
        controllers.current.delete(id);
      }
    },
    [patchJob, saveToHistory, trackUrl],
  );

  /** Drains the queue up to the concurrency limit. */
  const pump = useCallback(() => {
    while (running.current < concurrency && queue.current.length > 0) {
      const id = queue.current.shift();
      if (!id) break;
      running.current += 1;
      void process(id).finally(() => {
        running.current -= 1;
        pump();
      });
    }
  }, [concurrency, process]);

  const addFiles = useCallback(
    (files: File[], source: 'drop' | 'browse' | 'paste' | 'url' = 'browse') => {
      if (files.length === 0) return;
      track('upload_started', { source, count: files.length });

      const accepted: ImageJob[] = [];

      // The uploader advertises a maximum number of images per batch. That
      // number was previously display text only — the queue accepted any
      // amount. Enforcing it here makes the stated limit true, and keeps the
      // browser from holding hundreds of full-resolution blobs at once.
      const remainingSlots = Math.max(0, UPLOAD_LIMITS.maxBatchFiles - jobsRef.current.length);
      if (remainingSlots === 0) {
        onErrorRef.current?.(
          `You can process ${UPLOAD_LIMITS.maxBatchFiles} images at a time. Finish or clear this batch first.`,
        );
        return;
      }

      const withinLimit = files.slice(0, remainingSlots);
      if (files.length > withinLimit.length) {
        onErrorRef.current?.(
          `Only the first ${withinLimit.length} of ${files.length} images were added — the limit is ${UPLOAD_LIMITS.maxBatchFiles} at a time.`,
        );
      }

      for (const file of withinLimit) {
        const validation = validateFile(file);
        if (!validation.ok) {
          onErrorRef.current?.(`${file.name}: ${validation.message}`);
          track('upload_rejected', { reason: validation.message, filename: file.name });
          continue;
        }
        accepted.push({
          id: createId('job'),
          file,
          filename: file.name,
          status: 'queued',
          uploadRatio: null,
          originalUrl: trackUrl(URL.createObjectURL(file)),
          originalSize: file.size,
          result: null,
          error: null,
          createdAt: Date.now(),
        });
      }

      if (accepted.length === 0) return;

      track('upload_completed', {
        count: accepted.length,
        totalBytes: accepted.reduce((sum, job) => sum + job.originalSize, 0),
      });
      if (accepted.length > 1) track('batch_started', { count: accepted.length });
      setJobs((current) => [...current, ...accepted]);
      queue.current.push(...accepted.map((job) => job.id));
      // Let the state commit before the pump reads jobsRef.
      queueMicrotask(pump);
    },
    [pump, trackUrl],
  );

  const retry = useCallback(
    (id: string) => {
      patchJob(id, { status: 'queued', error: null });
      queue.current.push(id);
      queueMicrotask(pump);
    },
    [patchJob, pump],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    queue.current = queue.current.filter((queued) => queued !== id);
  }, []);

  const remove = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort();
      queue.current = queue.current.filter((queued) => queued !== id);
      setJobs((current) => {
        const job = current.find((item) => item.id === id);
        releaseUrl(job?.originalUrl);
        releaseUrl(job?.result?.url);
        return current.filter((item) => item.id !== id);
      });
    },
    [releaseUrl],
  );

  const clear = useCallback(() => {
    controllers.current.forEach((controller) => controller.abort());
    controllers.current.clear();
    queue.current = [];
    setJobs((current) => {
      current.forEach((job) => {
        releaseUrl(job.originalUrl);
        releaseUrl(job.result?.url);
      });
      return [];
    });
  }, [releaseUrl]);

  useEffect(() => {
    const urls = objectUrls.current;
    const active = controllers.current;
    return () => {
      active.forEach((controller) => controller.abort());
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);

  const stats = useMemo(() => {
    const done = jobs.filter((job) => job.status === 'done');
    const failed = jobs.filter((job) => job.status === 'error');
    const active = jobs.filter(
      (job) => job.status === 'uploading' || job.status === 'processing',
    );
    return {
      total: jobs.length,
      done: done.length,
      failed: failed.length,
      active: active.length,
      pending: jobs.filter((job) => job.status === 'queued').length,
      isBusy: active.length > 0 || jobs.some((job) => job.status === 'queued'),
      completedJobs: done,
    };
  }, [jobs]);

  return { jobs, stats, addFiles, retry, cancel, remove, clear };
}

async function persistToHistory(
  blob: Blob,
  meta: {
    filename: string;
    width: number;
    height: number;
    byteSize: number;
    processingTimeMs: number;
  },
): Promise<void> {
  try {
    const thumbnail = await makeThumbnailBlob(blob);
    await addHistoryItem({
      id: createId('hist'),
      createdAt: Date.now(),
      thumbnail,
      result: blob,
      ...meta,
    });
  } catch {
    // Storage is best-effort; a full quota must not break the result screen.
  }
}
