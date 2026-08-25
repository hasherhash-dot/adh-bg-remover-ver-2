import 'server-only';
import { AppError } from '@/lib/errors';
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProvider,
  ImageInput,
  SegmentationResult,
} from '../types';

/**
 * Replicate-hosted segmentation.
 *
 * Implemented against Replicate's public prediction API with no SDK, so the
 * dependency footprint stays small. Requires REPLICATE_API_TOKEN and
 * REPLICATE_MODEL_VERSION; without them the provider refuses to construct
 * rather than failing later at request time.
 */

const REPLICATE_API = 'https://api.replicate.com/v1/predictions';
const POLL_INTERVAL_MS = 1_000;

export interface ReplicateProviderConfig {
  apiToken: string;
  modelVersion: string;
  /** Name of the model input that receives the image data URI. */
  inputField?: string;
  timeoutMs?: number;
}

interface PredictionResponse {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: string | string[] | null;
  error?: string | null;
}

export class ReplicateProvider implements BackgroundRemovalProvider {
  readonly id = 'replicate';
  readonly name = 'Replicate';
  readonly isLocal = false;

  constructor(private readonly config: ReplicateProviderConfig) {
    if (!config.apiToken || !config.modelVersion) {
      throw new AppError('PROVIDER_MISCONFIGURED', {
        detail: 'REPLICATE_API_TOKEN and REPLICATE_MODEL_VERSION are required',
      });
    }
  }

  async segment(
    input: ImageInput,
    options: BackgroundRemovalOptions = {},
  ): Promise<SegmentationResult> {
    const deadline = Date.now() + (this.config.timeoutMs ?? 120_000);
    const dataUri = `data:${input.mimeType};base64,${input.data.toString('base64')}`;

    let prediction = await this.request<PredictionResponse>(REPLICATE_API, {
      method: 'POST',
      body: JSON.stringify({
        version: this.config.modelVersion,
        input: { [this.config.inputField ?? 'image']: dataUri },
      }),
    });

    while (prediction.status === 'starting' || prediction.status === 'processing') {
      if (Date.now() > deadline) {
        throw new AppError('PROCESSING_TIMEOUT', { detail: `prediction ${prediction.id}` });
      }
      options.signal?.throwIfAborted();
      options.onProgress?.(0.5, prediction.status);
      await sleep(POLL_INTERVAL_MS);
      prediction = await this.request<PredictionResponse>(`${REPLICATE_API}/${prediction.id}`, {
        method: 'GET',
      });
    }

    if (prediction.status !== 'succeeded') {
      throw new AppError('PROCESSING_FAILED', {
        detail: `replicate ${prediction.status}: ${prediction.error ?? 'no detail'}`,
      });
    }

    const url = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
    if (!url) {
      throw new AppError('PROCESSING_FAILED', { detail: 'replicate returned no output' });
    }

    const imageResponse = await fetch(url);
    if (!imageResponse.ok) {
      throw new AppError('PROVIDER_UNAVAILABLE', {
        detail: `output fetch failed: ${imageResponse.status}`,
      });
    }
    return { png: Buffer.from(await imageResponse.arrayBuffer()) };
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const detail = `replicate ${response.status}: ${(await response.text()).slice(0, 200)}`;
      if (response.status === 429) throw new AppError('RATE_LIMITED', { detail });
      if (response.status === 401) throw new AppError('PROVIDER_MISCONFIGURED', { detail });
      throw new AppError('PROVIDER_UNAVAILABLE', { detail });
    }
    return (await response.json()) as T;
  }

  async healthCheck(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: `version=${this.config.modelVersion.slice(0, 12)}` };
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
