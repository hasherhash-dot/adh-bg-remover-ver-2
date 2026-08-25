'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Crop,
  Download,
  FileArchive,
  Loader2,
  Maximize2,
  RotateCw,
  Sliders,
} from 'lucide-react';
import { cn, clamp } from '@/lib/utils';

/**
 * Product visuals for the marketing page.
 *
 * Everything here shows the real thing: the photographs are genuine results
 * from /api/remove-background (see scripts/build-showcase-assets.mjs), and the
 * interface mock-ups are built from the same tokens and components as the
 * application, not drawn in a design tool. If the product changes, these should
 * look wrong — which is the point.
 *
 * No animation library. Motion is CSS transitions and one pointer handler.
 */

/* ------------------------------------------------------------ app frame -- */

/**
 * Window chrome. A title bar and three dots do more to say "this is software"
 * than any amount of copy, and it gives the uploader somewhere to live that
 * does not read as an empty box on a page.
 */
export function AppFrame({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-line bg-paper-raised shadow-float',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-line bg-paper-sunken px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          {['bg-accent', 'bg-steel', 'bg-line-strong'].map((dot) => (
            <span key={dot} className={cn('size-2.5 rounded-full', dot)} />
          ))}
        </span>
        <span className="ml-1 text-[11px] font-medium tracking-wide text-ink-subtle">{label}</span>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------- before / after -- */

/**
 * Draggable comparison. A deliberately small implementation — the full viewer
 * with zoom and pan lives in the app; this only has to make the quality
 * obvious at a glance and invite one interaction.
 */
export function BeforeAfter({
  before,
  after,
  alt,
  className,
  initial = 52,
  height = 'aspect-3/4',
}: {
  before: string;
  after: string;
  alt: string;
  className?: string;
  initial?: number;
  height?: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initial);
  const [dragging, setDragging] = useState(false);

  const moveTo = (clientX: number) => {
    const element = frame.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition(clamp(((clientX - rect.left) / rect.width) * 100, 0, 100));
  };

  return (
    <div
      ref={frame}
      onPointerDown={(event) => {
        // Move first. Pointer capture is an optimisation — it keeps the drag
        // alive when the cursor leaves the frame — and it throws if the pointer
        // id is not currently active. Letting that abort the handler would cost
        // us the click itself, so it goes last and it goes in a try.
        setDragging(true);
        moveTo(event.clientX);
        try {
          frame.current?.setPointerCapture(event.pointerId);
        } catch {
          // Capture unavailable; dragging still works inside the frame.
        }
      }}
      onPointerMove={(event) => dragging && moveTo(event.clientX)}
      onPointerUp={(event) => {
        setDragging(false);
        if (frame.current?.hasPointerCapture(event.pointerId)) {
          frame.current.releasePointerCapture(event.pointerId);
        }
      }}
      className={cn(
        'checkerboard relative w-full cursor-ew-resize touch-none select-none overflow-hidden rounded-md border border-line',
        height,
        className,
      )}
    >
      <img
        src={after}
        alt={alt}
        loading="lazy"
        className="pointer-events-none absolute inset-0 size-full object-cover"
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={before}
          alt=""
          aria-hidden
          loading="lazy"
          className="pointer-events-none absolute inset-0 size-full object-cover"
        />
      </div>

      <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-xs bg-ink/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
        Before
      </span>
      <span className="pointer-events-none absolute right-2.5 top-2.5 rounded-xs bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
        After
      </span>

      <div
        className="pointer-events-none absolute inset-y-0 z-10 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgb(21_53_102/0.25)]"
        style={{ left: `${position}%` }}
      >
        <span
          className={cn(
            'absolute left-1/2 top-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line-strong bg-white shadow-raised transition-transform',
            dragging && 'scale-110',
          )}
        >
          <svg viewBox="0 0 20 20" className="size-4 text-navy" fill="none" aria-hidden>
            <path
              d="M8 6.5 4.5 10 8 13.5M12 6.5 15.5 10 12 13.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------- background swaps -- */

const BACKDROPS = [
  { id: 'transparent', label: 'Transparent', className: 'checkerboard' },
  { id: 'white', label: 'White', style: { background: '#ffffff' } },
  { id: 'navy', label: 'Navy', style: { background: '#153566' } },
  { id: 'red', label: 'Red', style: { background: '#cd0f36' } },
] as const;

/**
 * Background replacement, demonstrated rather than described.
 *
 * One transparent cutout layered over four coloured surfaces — the same
 * operation the product performs, and no extra image assets.
 */
export function BackgroundSwapDemo({ src, alt }: { src: string; alt: string }) {
  const [active, setActive] = useState<string>('transparent');
  const backdrop = BACKDROPS.find((b) => b.id === active) ?? BACKDROPS[0];

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'relative aspect-4/3 overflow-hidden rounded-md border border-line transition-colors duration-300',
          'className' in backdrop ? backdrop.className : undefined,
        )}
        style={'style' in backdrop ? backdrop.style : undefined}
      >
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="absolute inset-0 size-full object-contain"
        />
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Background preview">
        {BACKDROPS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setActive(option.id)}
            aria-pressed={active === option.id}
            className={cn(
              'flex min-h-8 items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12px] font-medium transition-all',
              active === option.id
                ? 'border-ink bg-paper-sunken text-ink'
                : 'border-line text-ink-muted hover:border-ink/30',
            )}
          >
            <span
              className={cn(
                'flex size-5 items-center justify-center rounded-full border border-line-strong',
                'className' in option ? option.className : undefined,
              )}
              style={'style' in option ? option.style : undefined}
            >
              {active === option.id && (
                <Check
                  className={cn(
                    'size-3',
                    option.id === 'navy' || option.id === 'red' ? 'text-white' : 'text-ink',
                  )}
                  aria-hidden
                />
              )}
            </span>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- editor mock-up -- */

/** A compact rendering of the real editor's controls. */
export function EditorMock({ src }: { src: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1.35fr_1fr]">
      <div className="checkerboard flex items-center justify-center rounded-md border border-line p-3">
        <img
          src={src}
          alt="A cut-out being edited"
          loading="lazy"
          className="max-h-40 w-auto object-contain"
        />
      </div>

      <div className="flex flex-col gap-3 rounded-md border border-line bg-paper-raised p-3">
        <div className="flex items-center gap-1.5">
          {[Sliders, Crop, RotateCw, Maximize2].map((Icon, index) => (
            <span
              key={index}
              className={cn(
                'flex size-7 items-center justify-center rounded-xs border',
                index === 0 ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted',
              )}
              aria-hidden
            >
              <Icon className="size-3.5" />
            </span>
          ))}
        </div>

        {[
          { label: 'Scale', value: 68 },
          { label: 'Padding', value: 24 },
        ].map((control) => (
          <div key={control.label}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[11px] font-medium text-ink-muted">{control.label}</span>
              <span className="text-[11px] tabular-nums text-ink-subtle">{control.value}%</span>
            </div>
            <div className="h-1 rounded-full bg-paper-sunken">
              <div className="h-full rounded-full bg-navy" style={{ width: `${control.value}%` }} />
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-1">
          {['Original', '1:1', '4:5', '16:9'].map((ratio, index) => (
            <span
              key={ratio}
              className={cn(
                'rounded-xs border px-1.5 py-1 text-[11px] font-medium',
                index === 1 ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted',
              )}
            >
              {ratio}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------- batch mock-up -- */

export function BatchMock({ thumbs }: { thumbs: Array<{ src: string; name: string }> }) {
  return (
    <div className="flex flex-col gap-2">
      {thumbs.map((thumb, index) => {
        const done = index < thumbs.length - 1;
        return (
          <div
            key={thumb.name}
            className="flex items-center gap-2.5 rounded-md border border-line bg-paper-raised p-2"
          >
            <span className="checkerboard checkerboard-sm size-9 shrink-0 overflow-hidden rounded-xs border border-line">
              <img src={thumb.src} alt="" loading="lazy" className="size-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-ink">{thumb.name}</span>
              {done ? (
                <span className="text-[11px] tabular-nums text-ink-subtle">PNG · transparent</span>
              ) : (
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-paper-sunken">
                  <span className="block h-full w-2/3 rounded-full bg-navy" />
                </span>
              )}
            </span>
            {done ? (
              <Check className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-subtle" aria-hidden />
            )}
          </div>
        );
      })}

      <span className="mt-1 flex items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-[12px] font-semibold text-white">
        <FileArchive className="size-3.5" aria-hidden />
        Download all as ZIP
      </span>
    </div>
  );
}

/* ------------------------------------------------------- download card -- */

/** The moment the product delivers. Used as a floating accent in the hero. */
export function DownloadCard({ dimensions, size }: { dimensions: string; size: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-line bg-paper-raised p-2.5 shadow-float">
      <span className="checkerboard flex size-9 items-center justify-center rounded-xs border border-line">
        <Download className="size-4 text-navy" aria-hidden />
      </span>
      <span>
        <span className="block text-[12px] font-semibold text-ink">Download PNG</span>
        <span className="block text-[11px] tabular-nums text-ink-subtle">
          {dimensions} · {size}
        </span>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------- reveal hook -- */

/**
 * One rAF-throttled scroll listener shared by every Reveal on the page.
 *
 * Deliberately not IntersectionObserver. IO is the tidier API, but it is driven
 * by the rendering lifecycle and stays silent in a tab that never composites —
 * and a reveal that never fires leaves the section it wraps permanently at
 * opacity 0. Since these wrappers hold most of the homepage, the failure mode
 * is a blank page, which is far worse than the cost of one scroll handler.
 * Plain rect maths runs whenever it is asked to, and can be tested.
 */
const watchers = new Set<() => void>();

/**
 * No requestAnimationFrame throttle on purpose — that would put us back on the
 * rendering lifecycle this exists to avoid. Chrome already coalesces scroll to
 * one event per frame, each watcher does a single getBoundingClientRect, and a
 * watcher removes itself the moment it fires, so the set only shrinks.
 */
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
 * appears rather than sliding.
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
