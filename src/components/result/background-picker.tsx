'use client';

import { useId, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { track } from '@/lib/analytics';

/**
 * Background switcher on the result screen.
 *
 * Composites locally on a canvas rather than re-running segmentation: the mask
 * is already applied, so putting a colour behind it is a paint operation, not
 * an inference one. Instant, and it costs the user no quota.
 *
 * The source is decoded on each click rather than cached in a ref. Caching
 * introduced a lifecycle race — the cleanup that closes an ImageBitmap can run
 * before a pending decode resolves, leaving the handler with nothing to draw.
 * A PNG decode on a deliberate click is a few milliseconds.
 *
 * Rendering happens at the cutout's full resolution, so the swapped image
 * downloads at exactly the quality and size shown in the preview.
 */

export type ResultBackground = { type: 'transparent' } | { type: 'color'; color: string };

const PRESETS: Array<{ label: string; value: ResultBackground }> = [
  { label: 'Transparent', value: { type: 'transparent' } },
  { label: 'White', value: { type: 'color', color: '#ffffff' } },
  { label: 'Black', value: { type: 'color', color: '#000000' } },
];

export interface BackgroundPickerProps {
  /** The transparent cutout returned by the service. */
  source: Blob;
  /** Called with the composited result (or the original for transparent). */
  onChange: (blob: Blob, background: ResultBackground) => void;
  className?: string;
}

/** Paints `source` over a solid colour at full resolution. */
async function compositeOnColor(source: Blob, color: string): Promise<Blob | null> {
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext('2d');
    if (!context) return null;

    context.fillStyle = color;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);

    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  } finally {
    bitmap.close();
  }
}

export function BackgroundPicker({ source, onChange, className }: BackgroundPickerProps) {
  const [selected, setSelected] = useState<ResultBackground>({ type: 'transparent' });
  const [custom, setCustom] = useState('#2f6fed');
  const [busy, setBusy] = useState(false);
  const colorInputId = useId();

  const apply = async (background: ResultBackground) => {
    if (background.type === 'transparent') {
      setSelected(background);
      onChange(source, background);
      track('editor_background_changed', { type: 'transparent' });
      return;
    }

    setBusy(true);
    try {
      const blob = await compositeOnColor(source, background.color);
      if (!blob) return;
      setSelected(background);
      onChange(blob, background);
      track('editor_background_changed', { type: 'color' });
    } catch {
      // Leave the current selection in place; the transparent result is intact.
    } finally {
      setBusy(false);
    }
  };

  const isActive = (background: ResultBackground) =>
    background.type === selected.type &&
    (background.type === 'transparent' ||
      (selected.type === 'color' && background.color === selected.color));

  const customActive = selected.type === 'color' && selected.color === custom;

  return (
    <fieldset className={cn('flex flex-wrap items-center gap-x-4 gap-y-3', className)}>
      <legend className="sr-only">Result background</legend>

      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-subtle">
        Background
        {busy && <Loader2 className="ml-1.5 inline size-3 animate-spin" aria-hidden />}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <Swatch
            key={preset.label}
            label={preset.label}
            active={isActive(preset.value)}
            onClick={() => void apply(preset.value)}
            checkerboard={preset.value.type === 'transparent'}
            color={preset.value.type === 'color' ? preset.value.color : undefined}
          />
        ))}

        {/* Custom colour: the swatch *is* the colour input, so one tap opens
            the native picker on every platform. */}
        <label
          htmlFor={colorInputId}
          className={cn(
            'group relative flex min-h-9 cursor-pointer items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-all',
            customActive
              ? 'border-ink bg-paper-sunken'
              : 'border-line hover:border-ink/30 hover:bg-paper-sunken/60',
          )}
        >
          <span
            className="relative flex size-7 items-center justify-center rounded-full border border-line-strong"
            style={{ backgroundColor: custom }}
          >
            {customActive && <Check className="size-3.5 text-white mix-blend-difference" aria-hidden />}
          </span>
          <span className="text-[13px] font-medium text-ink">Custom</span>
          <input
            id={colorInputId}
            type="color"
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value);
              void apply({ type: 'color', color: event.target.value });
            }}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Choose a custom background colour"
          />
        </label>
      </div>
    </fieldset>
  );
}

function Swatch({
  label,
  active,
  onClick,
  color,
  checkerboard,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  checkerboard?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex min-h-9 items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition-all',
        active
          ? 'border-ink bg-paper-sunken'
          : 'border-line hover:border-ink/30 hover:bg-paper-sunken/60',
      )}
    >
      <span
        className={cn(
          'flex size-7 items-center justify-center rounded-full border border-line-strong',
          checkerboard && 'checkerboard checkerboard-sm',
        )}
        style={color ? { backgroundColor: color } : undefined}
      >
        {active && (
          <Check
            className={cn('size-3.5', color === '#000000' ? 'text-white' : 'text-ink')}
            aria-hidden
          />
        )}
      </span>
      <span className="text-[13px] font-medium text-ink">{label}</span>
    </button>
  );
}
