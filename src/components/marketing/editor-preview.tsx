'use client';

import { useId, useState } from 'react';
import {
  Crop,
  Download,
  Image as ImageIcon,
  Redo2,
  RotateCcw,
  RotateCw,
  Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A marketing-scale preview of the real editor.
 *
 * The homepage used to mount `ImageEditor` itself. That was the wrong trade:
 * the real editor is a heavy client component doing canvas work, and six of
 * them scattered across a landing page turned it into an application dashboard.
 *
 * So this is a composition, not a mock in the pejorative sense — the control
 * set, the labels and the ratio values are read off `compose.ts` and the real
 * editor's markup, so it cannot claim a capability the product lacks. What it
 * deliberately does not do is work: only the two controls that carry the story
 * respond, and everything else is inert.
 *
 *   Crop ratio  -> changes the frame's aspect-ratio
 *   Padding     -> changes the space around the subject
 *
 * Two live controls is enough to communicate "there is a real editor behind
 * this". A third would not add a fact, only a maintenance burden.
 *
 * The inert controls are marked `inert`, so they are unreachable by keyboard
 * and invisible to assistive technology rather than being a row of buttons
 * that silently do nothing when pressed.
 */

/** Mirrors ASPECT_PRESETS in src/lib/client/compose.ts. */
const RATIOS = [
  { label: 'Original', value: null },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
] as const;

/** The first six of COLOR_PRESETS, plus transparent. Shown, not wired. */
const COLORS = ['#ffffff', '#0e0e10', '#f4f2ee', '#d7f24b', '#2f6fed', '#e8563f'];

export interface EditorPreviewProps {
  /** A real ADH cut-out. */
  cutoutUrl: string;
  alt: string;
  /** Filename shown in the panel header, matching the editor's own chrome. */
  filename: string;
  className?: string;
}

export function EditorPreview({ cutoutUrl, alt, filename, className }: EditorPreviewProps) {
  const [ratio, setRatio] = useState<number | null>(null);
  const [padding, setPadding] = useState(8);
  const paddingId = useId();

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-line bg-paper-raised shadow-float',
        className,
      )}
    >
      {/* Panel header — the same lockup the application uses. */}
      <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-sunken px-4 py-3">
        <span className="flex items-center gap-2.5 truncate">
          <ImageIcon className="size-4 shrink-0 text-navy" aria-hidden />
          <span className="truncate text-[13px] font-medium text-ink">{filename}</span>
        </span>
        <span className="flex items-center gap-1.5" inert>
          <span className="flex size-8 items-center justify-center rounded-md border border-line bg-paper-raised text-ink-subtle">
            <Undo2 className="size-4" aria-hidden />
          </span>
          <span className="flex size-8 items-center justify-center rounded-md border border-line bg-paper-raised text-ink-subtle">
            <Redo2 className="size-4" aria-hidden />
          </span>
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* ---------------------------------------------------- the canvas -- */}
        <div className="flex items-center justify-center bg-paper-sunken p-5 sm:p-8 lg:p-10">
          <div
            className="checkerboard w-full max-w-lg overflow-hidden rounded-lg border border-line shadow-subtle transition-[aspect-ratio,padding] duration-300 ease-[var(--ease-out-soft)]"
            style={{
              aspectRatio: ratio ?? '3 / 2',
              padding: `${padding}%`,
            }}
          >
            <img
              src={cutoutUrl}
              alt={alt}
              loading="lazy"
              className="size-full object-contain"
            />
          </div>
        </div>

        {/* ------------------------------------------------------ the rail -- */}
        <div className="flex flex-col gap-6 border-t border-line p-5 lg:border-l lg:border-t-0 lg:p-6">
          {/* Live: crop ratio. */}
          <Section icon={<Crop className="size-3.5" aria-hidden />} title="Crop">
            <div role="radiogroup" aria-label="Crop ratio" className="flex flex-wrap gap-1.5">
              {RATIOS.map((preset) => {
                const selected = preset.value === ratio;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRatio(preset.value)}
                    className={cn(
                      'min-h-9 rounded-md border px-2.5 text-[12px] font-medium transition-colors',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                      selected
                        ? 'border-navy bg-navy text-white'
                        : 'border-line bg-paper-raised text-ink-muted hover:border-control hover:text-ink',
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Live: padding. */}
          <Section title="Padding">
            <div className="flex items-center gap-3">
              <input
                id={paddingId}
                type="range"
                min={0}
                max={24}
                value={padding}
                onChange={(event) => setPadding(Number(event.target.value))}
                className="range-input"
                aria-label="Padding around the subject"
              />
              <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink-subtle">
                {padding}%
              </span>
            </div>
          </Section>

          {/* Everything below is shown but not wired. `inert` keeps it out of
              the tab order and off the accessibility tree. */}
          <div className="flex flex-col gap-6" inert>
            <Section title="Scale">
              <div className="flex items-center gap-3">
                <span className="h-1 flex-1 rounded-full border border-line bg-paper-sunken">
                  <span className="block h-full w-[62%] rounded-full bg-line-strong" />
                </span>
                <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink-subtle">
                  100%
                </span>
              </div>
            </Section>

            <Section title="Rotate">
              <div className="flex gap-1.5">
                {[RotateCcw, RotateCw].map((Icon, index) => (
                  <span
                    key={index}
                    className="flex size-9 items-center justify-center rounded-md border border-line bg-paper-raised text-ink-muted"
                  >
                    <Icon className="size-4" aria-hidden />
                  </span>
                ))}
              </div>
            </Section>

            <Section title="Background">
              <div className="flex flex-wrap gap-1.5">
                <span className="checkerboard checkerboard-sm size-7 rounded-md border border-navy" />
                {COLORS.map((color) => (
                  <span
                    key={color}
                    className="size-7 rounded-md border border-line"
                    style={{ backgroundColor: color }}
                  />
                ))}
                <span className="flex size-7 items-center justify-center rounded-md border border-dashed border-control text-ink-subtle">
                  <ImageIcon className="size-3.5" aria-hidden />
                </span>
              </div>
            </Section>

            <span className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[13px] font-semibold text-white">
              <Download className="size-4" aria-hidden />
              Download PNG
            </span>
          </div>
        </div>
      </div>

      <p className="sr-only">
        A preview of the editor. Crop ratio and padding can be changed here; the full editor,
        including scale, rotation, background and download, opens after you remove a background.
      </p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        {icon}
        {title}
      </p>
      {children}
    </div>
  );
}
