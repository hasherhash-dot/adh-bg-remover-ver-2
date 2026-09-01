'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fires once when an element gets near the viewport.
 *
 * Deliberately not IntersectionObserver. IO is the tidier API but it is driven
 * by the rendering lifecycle and stays silent in a context that never
 * composites — and everything on the homepage that depends on "am I on screen
 * yet" fails *closed*: a section stuck at opacity 0, a demonstration stuck on
 * its first frame. A blank page is a far worse outcome than the cost of one
 * scroll listener, so this uses plain rect maths, which runs whenever it is
 * asked to.
 *
 * There is no requestAnimationFrame throttle either, for the same reason — it
 * would put us back on the lifecycle this exists to avoid. Chrome already
 * coalesces scroll to one event per frame, each watcher does a single
 * `getBoundingClientRect`, and a watcher unsubscribes the moment it fires, so
 * the set only ever shrinks.
 *
 * One listener is shared by every caller on the page rather than one each.
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

export interface UseInViewOptions {
  /**
   * How far below the fold counts as "near", in viewport heights.
   *
   * 0.9 means a section starts revealing as it enters rather than once its top
   * edge has already crossed the bottom of the screen. Demonstrations that need
   * to be ready before they are looked at use a larger lead.
   */
  margin?: number;
}

/**
 * Returns a ref to attach, and whether that element has come into view yet.
 *
 * Latches: once true it stays true, because everything using this is a one-shot
 * entrance and re-hiding a section the user has already seen would be worse
 * than not animating at all.
 */
export function useInView<T extends HTMLElement>({ margin = 0.9 }: UseInViewOptions = {}) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let stop: (() => void) | undefined;
    let done = false;

    const check = () => {
      if (element.getBoundingClientRect().top >= window.innerHeight * margin) return;
      done = true;
      setInView(true);
      stop?.();
      stop = undefined;
    };

    // Measure once for whatever is already on screen, then subscribe only if
    // this element is still below the fold.
    check();
    if (!done) stop = watch(check);
    return () => stop?.();
  }, [margin]);

  return { ref, inView };
}
