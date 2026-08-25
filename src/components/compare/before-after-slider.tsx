'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { cn, clamp } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Hint } from '@/components/ui/tooltip';

/**
 * Interactive before/after viewer.
 *
 * Layout: the frame takes the *image's* aspect ratio rather than a fixed 4:3.
 * A portrait photograph in a 4:3 box wasted 44% of the frame on empty space,
 * and — worse — the divider spent most of its travel sweeping across that
 * emptiness, so the "before" side looked blank. Sizing to the image means every
 * pixel of the frame is picture.
 *
 * Controls sit *below* the image, never on top of it. Floating controls always
 * land on the subject eventually, and the subject is the thing being judged.
 *
 * Interaction: Pointer Events give one code path for mouse, pen and touch. The
 * divider is a real slider (role, ARIA values, arrow keys), so the comparison
 * is usable without a pointer.
 */

export interface BeforeAfterSliderProps {
  beforeUrl: string;
  afterUrl: string;
  alt?: string;
  className?: string;
  onRequestFullscreen?: () => void;
  showFullscreenButton?: boolean;
  initialPosition?: number;
  /** Caps the frame height. Lower inside a modal, higher in fullscreen. */
  maxViewportHeight?: number;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const DEFAULT_ASPECT = 4 / 3;

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  alt = 'Comparison of the original image and the version with its background removed',
  className,
  onRequestFullscreen,
  showFullscreenButton = true,
  initialPosition = 50,
  maxViewportHeight = 62,
}: BeforeAfterSliderProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'idle' | 'divider' | 'pan'>('idle');
  const [aspect, setAspect] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isTouch, setIsTouch] = useState(false);

  const panStart = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
  const isZoomed = zoom > 1;

  useEffect(() => {
    setIsTouch(window.matchMedia('(pointer: coarse)').matches);
  }, []);

  // Reset when a different image is shown.
  useEffect(() => {
    setLoaded(false);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [afterUrl]);

  const updatePositionFromClientX = useCallback((clientX: number) => {
    const element = frameRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  }, []);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = frameRef.current;
    if (!element) return;

    // Zoomed in, dragging the picture pans it; the divider keeps its own
    // handle. At 1x the whole surface scrubs, which is the faster gesture.
    if (isZoomed) {
      setMode('pan');
      panStart.current = {
        x: event.clientX,
        y: event.clientY,
        offsetX: offset.x,
        offsetY: offset.y,
      };
    } else {
      setMode('divider');
      updatePositionFromClientX(event.clientX);
    }
    element.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'divider') {
      updatePositionFromClientX(event.clientX);
    } else if (mode === 'pan') {
      const bound = (zoom - 1) * 50;
      setOffset({
        x: clamp(panStart.current.offsetX + (event.clientX - panStart.current.x) / 4, -bound, bound),
        y: clamp(panStart.current.offsetY + (event.clientY - panStart.current.y) / 4, -bound, bound),
      });
    }
  };

  const endGesture = (event: React.PointerEvent<HTMLDivElement>) => {
    if (frameRef.current?.hasPointerCapture(event.pointerId)) {
      frameRef.current.releasePointerCapture(event.pointerId);
    }
    setMode('idle');
  };

  const applyZoom = useCallback((next: number) => {
    const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
    setZoom(clamped);
    if (clamped === 1) setOffset({ x: 0, y: 0 });
  }, []);

  const reset = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setPosition(50);
  }, []);

  // Ctrl/Cmd + wheel zooms, matching every image editor. A plain wheel keeps
  // scrolling the page, which is what a visitor expects on a web page.
  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      applyZoom(zoom * (event.deltaY < 0 ? 1.12 : 0.89));
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [applyZoom, zoom]);

  const onSliderKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 2;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => setPosition((p) => clamp(p - step, 0, 100)),
      ArrowRight: () => setPosition((p) => clamp(p + step, 0, 100)),
      Home: () => setPosition(0),
      End: () => setPosition(100),
    };
    const action = keys[event.key];
    if (action) {
      event.preventDefault();
      action();
    }
  };

  const transform = `scale(${zoom}) translate(${offset.x}%, ${offset.y}%)`;
  const ratio = aspect ?? DEFAULT_ASPECT;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Frame — sized to the image so no part of it is empty padding. */}
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        style={{
          aspectRatio: `${ratio}`,
          // Fit within the viewport height without letterboxing: cap the width
          // at whatever keeps the height under the limit.
          width: `min(100%, calc(${maxViewportHeight}vh * ${ratio.toFixed(4)}))`,
        }}
        className={cn(
          'relative mx-auto select-none overflow-hidden rounded-lg border border-line',
          'touch-none bg-paper-sunken',
          mode === 'pan' ? 'cursor-grabbing' : isZoomed ? 'cursor-grab' : 'cursor-ew-resize',
        )}
      >
        {/* Result layer, on the transparency board */}
        <div className="checkerboard absolute inset-0">
          <img
            src={afterUrl}
            alt={alt}
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth && naturalHeight) setAspect(naturalWidth / naturalHeight);
              setLoaded(true);
            }}
            className={cn(
              'pointer-events-none absolute inset-0 size-full object-contain',
              'transition-opacity duration-500',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
            style={{ transform }}
          />
        </div>

        {/* Original, clipped to the divider */}
        <div
          className="absolute inset-0 overflow-hidden bg-paper-raised"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        >
          <img
            src={beforeUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="pointer-events-none absolute inset-0 size-full object-contain"
            style={{ transform }}
          />
        </div>

        {/* Labels fade out as the divider approaches them, so they never sit on
            a sliver of image or collide with the handle. */}
        <span
          className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-paper backdrop-blur-sm transition-opacity duration-200"
          style={{ opacity: position < 14 ? 0 : 1 }}
        >
          Before
        </span>
        <span
          className="pointer-events-none absolute right-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-paper backdrop-blur-sm transition-opacity duration-200"
          style={{ opacity: position > 86 ? 0 : 1 }}
        >
          After
        </span>

        {/* Divider */}
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white/95 shadow-[0_0_0_1px_rgb(14_14_16/0.2)]"
          style={{ left: `${position}%` }}
        >
          <div
            role="slider"
            tabIndex={0}
            aria-label="Comparison position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(position)}
            aria-valuetext={`${Math.round(position)}% of the original shown`}
            aria-orientation="horizontal"
            onKeyDown={onSliderKeyDown}
            onPointerDown={(event) => {
              event.stopPropagation();
              setMode('divider');
              frameRef.current?.setPointerCapture(event.pointerId);
            }}
            className={cn(
              'pointer-events-auto absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2',
              'cursor-ew-resize items-center justify-center rounded-full',
              'border border-line-strong bg-paper-raised shadow-float',
              'transition-transform duration-150 hover:scale-105 focus-visible:scale-105',
              // A 44px target on touch, tighter on precise pointers.
              isTouch ? 'size-11' : 'size-9',
            )}
          >
            <Chevrons />
          </div>
        </div>
      </div>

      {/* Controls — below the picture, never over it. */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <div className="flex items-center gap-0.5 rounded-full border border-line bg-paper-raised p-1">
          <Hint label="Zoom out">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={() => applyZoom(zoom - 0.5)}
              disabled={zoom <= MIN_ZOOM}
              aria-label="Zoom out"
            >
              <Minus aria-hidden />
            </Button>
          </Hint>
          <span
            className="min-w-11 text-center text-xs font-medium tabular-nums text-ink-muted"
            aria-live="polite"
            aria-atomic="true"
          >
            {Math.round(zoom * 100)}%
          </span>
          <Hint label="Zoom in">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={() => applyZoom(zoom + 0.5)}
              disabled={zoom >= MAX_ZOOM}
              aria-label="Zoom in"
            >
              <Plus aria-hidden />
            </Button>
          </Hint>
          <span className="mx-0.5 h-4 w-px bg-line" aria-hidden />
          <Hint label="Reset view">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              onClick={reset}
              aria-label="Reset zoom and comparison position"
            >
              <RotateCcw aria-hidden />
            </Button>
          </Hint>
        </div>

        {showFullscreenButton && onRequestFullscreen && (
          <Button variant="outline" size="sm" onClick={onRequestFullscreen}>
            <Maximize2 aria-hidden />
            Fullscreen
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-ink-subtle">
        {isTouch ? (
          <>Drag the handle to compare{isZoomed ? ' · drag the image to pan' : ''}</>
        ) : (
          <>
            Drag to compare{isZoomed ? ' · drag the image to pan' : ''} ·{' '}
            <kbd className="rounded-xs border border-line bg-paper-sunken px-1 py-0.5 font-sans text-[10px]">
              ⌘
            </kbd>{' '}
            + scroll to zoom
          </>
        )}
      </p>
    </div>
  );
}

/** Two facing chevrons — reads as "drag sideways" without a text label. */
function Chevrons() {
  return (
    <svg viewBox="0 0 20 20" className="size-4 text-ink" fill="none" aria-hidden>
      <path
        d="M8 6.5 4.5 10 8 13.5M12 6.5 15.5 10 12 13.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Fullscreen presentation of the same viewer. */
export function FullscreenCompare({
  beforeUrl,
  afterUrl,
  onClose,
}: {
  beforeUrl: string;
  afterUrl: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-ink/95 p-4 animate-fade-in sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen comparison"
    >
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <p className="text-sm font-medium text-paper">Fullscreen preview</p>
        <Button
          variant="ghost"
          size="icon"
          className="text-paper hover:bg-paper/10 hover:text-paper"
          onClick={onClose}
          aria-label="Exit fullscreen"
        >
          <X aria-hidden />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-6xl">
          <BeforeAfterSlider
            beforeUrl={beforeUrl}
            afterUrl={afterUrl}
            showFullscreenButton={false}
            maxViewportHeight={72}
          />
        </div>
      </div>
    </div>
  );
}
