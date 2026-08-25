import { publicConfig } from '@/lib/config/public';

/**
 * Analytics abstraction.
 *
 * The app emits typed domain events and knows nothing about the destination.
 * Swapping to PostHog/Segment/Plausible means writing one adapter and
 * registering it in `resolveAdapter()`; no call site changes.
 *
 * No adapter is enabled by default, so nothing is sent anywhere unless the
 * deployment opts in via NEXT_PUBLIC_ANALYTICS_DRIVER.
 */

export type AnalyticsEvent =
  | { name: 'upload_started'; props: { source: 'drop' | 'browse' | 'paste' | 'url'; count: number } }
  | { name: 'upload_completed'; props: { count: number; totalBytes: number } }
  | { name: 'upload_rejected'; props: { reason: string; filename?: string } }
  | { name: 'background_removal_started'; props: { bytes: number; mimeType: string } }
  | {
      name: 'background_removal_completed';
      props: { durationMs: number; width: number; height: number; bytes: number };
    }
  | { name: 'background_removal_failed'; props: { code: string } }
  | { name: 'download_clicked'; props: { format: string; background: string } }
  | { name: 'copy_clicked'; props: Record<string, never> }
  | { name: 'batch_started'; props: { count: number } }
  | { name: 'batch_completed'; props: { count: number; succeeded: number; durationMs: number } }
  | { name: 'batch_download_all'; props: { count: number } }
  | { name: 'editor_opened'; props: Record<string, never> }
  | { name: 'editor_background_changed'; props: { type: string } }
  | { name: 'extension_install'; props: Record<string, never> }
  | { name: 'extension_remove_background'; props: { source: 'context-menu' | 'popup' } };

export type AnalyticsEventName = AnalyticsEvent['name'];

export interface AnalyticsAdapter {
  readonly id: string;
  track(name: AnalyticsEventName, props: Record<string, unknown>): void;
  page?(path: string): void;
  identify?(id: string, traits?: Record<string, unknown>): void;
}

/** Discards everything. The default. */
class NoopAdapter implements AnalyticsAdapter {
  readonly id = 'none';
  track(): void {}
}

/** Prints events during development so wiring can be verified. */
class ConsoleAdapter implements AnalyticsAdapter {
  readonly id = 'console';
  track(name: AnalyticsEventName, props: Record<string, unknown>): void {
    console.debug('[analytics]', name, props);
  }
  page(path: string): void {
    console.debug('[analytics] page', path);
  }
}

/**
 * Posts batched events to a first-party endpoint using `sendBeacon` so a
 * navigation cannot drop the queue.
 */
class HttpAdapter implements AnalyticsAdapter {
  readonly id = 'http';
  private queue: Array<Record<string, unknown>> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly endpoint: string) {
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.flush(), { capture: true });
    }
  }

  track(name: AnalyticsEventName, props: Record<string, unknown>): void {
    this.queue.push({ name, props, at: Date.now() });
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), 2000);
  }

  private flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.queue.length === 0) return;

    const payload = JSON.stringify({ events: this.queue });
    this.queue = [];

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(this.endpoint, new Blob([payload], { type: 'application/json' }));
      } else {
        void fetch(this.endpoint, { method: 'POST', body: payload, keepalive: true });
      }
    } catch {
      // Analytics must never break the product.
    }
  }
}

function resolveAdapter(): AnalyticsAdapter {
  switch (publicConfig.analyticsDriver) {
    case 'console':
      return new ConsoleAdapter();
    case 'http':
      return publicConfig.analyticsEndpoint
        ? new HttpAdapter(publicConfig.analyticsEndpoint)
        : new NoopAdapter();
    default:
      return new NoopAdapter();
  }
}

let adapter: AnalyticsAdapter | null = null;

function getAdapter(): AnalyticsAdapter {
  adapter ??= resolveAdapter();
  return adapter;
}

/** Type-safe event emitter used throughout the UI. */
export function track<E extends AnalyticsEvent>(name: E['name'], props: E['props']): void {
  try {
    getAdapter().track(name, props as Record<string, unknown>);
  } catch {
    // Never let instrumentation surface to the user.
  }
}

export function setAnalyticsAdapter(next: AnalyticsAdapter | null): void {
  adapter = next;
}
