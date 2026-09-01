'use client';

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
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
 * So this is a composition — the control set, the labels, the ratio values and
 * the colour swatches are read off `compose.ts` and the editor's own markup, so
 * it cannot advertise a capability the product lacks.
 *
 * Every control here works. An earlier version wired up only crop and padding
 * and marked the rest `inert`, on the theory that two live controls were enough
 * to make the point. In practice a control that looks identical to a working
 * one and does nothing reads as broken software, which is worse than not
 * drawing it at all — so scale, rotation, background and undo/redo are live
 * too. They are all CSS transforms and background changes on a single <img>:
 * no canvas, no bitmap decoding, nothing that costs anything to run.
 *
 * The one thing that cannot honestly work is Download, because there is no
 * composited file behind this preview and inventing one would misrepresent what
 * the product returns. It is a link into the real tool instead.
 */

/** Mirrors ASPECT_PRESETS in src/lib/client/compose.ts. */
const RATIOS = [
  { label: 'Original', value: null },
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
] as const;

/** The first six of COLOR_PRESETS. */
const COLORS = ['#ffffff', '#0e0e10', '#f4f2ee', '#d7f24b', '#2f6fed', '#e8563f'];

type Background =
  | { type: 'transparent' }
  | { type: 'color'; value: string }
  | { type: 'image'; value: string };

interface EditorState {
  ratio: number | null;
  padding: number;
  scale: number;
  rotation: number;
  background: Background;
}

const INITIAL: EditorState = {
  ratio: null,
  padding: 8,
  scale: 100,
  rotation: 0,
  background: { type: 'transparent' },
};

export interface EditorPreviewProps {
  /** A real ADH cut-out. */
  cutoutUrl: string;
  alt: string;
  /** The cut-out's own dimensions — this is what "Original" means. */
  width: number;
  height: number;
  /** Filename shown in the panel header, matching the editor's own chrome. */
  filename: string;
  /** Offered by the Background rail's image swatch, as the editor allows. */
  backdropUrl?: string;
  className?: string;
}

export function EditorPreview({
  cutoutUrl,
  alt,
  width,
  height,
  filename,
  backdropUrl,
  className,
}: EditorPreviewProps) {
  const paddingId = useId();
  const scaleId = useId();

  /**
   * Undo/redo over the whole control set.
   *
   * `coalesce` keeps a slider drag from becoming forty history entries: a
   * change tagged with the same key as the previous one replaces it instead of
   * stacking, which is what makes one undo step back over one gesture.
   */
  const [past, setPast] = useState<EditorState[]>([]);
  const [present, setPresent] = useState<EditorState>(INITIAL);
  const [future, setFuture] = useState<EditorState[]>([]);
  const lastKey = useRef<string | null>(null);

  const apply = (patch: Partial<EditorState>, coalesce?: string) => {
    if (!(coalesce && lastKey.current === coalesce)) {
      setPast((stack) => [...stack, present]);
    }
    lastKey.current = coalesce ?? null;
    setFuture([]);
    setPresent({ ...present, ...patch });
  };

  const undo = () => {
    const previous = past[past.length - 1];
    if (!previous) return;
    setPast((stack) => stack.slice(0, -1));
    setFuture((stack) => [present, ...stack]);
    setPresent(previous);
    lastKey.current = null;
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture((stack) => stack.slice(1));
    setPast((stack) => [...stack, present]);
    setPresent(next);
    lastKey.current = null;
  };

  const { ratio, padding, scale, rotation, background } = present;
  const transparent = background.type === 'transparent';

  /**
   * Keeps a quarter-turn inside the frame.
   *
   * `object-contain` fits the image to its box *before* the transform runs, so
   * rotating 90 degrees swings the long side past the edge and it clips —
   * which looks like a bug rather than a rotation. The exact factor needed is
   * derivable from the two ratios we already have, so no measuring:
   *
   *   frame k = W/H, image r = iw/ih. Contain renders the image at W x W/r
   *   when r > k, else H*r x H. Rotating swaps that box, and the scale that
   *   fits the swapped box back inside W x H is what falls out below.
   *
   * It can be greater than 1 — a portrait subject turned sideways in a wide
   * frame genuinely has room to grow, and filling it is what "fit" means.
   */
  const frameRatio = ratio ?? width / height;
  const imageRatio = width / height;
  const quarterTurned = Math.abs(rotation) % 180 === 90;
  const rotationFit = quarterTurned
    ? imageRatio > frameRatio
      ? Math.min(imageRatio, 1 / frameRatio)
      : Math.min(frameRatio, 1 / imageRatio)
    : 1;

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
        <span className="flex items-center gap-1.5">
          <IconButton label="Undo" onClick={undo} disabled={past.length === 0}>
            <Undo2 className="size-4" aria-hidden />
          </IconButton>
          <IconButton label="Redo" onClick={redo} disabled={future.length === 0}>
            <Redo2 className="size-4" aria-hidden />
          </IconButton>
        </span>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_17rem]">
        {/* ---------------------------------------------------- the canvas -- */}
        <div className="flex items-center justify-center bg-paper-sunken p-5 sm:p-8 lg:p-10">
          <div
            className={cn(
              'w-full max-w-lg overflow-hidden rounded-lg border border-line shadow-subtle',
              'transition-[aspect-ratio,padding,background-color] duration-300 ease-[var(--ease-out-soft)]',
              transparent && 'checkerboard',
            )}
            style={{
              // "Original" is the cut-out's own ratio, not a house default. It
              // used to fall back to 3/2, which framed this portrait subject in
              // a landscape box and shrank it to fit.
              aspectRatio: frameRatio,
              padding: `${padding}%`,
              ...(background.type === 'color' ? { backgroundColor: background.value } : null),
              ...(background.type === 'image'
                ? {
                    backgroundImage: `url(${background.value})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : null),
            }}
          >
            <img
              src={cutoutUrl}
              alt={alt}
              width={width}
              height={height}
              loading="lazy"
              className="size-full object-contain transition-transform duration-300 ease-[var(--ease-out-soft)]"
              style={{
                transform: `rotate(${rotation}deg) scale(${(scale / 100) * rotationFit})`,
              }}
            />
          </div>
        </div>

        {/* ------------------------------------------------------ the rail -- */}
        <div className="flex flex-col gap-6 border-t border-line p-5 lg:border-l lg:border-t-0 lg:p-6">
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
                    onClick={() => apply({ ratio: preset.value })}
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

          <Section title="Padding">
            <Slider
              id={paddingId}
              label="Padding around the subject"
              min={0}
              max={24}
              value={padding}
              suffix="%"
              onChange={(value) => apply({ padding: value }, 'padding')}
            />
          </Section>

          <Section title="Scale">
            <Slider
              id={scaleId}
              label="Subject scale"
              min={40}
              max={140}
              value={scale}
              suffix="%"
              onChange={(value) => apply({ scale: value }, 'scale')}
            />
          </Section>

          <Section title="Rotate">
            <div className="flex gap-1.5">
              <IconButton
                label="Rotate left 90 degrees"
                onClick={() => apply({ rotation: rotation - 90 })}
              >
                <RotateCcw className="size-4" aria-hidden />
              </IconButton>
              <IconButton
                label="Rotate right 90 degrees"
                onClick={() => apply({ rotation: rotation + 90 })}
              >
                <RotateCw className="size-4" aria-hidden />
              </IconButton>
            </div>
          </Section>

          <Section title="Background">
            <div role="radiogroup" aria-label="Background" className="flex flex-wrap gap-1.5">
              <Swatch
                label="Transparent"
                selected={transparent}
                onClick={() => apply({ background: { type: 'transparent' } })}
                className="checkerboard checkerboard-sm"
              />
              {COLORS.map((color) => (
                <Swatch
                  key={color}
                  label={`Background colour ${color}`}
                  selected={background.type === 'color' && background.value === color}
                  onClick={() => apply({ background: { type: 'color', value: color } })}
                  style={{ backgroundColor: color }}
                />
              ))}
              {backdropUrl && (
                <Swatch
                  label="Photo background"
                  selected={background.type === 'image'}
                  onClick={() => apply({ background: { type: 'image', value: backdropUrl } })}
                  style={{ backgroundImage: `url(${backdropUrl})`, backgroundSize: 'cover' }}
                />
              )}
            </div>
          </Section>

          {/* The only control that does not act on the preview. There is no
              composited file behind this panel, and producing a download that
              was not made the way the product makes one would misrepresent the
              output — so it goes to the tool instead of faking a result. */}
          <Link
            href="/remove-background"
            className="mt-1 flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 text-[13px] font-semibold text-white transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Download className="size-4" aria-hidden />
            Download PNG
          </Link>
        </div>
      </div>

      <p className="sr-only">
        A preview of the editor, using a sample cut-out. Crop, padding, scale, rotation and
        background all work here. Downloading opens the tool so you can use your own image.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ parts -- */

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

function IconButton({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-9 items-center justify-center rounded-md border border-line bg-paper-raised text-ink-muted transition-colors',
        'hover:border-control hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-muted',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      )}
    >
      {children}
    </button>
  );
}

function Slider({
  id,
  label,
  min,
  max,
  value,
  suffix,
  onChange,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="range-input"
        aria-label={label}
      />
      <span className="w-11 shrink-0 text-right text-[12px] tabular-nums text-ink-subtle">
        {value}
        {suffix}
      </span>
    </div>
  );
}

function Swatch({
  label,
  selected,
  onClick,
  className,
  style,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onClick}
      style={style}
      className={cn(
        'size-7 rounded-md border transition-[box-shadow,border-color]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected ? 'border-navy ring-2 ring-navy/30' : 'border-line hover:border-control',
        className,
      )}
    />
  );
}
