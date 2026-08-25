/**
 * Provider-agnostic contracts for background removal.
 *
 * Nothing in this file may import a concrete model, SDK or HTTP client. The UI
 * and the API layer depend only on these types, which is what makes the engine
 * swappable between local ONNX inference, a hosted API, or a stub.
 */

/** Raw image bytes plus whatever we know about their origin. */
export interface ImageInput {
  data: Buffer;
  /** MIME type detected from the file's magic bytes — not from the client. */
  mimeType: string;
  /** Original filename, already sanitised. Used for output naming only. */
  filename: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

/** What the provider returns: an alpha mask, or a finished cutout, or both. */
export interface SegmentationResult {
  /**
   * Single-channel 8-bit alpha mask. 0 = background, 255 = subject.
   * Preferred: the service composites it onto the full-resolution original,
   * so output resolution is independent of the model's input resolution.
   */
  mask?: {
    data: Buffer;
    width: number;
    height: number;
  };
  /**
   * A ready-made RGBA cutout encoded as PNG. Used when a provider cannot
   * expose a raw mask (most hosted APIs). The service will still re-derive a
   * full-resolution result from its alpha channel where possible.
   */
  png?: Buffer;
}

export interface BackgroundRemovalOptions {
  /** Longest edge fed to the model. Bounds memory; does not cap output size. */
  inferenceSize?: number;
  /** Called with 0..1 progress where the provider can report it. */
  onProgress?: (progress: number, stage: string) => void;
  signal?: AbortSignal;
}

/**
 * The single interface every engine implements.
 *
 * @example
 * class MyProvider implements BackgroundRemovalProvider {
 *   readonly id = 'my-provider';
 *   async segment(input: ImageInput): Promise<SegmentationResult> { ... }
 * }
 */
export interface BackgroundRemovalProvider {
  /** Stable identifier reported in API responses and analytics. */
  readonly id: string;
  /** Human-readable name for the dashboard / health endpoint. */
  readonly name: string;
  /** True when inference happens in this process with no outbound network. */
  readonly isLocal: boolean;

  /**
   * Produce a segmentation for the given image.
   * Implementations should throw `AppError` with a specific code on failure.
   */
  segment(
    input: ImageInput,
    options?: BackgroundRemovalOptions,
  ): Promise<SegmentationResult>;

  /** Cheap readiness probe used by /api/health. */
  healthCheck?(): Promise<{ ok: boolean; detail?: string }>;

  /** Release models / sessions. Called on graceful shutdown and in tests. */
  dispose?(): Promise<void>;
}

/** Background treatment applied to the cutout when producing the final image. */
export type BackgroundFill =
  | { type: 'transparent' }
  | { type: 'color'; color: string }
  | { type: 'image'; data: Buffer; fit?: 'cover' | 'contain' };

export interface ProcessedImage {
  /** Final encoded image. PNG (RGBA) unless a background fill was applied. */
  data: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
  byteSize: number;
  /** Metadata about how the result was produced. */
  meta: ProcessingMeta;
}

export interface ProcessingMeta {
  providerId: string;
  /** Wall-clock milliseconds for the whole pipeline. */
  processingTimeMs: number;
  /** Milliseconds spent inside the model. */
  inferenceTimeMs: number;
  /** Dimensions of the source image after EXIF rotation. */
  source: ImageDimensions & { mimeType: string; byteSize: number };
  /** Resolution the model actually ran at. */
  inference: ImageDimensions;
  /** Fraction of pixels that ended up fully or partly transparent, 0..1. */
  backgroundRatio: number;
}
