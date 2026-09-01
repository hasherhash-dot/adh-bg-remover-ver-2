'use client';

import { useState } from 'react';
import { ArrowRight, Scan } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The full-resolution claim, shown rather than asserted.
 *
 * This is the product's strongest technical advantage and the easiest one to
 * write as a sentence nobody believes. So the section is built out of evidence:
 *
 *   The numbers are real. `food.jpg` is a 6000x4000 photograph and the cut-out
 *   comes back at 6000x4000 — build-showcase-crops.mjs asserts that the engine
 *   returned the source dimensions and refuses to write the crops if it did
 *   not, so this section cannot silently start lying.
 *
 *   The loupe is real. It is `extract`ed from the 24 MP output with no resize,
 *   so what is on screen is genuinely the pixels the engine produced. That is
 *   the part a downscaled "after" image can never demonstrate: individual
 *   sesame seeds only survive if the mask really was applied at full size.
 *
 * The interaction is the loupe's own before/after toggle, which is where it
 * earns its place — at 1:1 you can see both that the detail survived and that
 * the boundary is clean.
 */

export interface ResolutionProofProps {
  /** Full frames, scaled for the web. */
  beforeUrl: string;
  afterUrl: string;
  /** Native 1:1 crops taken from the full-size original and output. */
  zoomBeforeUrl: string;
  zoomAfterUrl: string;
  zoomWidth: number;
  zoomHeight: number;
  /** The real dimensions of the source photograph. */
  width: number;
  height: number;
  className?: string;
}

export function ResolutionProof({
  beforeUrl,
  afterUrl,
  zoomBeforeUrl,
  zoomAfterUrl,
  zoomWidth,
  zoomHeight,
  width,
  height,
  className,
}: ResolutionProofProps) {
  const [showCutout, setShowCutout] = useState(true);
  const megapixels = Math.round((width * height) / 1e6);

  return (
    <div className={className}>
      {/* In, engine, out. One row, so the equality of the two numbers is the
          thing you notice. */}
      <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-6">
        <Frame
          label="Uploaded"
          src={beforeUrl}
          alt="The original photograph before its background was removed"
          dimensions={`${width} × ${height}`}
          megapixels={megapixels}
        />

        <div className="flex items-center justify-center gap-3 lg:flex-col lg:gap-2">
          <span className="h-px w-10 bg-line-strong lg:h-10 lg:w-px" aria-hidden />
          <span className="flex items-center gap-2 rounded-full border border-line bg-paper-raised px-3 py-1.5 shadow-subtle">
            <Scan className="size-3.5 text-accent" aria-hidden />
            <span className="whitespace-nowrap text-[11px] font-semibold text-ink">
              ADH engine
            </span>
          </span>
          <span className="h-px w-10 bg-line-strong lg:h-10 lg:w-px" aria-hidden />
          <ArrowRight className="size-4 shrink-0 text-accent lg:rotate-90" aria-hidden />
        </div>

        <Frame
          label="Downloaded"
          src={afterUrl}
          alt="The same photograph with its background removed, at the same size"
          dimensions={`${width} × ${height}`}
          megapixels={megapixels}
          transparent
          emphasis
        />
      </div>

      {/* The loupe. The claim above is a pair of numbers; this is the evidence
          that they mean something. */}
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper-raised">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-ink">
            1:1 detail
            <span className="font-normal text-ink-subtle">
              actual pixels from the {megapixels} MP result
            </span>
          </p>

          <div
            role="radiogroup"
            aria-label="Which version to show at 1:1"
            className="flex rounded-lg border border-line bg-paper-sunken p-1"
          >
            {[
              { id: 'original', label: 'Original', on: false },
              { id: 'cutout', label: 'Cut-out', on: true },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={showCutout === option.on}
                onClick={() => setShowCutout(option.on)}
                className={cn(
                  'min-h-9 rounded-md px-3.5 text-[12px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  showCutout === option.on
                    ? 'bg-paper-raised text-ink shadow-subtle'
                    : 'text-ink-subtle hover:text-ink',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className={cn('relative', showCutout && 'checkerboard')}>
          <img
            src={zoomBeforeUrl}
            alt="A close detail of the original photograph at full resolution"
            width={zoomWidth}
            height={zoomHeight}
            loading="lazy"
            className={cn('loupe block w-full', showCutout ? 'opacity-0' : 'opacity-100')}
          />
          <img
            src={zoomAfterUrl}
            alt="The same detail in the finished cut-out, at full resolution"
            width={zoomWidth}
            height={zoomHeight}
            loading="lazy"
            className={cn(
              'loupe absolute inset-0 block size-full',
              showCutout ? 'opacity-100' : 'opacity-0',
            )}
          />

          <span className="absolute bottom-3 right-3 rounded-md bg-ink/75 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm">
            {zoomWidth} × {zoomHeight} crop · not resized
          </span>
        </div>
      </div>
    </div>
  );
}

function Frame({
  label,
  src,
  alt,
  dimensions,
  megapixels,
  transparent = false,
  emphasis = false,
}: {
  label: string;
  src: string;
  alt: string;
  dimensions: string;
  megapixels: number;
  transparent?: boolean;
  emphasis?: boolean;
}) {
  return (
    <figure className="m-0">
      <div
        className={cn(
          'overflow-hidden rounded-xl border',
          transparent ? 'checkerboard' : 'bg-paper-sunken',
          emphasis ? 'border-accent shadow-raised' : 'border-line',
        )}
      >
        <img src={src} alt={alt} loading="lazy" className="block aspect-3/2 w-full object-cover" />
      </div>
      <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span
          className={cn(
            'text-[15px] font-semibold tabular-nums',
            emphasis ? 'text-accent' : 'text-ink-muted',
          )}
        >
          {dimensions}
          <span className="ml-2 text-[12px] font-medium text-ink-subtle">{megapixels} MP</span>
        </span>
      </figcaption>
    </figure>
  );
}
