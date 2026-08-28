'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { cn, createId } from '@/lib/utils';
import type { ImageJob } from '@/lib/client/types';

/**
 * Drives the real product components from static sample files.
 *
 * The homepage used to show hand-drawn replicas of the editor and the batch
 * queue. They were built from the same tokens, but they were still drawings,
 * and a drawing drifts the moment the product changes. These wrappers mount the
 * actual components instead, fed with real results from public/showcase.
 *
 * Two costs come with that, and both are handled here rather than being wished
 * away:
 *
 *   Bundle — the editor and the batch queue are heavy client components. They
 *   are imported through next/dynamic so none of that JavaScript is in the
 *   initial payload.
 *
 *   CPU — they do canvas work on mount. Nothing mounts until it is close to the
 *   viewport, so a visitor who never scrolls past the hero pays for none of it.
 *
 * If a component ever proves too expensive to run here, the replacement is a
 * static render captured from the real UI — not a new mock.
 */

/* ------------------------------------------------------- mount on demand -- */

/**
 * Renders `children` only once the placeholder nears the viewport.
 *
 * Deliberately not IntersectionObserver: it is driven by the rendering
 * lifecycle and stays silent in a tab that never composites, which would leave
 * a permanent skeleton where the product should be. Plain rect maths runs
 * whenever it is asked to. Same reasoning as `Reveal` in product-visuals.tsx.
 */
const watchers = new Set<() => void>();

function runWatchers() {
  for (const check of [...watchers]) check();
}

function watch(check: () => void): () => void {
  if (watchers.size === 0) {
    window.addEventListener('scroll', runWatchers, { passive: true });
    window.addEventListener('resize', runWatchers, { passive: true });
  }
  watchers.add(check);
  return () => {
    watchers.delete(check);
    if (watchers.size === 0) {
      window.removeEventListener('scroll', runWatchers);
      window.removeEventListener('resize', runWatchers);
    }
  };
}

export function WhenNear({
  children,
  minHeight,
  label,
  className,
}: {
  children: React.ReactNode;
  minHeight: number;
  /** Announced while the panel is still loading. */
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let stop: (() => void) | undefined;
    let done = false;

    const check = () => {
      // One and a half viewports of lead time, so the panel is ready by the
      // time it is actually looked at.
      if (element.getBoundingClientRect().top >= window.innerHeight * 1.5) return;
      done = true;
      setShow(true);
      stop?.();
      stop = undefined;
    };

    check();
    if (!done) stop = watch(check);
    return () => stop?.();
  }, []);

  return (
    <div ref={ref} className={className} style={{ minHeight }}>
      {show ? (
        children
      ) : (
        <div
          className="flex size-full items-center justify-center rounded-md border border-line bg-paper-sunken"
          style={{ minHeight }}
        >
          <span className="flex items-center gap-2 text-xs text-ink-subtle">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            {label}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ file loading -- */

/**
 * Fetches a sample result and hands it back as a Blob.
 *
 * `BackgroundPicker` and `ImageEditor` both take a Blob because that is what
 * the application gives them after a real removal. Fetching a PNG from
 * public/showcase produces exactly the same thing, so the components run
 * against genuine data rather than a special marketing code path.
 */
function useSampleBlob(url: string): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => (response.ok ? response.blob() : null))
      .then((result) => {
        if (!cancelled) setBlob(result);
      })
      .catch(() => {
        // A missing sample leaves the skeleton in place. It must never take
        // the page down.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return blob;
}

/* ------------------------------------------------- real background picker -- */

const BackgroundPicker = dynamic(
  () => import('@/components/result/background-picker').then((m) => m.BackgroundPicker),
  { ssr: false },
);

/**
 * The picker is only the control — in the application the preview it feeds
 * lives in the result view. Wiring one up here is what makes the card
 * demonstrate the operation rather than just show four swatches, and it
 * exercises the component exactly as the product does.
 */
export function LiveBackgroundPicker({ src, className }: { src: string; className?: string }) {
  const blob = useSampleBlob(src);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  if (!blob) return null;

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="checkerboard aspect-4/3 overflow-hidden rounded-md border border-line">
        <img
          src={preview ?? src}
          alt="The same cut-out shown on the selected background"
          className="size-full object-contain"
        />
      </div>
      <BackgroundPicker
        source={blob}
        onChange={(composited) => {
          const next = URL.createObjectURL(composited);
          setPreview((current) => {
            if (current) URL.revokeObjectURL(current);
            return next;
          });
        }}
      />
    </div>
  );
}

/* ---------------------------------------------------------- real editor -- */

const ImageEditor = dynamic(
  () => import('@/components/editor/image-editor').then((m) => m.ImageEditor),
  { ssr: false },
);

export function LiveEditor({
  src,
  filename,
  className,
}: {
  src: string;
  filename: string;
  className?: string;
}) {
  const blob = useSampleBlob(src);
  if (!blob) return null;
  return <ImageEditor resultBlob={blob} filename={filename} className={className} />;
}

/* ----------------------------------------------------- real batch queue -- */

const BatchQueue = dynamic(
  () => import('@/components/batch/batch-queue').then((m) => m.BatchQueue),
  { ssr: false },
);

export interface SampleJob {
  filename: string;
  /** Source photograph, shown as the job thumbnail. */
  originalUrl: string;
  /** Finished cutout. Omit to render the job as still processing. */
  resultUrl?: string;
  width: number;
  height: number;
}

/**
 * Builds `ImageJob`s the batch queue will accept.
 *
 * The shape is the product's own, so the queue renders exactly as it does
 * mid-run: finished rows with their dimensions, one row still working.
 */
export function LiveBatchQueue({ samples, className }: { samples: SampleJob[]; className?: string }) {
  const [jobs, setJobs] = useState<ImageJob[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const built: ImageJob[] = [];
      for (const sample of samples) {
        const resultBlob = sample.resultUrl
          ? await fetch(sample.resultUrl)
              .then((r) => (r.ok ? r.blob() : null))
              .catch(() => null)
          : null;

        built.push({
          id: createId('demo'),
          createdAt: Date.now(),
          // A zero-byte File is enough: nothing on this page reads its bytes,
          // and fetching every original again purely to satisfy a type would
          // double the page's image traffic.
          file: new File([], sample.filename, { type: 'image/jpeg' }),
          filename: sample.filename,
          status: resultBlob ? 'done' : 'processing',
          uploadRatio: resultBlob ? null : 0.6,
          originalUrl: sample.originalUrl,
          originalSize: 0,
          result: resultBlob
            ? {
                url: URL.createObjectURL(resultBlob),
                blob: resultBlob,
                width: sample.width,
                height: sample.height,
                byteSize: resultBlob.size,
                processingTimeMs: 0,
                filename: sample.filename.replace(/\.[^.]+$/, '.png'),
              }
            : null,
          error: null,
        });
      }
      if (!cancelled) setJobs(built);
    })();

    return () => {
      cancelled = true;
    };
  }, [samples]);

  useEffect(
    () => () => {
      // Object URLs created above outlive the component unless revoked.
      jobs?.forEach((job) => {
        if (job.result) URL.revokeObjectURL(job.result.url);
      });
    },
    [jobs],
  );

  if (!jobs) return null;

  return (
    <div className={cn('pointer-events-none select-none', className)}>
      {/* Non-interactive on the homepage: the controls belong to the real
          batch page, and a dead retry button here would be a lie. */}
      <BatchQueue
        jobs={jobs}
        onRetry={() => undefined}
        onRemove={() => undefined}
        onAddFiles={() => undefined}
        onClear={() => undefined}
      />
    </div>
  );
}
