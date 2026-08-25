import 'server-only';
import { AppError } from '@/lib/errors';
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProvider,
  ImageInput,
  SegmentationResult,
} from '../types';

/**
 * Generic provider for any HTTP service that accepts an image and returns a
 * transparent PNG — self-hosted rembg, a colleague's Modal endpoint, or a
 * commercial API with a compatible shape.
 *
 * The credential is read from the server environment and attached here. It is
 * never included in a response body and never reaches the browser or the
 * extension: clients call our own /api/remove-background, which calls this.
 */

export interface HttpProviderConfig {
  endpoint: string;
  apiKey?: string;
  /** Header used for the credential. Defaults to `Authorization: Bearer …`. */
  authHeader?: string;
  authScheme?: string;
  /** Form field name for the image part. */
  fileField?: string;
  timeoutMs?: number;
}

export class HttpProvider implements BackgroundRemovalProvider {
  readonly id = 'http';
  readonly name = 'Remote HTTP service';
  readonly isLocal = false;

  constructor(private readonly config: HttpProviderConfig) {
    if (!config.endpoint) {
      throw new AppError('PROVIDER_MISCONFIGURED', {
        detail: 'BACKGROUND_REMOVAL_API_URL is required when provider=http',
      });
    }
  }

  async segment(
    input: ImageInput,
    options: BackgroundRemovalOptions = {},
  ): Promise<SegmentationResult> {
    const timeoutMs = this.config.timeoutMs ?? 60_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const form = new FormData();
      form.append(
        this.config.fileField ?? 'image',
        new Blob([new Uint8Array(input.data)], { type: input.mimeType }),
        input.filename,
      );

      const headers: Record<string, string> = { Accept: 'image/png' };
      if (this.config.apiKey) {
        const header = this.config.authHeader ?? 'Authorization';
        const scheme = this.config.authScheme ?? 'Bearer';
        headers[header] = scheme ? `${scheme} ${this.config.apiKey}` : this.config.apiKey;
      }

      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        body: form,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        // Upstream error text may contain internal detail — log-side only.
        const detail = `upstream ${response.status}: ${(await response.text()).slice(0, 200)}`;
        if (response.status === 429) throw new AppError('RATE_LIMITED', { detail });
        if (response.status === 401 || response.status === 403) {
          throw new AppError('PROVIDER_MISCONFIGURED', { detail });
        }
        throw new AppError('PROVIDER_UNAVAILABLE', { detail });
      }

      const png = Buffer.from(await response.arrayBuffer());
      if (png.length === 0) {
        throw new AppError('PROCESSING_FAILED', { detail: 'upstream returned an empty body' });
      }
      return { png };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError('PROCESSING_TIMEOUT', { cause: error });
      }
      throw new AppError('PROVIDER_UNAVAILABLE', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: Boolean(this.config.endpoint), detail: this.config.endpoint };
  }
}
