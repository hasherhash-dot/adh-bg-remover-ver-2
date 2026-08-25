import 'server-only';
import { AppError, toAppError } from '@/lib/errors';
import { serverEnv, maxUploadBytes } from '@/lib/config/env';
import { validateUploadBytes } from '@/lib/image/validate';
import {
  compositeMask,
  extractAlpha,
  normalizeImage,
  prepareForInference,
  renderResult,
} from '@/lib/image/pipeline';
import { resolveProvider, type ProviderId } from './registry';
import type {
  BackgroundFill,
  BackgroundRemovalProvider,
  ProcessedImage,
  SegmentationResult,
} from './types';

/**
 * The single entry point for turning an uploaded file into a finished image.
 *
 * Responsibilities that belong here and nowhere else:
 *   - validating and normalising input
 *   - deciding what resolution the model runs at
 *   - lifting the model's mask back to full resolution
 *   - applying the requested background and encoding the output
 *   - producing the metadata the UI and API report
 *
 * The service owns no model code. Swapping engines is a registry concern; the
 * pipeline above is identical for a local ONNX session and a hosted API.
 */

export interface RemoveBackgroundRequest {
  /** Raw file bytes as received. */
  data: Buffer;
  /** Client-supplied name, sanitised before use. */
  filename: string;
  /** Background treatment for the output. Defaults to transparent. */
  background?: BackgroundFill;
  /** Output encoding. Forced to png whenever the background is transparent. */
  format?: 'png' | 'jpeg' | 'webp';
  /** Overrides the configured provider. Used by tests and the health check. */
  provider?: ProviderId;
  onProgress?: (progress: number, stage: string) => void;
  signal?: AbortSignal;
}

export class BackgroundRemovalService {
  constructor(private readonly providerOverride?: BackgroundRemovalProvider) {}

  private provider(id?: ProviderId): BackgroundRemovalProvider {
    return this.providerOverride ?? resolveProvider(id);
  }

  async removeBackground(request: RemoveBackgroundRequest): Promise<ProcessedImage> {
    const startedAt = Date.now();
    const env = serverEnv();
    const provider = this.provider(request.provider);

    try {
      request.onProgress?.(0.05, 'validating');
      const upload = validateUploadBytes(request.data, request.filename, {
        maxBytes: maxUploadBytes(),
        maxMegapixels: env.MAX_IMAGE_MEGAPIXELS,
      });

      request.onProgress?.(0.15, 'decoding');
      const original = await normalizeImage(
        upload.data,
        upload.mimeType,
        env.MAX_IMAGE_MEGAPIXELS,
      );

      request.onProgress?.(0.25, 'preparing');
      const inference = await prepareForInference(
        original,
        env.BACKGROUND_REMOVAL_INFERENCE_SIZE,
      );

      request.onProgress?.(0.35, 'segmenting');
      const inferenceStart = Date.now();
      const segmentation = await provider.segment(
        {
          data: inference.buffer,
          mimeType: 'image/png',
          filename: upload.filename,
        },
        {
          inferenceSize: env.BACKGROUND_REMOVAL_INFERENCE_SIZE,
          signal: request.signal,
          onProgress: (ratio, stage) => request.onProgress?.(0.35 + ratio * 0.4, stage),
        },
      );
      const inferenceTimeMs = Date.now() - inferenceStart;

      request.onProgress?.(0.8, 'compositing');
      const mask = await resolveMask(segmentation);
      const composited = await compositeMask(original, mask);

      request.onProgress?.(0.9, 'encoding');
      const background = request.background ?? { type: 'transparent' };
      // Transparency can only survive in PNG/WebP; never silently flatten it.
      const format =
        background.type === 'transparent' ? 'png' : (request.format ?? 'png');

      const rendered = await renderResult(
        composited.rgba,
        { width: composited.width, height: composited.height },
        background,
        format,
      );

      request.onProgress?.(1, 'done');

      return {
        data: rendered.data,
        mimeType: rendered.mimeType,
        width: composited.width,
        height: composited.height,
        byteSize: rendered.data.length,
        meta: {
          providerId: provider.id,
          processingTimeMs: Date.now() - startedAt,
          inferenceTimeMs,
          source: {
            width: original.width,
            height: original.height,
            mimeType: upload.mimeType,
            byteSize: upload.byteSize,
          },
          inference: inference.dimensions,
          backgroundRatio: composited.backgroundRatio,
        },
      };
    } catch (error) {
      throw toAppError(error);
    }
  }

  async health(): Promise<{ ok: boolean; provider: string; detail?: string }> {
    const provider = this.provider();
    const result = (await provider.healthCheck?.()) ?? { ok: true };
    return { ok: result.ok, provider: provider.id, detail: result.detail };
  }
}

/**
 * Normalises whatever the provider returned into a single-channel mask.
 * Providers that can only produce a finished PNG have their alpha channel
 * extracted here, so the full-resolution composite path is identical for all.
 */
async function resolveMask(
  segmentation: SegmentationResult,
): Promise<{ data: Buffer; width: number; height: number }> {
  if (segmentation.mask) return segmentation.mask;
  if (segmentation.png) return extractAlpha(segmentation.png);
  throw new AppError('PROCESSING_FAILED', {
    detail: 'provider returned neither a mask nor a PNG',
  });
}

/** Convenience singleton for route handlers. */
export const backgroundRemovalService = new BackgroundRemovalService();
