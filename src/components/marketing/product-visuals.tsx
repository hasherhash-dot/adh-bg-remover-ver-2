'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Scroll reveal for the marketing page.
 *
 * This file used to hold hand-built replicas of the editor, the batch queue and
 * the background picker. They have been deleted: the homepage now mounts the
 * real components through `live-demo.tsx`, so a drawing of the product would
 * only be something new to keep in sync.
 *
 * What is left is the one thing with no product equivalent.
 */

/**
 * One shared scroll listener for every Reveal on the page.
 *
 * Deliberately not IntersectionObserver. IO is the tidier API but it is driven
 * by the rendering lifecycle and stays silent in a tab that never composites —
 * and a reveal that never fires leaves the section it wraps permanently at
 * opacity 0. Since these wrap most of the homepage, that failure mode is a
 * blank page, which is far worse than the cost of one scroll handler.
 *
 * No requestAnimationFrame throttle either, for the same reason: it would put
 * us back on the lifecycle this exists to avoid. Chrome already coalesces
 * scroll to one event per frame, each watcher does a single
 * getBoundingClientRect, and a watcher removes itself the moment it fires, so
 * the set only shrinks.
 */
const watchers = new Set<() => void>();

function run() {
  for (const check of [...watchers]) check();
}

function watch(check: () => void): () => void {
  if (watchers.size === 0) {
    window.addEventListener('scroll', run, { passive: true });
    window.addEventListener('resize', run, { passive: true });
  }
  watchers.add(check);

  return () => {
    watchers.delete(check);
    if (watchers.size === 0) {
      window.removeEventListener('scroll', run);
      window.removeEventListener('resize', run);
    }
  };
}

/**
 * Fades a section in as it scrolls into view.
 *
 * Anyone who prefers reduced motion simply gets the visible state: the global
 * reduced-motion rule collapses every transition duration, so the content
 * appears rather than sliding. The hidden state is also gated on a `js` class
 * set before first paint, so the page stays readable without JavaScript.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let stop: (() => void) | undefined;
    let done = false;

    const check = () => {
      // A tenth of the viewport of overlap, so a section starts to appear as it
      // enters rather than only once its top edge crosses the fold.
      if (element.getBoundingClientRect().top >= window.innerHeight * 0.9) return;
      done = true;
      setVisible(true);
      stop?.();
      stop = undefined;
    };

    // Measure once for whatever is already on screen, then only subscribe if
    // this element is still below the fold.
    check();
    if (!done) stop = watch(check);
    return () => stop?.();
  }, []);

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn('reveal', visible && 'reveal-in', className)}
    >
      {children}
    </div>
  );
}
