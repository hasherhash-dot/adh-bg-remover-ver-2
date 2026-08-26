import 'server-only';
import { AppError, toAppError } from '@/lib/errors';
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProvider,
  ImageInput,
  SegmentationResult,
} from '../types';

/**
 * Pairs a primary engine with a standby, without ever lying about which one ran.
 *
 * Opt-in via BACKGROUND_REMOVAL_FALLBACK and off by default. The reason for the
 * default is A/B testing: if the ADH engine quietly handed failures to IMG.LY,
 * every visual comparison would silently be comparing IMG.LY against itself on
 * exactly the images where the difference mattered most.
 *
 * Two rules make this safe to leave on once testing is done:
 *
 * 1. It only reacts to the engine being *unavailable* — a missing model file, a
 *    session that will not start. A PROCESSING_FAILED on one awkward image is
 *    that image's problem and must surface; retrying it on another engine would
 *    hide a real defect behind a second opinion.
 *
 * 2. `id` always reports the engine that actually produced the result, so the
 *    X-Provider header, the usage record and the dashboard all agree. There is
 *    no state in which a caller is told "adh-onnx" and shown IMG.LY's work.
 *
 * The decision is made once and cached. Unavailability is a property of the
 * deployment, not of a request: if the weights are missing at boot they will be
 * missing at request 400, and re-probing every time would add a failed model
 * load to the latency of each one.
 */

/** Failures that mean "this engine cannot run here", as opposed to "this image failed". */
const UNAVAILABLE_CODES = new Set(['PROVIDER_MISCONFIGURED', 'PROVIDER_UNAVAILABLE']);

function isUnavailable(error: unknown): boolean {
  const appError = toAppError(error);
  return UNAVAILABLE_CODES.has(appError.code);
}

export class FallbackProvider implements BackgroundRemovalProvider {
  /** Set once the primary has been found unusable. */
  private active: BackgroundRemovalProvider;
  private switched = false;

  constructor(
    private readonly primary: BackgroundRemovalProvider,
    private readonly standby: BackgroundRemovalProvider,
  ) {
    this.active = primary;
  }

  /** The engine that will handle the next request — and did handle the last. */
  get id(): string {
    return this.active.id;
  }

  get name(): string {
    return this.switched
      ? `${this.standby.name} (fallback from ${this.primary.name})`
      : this.active.name;
  }

  get isLocal(): boolean {
    return this.active.isLocal;
  }

  async segment(
    input: ImageInput,
    options?: BackgroundRemovalOptions,
  ): Promise<SegmentationResult> {
    if (this.switched) return this.standby.segment(input, options);

    try {
      return await this.primary.segment(input, options);
    } catch (error) {
      if (!isUnavailable(error)) throw error;

      // Loud on purpose. A fallback that engages quietly is indistinguishable
      // from the primary working, which is how a broken deployment survives a
      // week unnoticed.
      console.error(
        `[bg-removal] ${this.primary.id} is unavailable, switching to ${this.standby.id} ` +
          `for the rest of this process. Results will be attributed to ${this.standby.id}. ` +
          `Cause: ${toAppError(error).detail ?? toAppError(error).code}`,
      );

      this.switched = true;
      this.active = this.standby;
      return this.standby.segment(input, options);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    const primary = (await this.primary.healthCheck?.()) ?? { ok: true };
    if (primary.ok && !this.switched) {
      return {
        ok: true,
        detail: `${this.primary.id}: ${primary.detail ?? 'ready'} | standby: ${this.standby.id}`,
      };
    }

    const standby = (await this.standby.healthCheck?.()) ?? { ok: true };
    return {
      ok: standby.ok,
      detail:
        `${this.primary.id} unavailable (${primary.detail ?? 'failed'}); ` +
        `serving from ${this.standby.id}: ${standby.detail ?? 'ready'}`,
    };
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([this.primary.dispose?.(), this.standby.dispose?.()]);
  }
}

/**
 * Wraps `primary` so that an unavailable engine falls through to `standby`.
 * Returns `primary` untouched when no standby is configured, so the default
 * path carries no extra layer at all.
 */
export function withFallback(
  primary: BackgroundRemovalProvider,
  standby: BackgroundRemovalProvider | null,
): BackgroundRemovalProvider {
  if (!standby) return primary;
  if (standby.id === primary.id) {
    throw new AppError('PROVIDER_MISCONFIGURED', {
      detail: `fallback provider "${standby.id}" is the same as the primary provider`,
    });
  }
  return new FallbackProvider(primary, standby);
}
