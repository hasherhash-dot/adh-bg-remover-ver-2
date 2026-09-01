import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The hero's product scene.
 *
 * The brief for this page is "show the feature, don't describe it", and the
 * first thing to show is the whole proposition: a photograph goes in, a
 * transparent cut-out comes out, and here is where you drop yours.
 *
 * That is one object, not three cards. The cut-out sits on a checkerboard and
 * the original is stacked directly over it, then wiped away diagonally once on
 * load with an accent seam travelling along the boundary. So the panel *is* the
 * transition rather than illustrating it, and there is no third "processing"
 * card taking up room to say something the movement already said.
 *
 * The uploader is the front object and overlaps the panel's lower-left corner.
 * It stays the largest, closest, most obviously clickable thing in the
 * composition — the scene behind it explains what clicking will do.
 *
 * No JavaScript: the wipe is a CSS animation with `both`, so a visitor who
 * prefers reduced motion gets the finished state immediately rather than a
 * panel stuck on the original.
 */

export interface HeroSceneProps {
  beforeUrl: string;
  afterUrl: string;
  /** Intrinsic size of the asset, so the panel reserves the right box. */
  width: number;
  height: number;
  /**
   * What the output chip says.
   *
   * Deliberately not a pixel count. The hero shows an art-directed crop, so
   * any dimensions printed here would describe the crop rather than what the
   * tool returns for that photograph — true of the asset, misleading about the
   * product. The resolution claim is made properly, with evidence, further
   * down the page.
   */
  outputLabel?: string;
  /** The uploader. Passed in so this file never imports the studio. */
  children: React.ReactNode;
  className?: string;
}

export function HeroScene({
  beforeUrl,
  afterUrl,
  width,
  height,
  outputLabel = 'Transparent PNG',
  children,
  className,
}: HeroSceneProps) {
  return (
    <div className={cn('relative', className)}>
      {/* The panel. On mobile it is a plain block above the uploader; from lg
          it becomes the backdrop the uploader sits in front of. */}
      <div className="relative lg:ml-[16%] lg:w-[84%]">
        <div className="relative overflow-hidden rounded-xl border border-line bg-paper-raised shadow-float">
          {/* Panel chrome, so this reads as product surface rather than a
              stock photo with a border. */}
          <div className="flex items-center justify-between gap-3 border-b border-line bg-paper-sunken px-4 py-2.5">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-accent" aria-hidden />
              <span className="text-[11px] font-semibold tracking-wide text-ink-muted">
                Result
              </span>
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-line bg-paper-raised px-2.5 py-1">
              <Download className="size-3 text-navy" aria-hidden />
              <span className="text-[10px] font-semibold text-ink">{outputLabel}</span>
            </span>
          </div>

          {/* The stack. Checkerboard and cut-out underneath, original on top
              being wiped off. Both images are always in the DOM, so nothing
              decodes mid-animation. */}
          <div className="checkerboard relative">
            <img
              src={afterUrl}
              alt="The same photograph with its background removed, on a transparency grid"
              width={width}
              height={height}
              fetchPriority="high"
              className="block h-[22rem] w-full object-cover object-center sm:h-[26rem] lg:h-[34rem]"
            />

            <img
              src={beforeUrl}
              alt=""
              aria-hidden
              width={width}
              height={height}
              fetchPriority="high"
              className="wipe-layer absolute inset-0 block h-full w-full object-cover object-center"
            />

            {/* The processing cue: a skewed accent seam that travels with the
                wipe and fades out with it. */}
            <span
              className="wipe-seam pointer-events-none absolute inset-y-0 w-24 -translate-x-1/2 -skew-x-6 bg-gradient-to-r from-transparent via-accent/70 to-transparent"
              aria-hidden
            />
          </div>
        </div>

        {/* Caption strip. Names the two states the wipe moved between, which is
            the only text this composition needs. */}
        <div className="mt-3 flex items-center gap-2 text-[11px] font-medium text-ink-subtle">
          <span>Original</span>
          <span className="h-px flex-1 bg-line-strong" aria-hidden />
          <span className="text-accent">Background removed</span>
          <span className="h-px flex-1 bg-line-strong" aria-hidden />
          <span>Transparent PNG</span>
        </div>
      </div>

      {/* The uploader: front layer, overlapping the panel from lg upwards. */}
      <div className="relative z-10 mt-6 lg:absolute lg:-left-2 lg:bottom-8 lg:mt-0 lg:w-[52%] xl:w-[48%]">
        <div className="overflow-hidden rounded-xl border border-line bg-paper-raised shadow-float">
          {children}
        </div>
      </div>
    </div>
  );
}
