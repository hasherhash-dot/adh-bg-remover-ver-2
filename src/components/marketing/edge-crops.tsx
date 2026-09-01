'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The edge-quality proof.
 *
 * Every background remover claims soft edges. The only way to show it is to put
 * the hard cases at native resolution next to a control that exposes them, so
 * these crops are `extract`ed from the source photographs with no resize —
 * see scripts/build-showcase-crops.mjs. A downscaled edge looks soft whether
 * the alpha was good or not, which would make this section prove nothing.
 *
 * Three states, one shared control for all the crops:
 *
 *   Original    the photograph, so the difficulty is visible first
 *   Cut-out     on the transparency grid
 *   On colour   the honest one. Partial alpha blends; a hard-thresholded matte
 *               fringes. Against a saturated colour the difference is obvious,
 *               which is exactly why it is offered rather than hidden.
 *
 * One control rather than one per crop: it is the same question asked of three
 * photographs, and three identical segmented controls would be clutter.
 */

const VIEWS = [
  { id: 'original', label: 'Original' },
  { id: 'cutout', label: 'Cut-out' },
  { id: 'colour', label: 'On colour' },
] as const;

type View = (typeof VIEWS)[number]['id'];

export interface EdgeCrop {
  key: string;
  beforeUrl: string;
  afterUrl: string;
  title: string;
  note: string;
  /** Native pixel size of the crop, shown as evidence it was not resampled. */
  width: number;
  height: number;
  /** Grid span at lg, so the three are not equal columns. */
  span: string;
}

export function EdgeCrops({ crops, className }: { crops: EdgeCrop[]; className?: string }) {
  const [view, setView] = useState<View>('original');

  return (
    <div className={className}>
      <div
        role="radiogroup"
        aria-label="How to show the edges"
        className="inline-flex rounded-lg border border-line bg-paper-sunken p-1"
      >
        {VIEWS.map((option) => {
          const selected = option.id === view;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setView(option.id)}
              className={cn(
                'min-h-10 rounded-md px-4 text-[13px] font-medium transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                selected
                  ? 'bg-paper-raised text-ink shadow-subtle'
                  : 'text-ink-subtle hover:text-ink',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {/* Unequal spans on purpose. Three equal cards would read as a template;
          these are one photograph each, sized by how much detail each needs. */}
      <div className="mt-8 grid gap-5 lg:grid-cols-12">
        {crops.map((crop) => (
          <figure key={crop.key} className={cn('m-0', crop.span)}>
            <div
              className={cn(
                'relative overflow-hidden rounded-lg border border-line transition-colors duration-200',
                view === 'cutout' && 'checkerboard',
                view === 'colour' && 'bg-navy',
              )}
            >
              {/* Both images stay mounted so switching never re-decodes. */}
              <img
                src={crop.beforeUrl}
                alt={`${crop.title}, original photograph`}
                width={crop.width}
                height={crop.height}
                loading="lazy"
                className={cn(
                  'xfade block w-full',
                  view === 'original' ? 'opacity-100' : 'opacity-0',
                )}
              />
              <img
                src={crop.afterUrl}
                alt={`${crop.title}, background removed`}
                width={crop.width}
                height={crop.height}
                loading="lazy"
                className={cn(
                  'xfade absolute inset-0 block size-full',
                  view === 'original' ? 'opacity-0' : 'opacity-100',
                )}
              />
            </div>

            <figcaption className="mt-3 flex items-baseline justify-between gap-3">
              <span>
                <span className="block font-display text-[17px] font-semibold text-ink">
                  {crop.title}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-subtle">
                  {crop.note}
                </span>
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">
                {crop.width} × {crop.height}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-ink-subtle">
        Every crop above is shown at the size the engine produced it — no resizing, no sharpening.
        &ldquo;On colour&rdquo; is the honest test: partial transparency blends into the
        background, while a hard cut-out leaves a fringe.
      </p>
    </div>
  );
}
