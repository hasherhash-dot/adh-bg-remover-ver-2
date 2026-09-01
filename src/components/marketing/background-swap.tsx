'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * "Your cut-out is not the end" — the background replacement demonstration.
 *
 * The trick that makes this cheap: the cut-out is already a transparent PNG, so
 * putting something behind it is a CSS layer, not a canvas operation. Clicking
 * a swatch changes one class. There is no `createImageBitmap`, no `toBlob`, no
 * object URL to revoke, and nothing re-decodes — which is why the switch is
 * instant and why this can sit on the marketing page without the cost of
 * mounting the real picker.
 *
 * The product does composite for real, on the result screen, at full
 * resolution. This is a preview of that operation, not a reimplementation of
 * it: nothing here is downloadable, so nothing here can be wrong about what a
 * download would contain.
 *
 * Honest labelling matters on this one. Transparent, white, black and a custom
 * colour are what the result screen's picker actually offers. A photographic
 * backdrop is an editor capability, so the option carries that note rather than
 * implying the picker does it.
 */

export interface SwapOption {
  id: string;
  label: string;
  /** Swatch preview and panel backdrop. Omitted for transparent. */
  color?: string;
  /** A real photograph used as the backdrop. */
  image?: string;
  /** Shown under the controls when this option is selected. */
  note: string;
}

export interface BackgroundSwapProps {
  /** A real ADH cut-out, transparent PNG/WebP. */
  cutoutUrl: string;
  alt: string;
  width: number;
  height: number;
  options: SwapOption[];
  className?: string;
}

export function BackgroundSwap({
  cutoutUrl,
  alt,
  width,
  height,
  options,
  className,
}: BackgroundSwapProps) {
  const [activeId, setActiveId] = useState(options[0]?.id ?? '');
  const active = options.find((option) => option.id === activeId) ?? options[0];

  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {/* The stage. Backdrop layers sit under the subject; only their opacity
          changes, so the subject never moves or re-renders. */}
      <div className="relative overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] shadow-float">
        {/* Portrait, because the subject is a standing figure. A landscape stage
            left her floating in empty backdrop, which reads as a stock photo in
            a box rather than a product placed on a background. */}
        <div className="checkerboard relative aspect-4/5">
          {options.map((option) => {
            if (!option.color && !option.image) return null;
            return (
              <span
                key={option.id}
                aria-hidden
                className={cn(
                  'xfade absolute inset-0',
                  option.id === active?.id ? 'opacity-100' : 'opacity-0',
                )}
                style={
                  option.image
                    ? {
                        backgroundImage: `url(${option.image})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }
                    : { backgroundColor: option.color }
                }
              />
            );
          })}

          <img
            src={cutoutUrl}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            className="absolute inset-0 size-full object-contain"
          />
        </div>
      </div>

      {/* The controls. A radiogroup rather than buttons: these are five
          mutually exclusive states of one thing, and that is what a screen
          reader should hear. */}
      <div>
        <div
          role="radiogroup"
          aria-label="Background"
          className="flex flex-wrap items-center gap-2.5"
        >
          {options.map((option) => {
            const selected = option.id === active?.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setActiveId(option.id)}
                className={cn(
                  'flex min-h-11 items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
                  selected
                    ? 'border-accent bg-accent text-white'
                    : 'border-white/20 bg-white/[0.06] text-white/75 hover:border-white/40 hover:text-white',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'size-4 shrink-0 rounded-full border',
                    selected ? 'border-white/70' : 'border-white/30',
                    !option.color && !option.image && 'checkerboard checkerboard-sm',
                  )}
                  style={
                    option.image
                      ? { backgroundImage: `url(${option.image})`, backgroundSize: 'cover' }
                      : option.color
                        ? { backgroundColor: option.color }
                        : undefined
                  }
                />
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="mt-4 min-h-10 text-[14px] leading-relaxed text-white/60">{active?.note}</p>
      </div>
    </div>
  );
}
