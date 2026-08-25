import 'server-only';
import sharp from 'sharp';
import type {
  BackgroundRemovalOptions,
  BackgroundRemovalProvider,
  ImageInput,
  SegmentationResult,
} from '../types';

/**
 * Deterministic, AI-free provider used by the test suite and by CI, where
 * loading a 100MB ONNX model for every run would be wasteful.
 *
 * This is NOT a fake: it runs a real (if naive) border-flood chroma key and
 * returns a genuine alpha mask, so the surrounding pipeline — compositing,
 * encoding, metadata, error paths — is exercised end to end. It is simply a
 * much weaker segmenter than the ONNX model, which is why it is never the
 * default outside tests.
 */
export class MockProvider implements BackgroundRemovalProvider {
  readonly id = 'mock';
  readonly name = 'Border chroma key (no AI)';
  readonly isLocal = true;

  constructor(private readonly tolerance = 32) {}

  async segment(
    input: ImageInput,
    options: BackgroundRemovalOptions = {},
  ): Promise<SegmentationResult> {
    options.onProgress?.(0.1, 'decode');

    const image = sharp(input.data).ensureAlpha();
    const { width, height } = await image.metadata();
    const w = width as number;
    const h = height as number;
    const rgba = await image.raw().toBuffer();

    // Estimate the background colour from the four border rows/columns.
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let samples = 0;
    const sampleAt = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      rSum += rgba[i] as number;
      gSum += rgba[i + 1] as number;
      bSum += rgba[i + 2] as number;
      samples += 1;
    };
    for (let x = 0; x < w; x += 1) {
      sampleAt(x, 0);
      sampleAt(x, h - 1);
    }
    for (let y = 0; y < h; y += 1) {
      sampleAt(0, y);
      sampleAt(w - 1, y);
    }
    const bg = { r: rSum / samples, g: gSum / samples, b: bSum / samples };

    options.onProgress?.(0.6, 'mask');

    const mask = Buffer.allocUnsafe(w * h);
    for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
      const distance = Math.sqrt(
        ((rgba[p] as number) - bg.r) ** 2 +
          ((rgba[p + 1] as number) - bg.g) ** 2 +
          ((rgba[p + 2] as number) - bg.b) ** 2,
      );
      // Soft ramp across the tolerance band so edges are not aliased.
      const alpha = Math.max(0, Math.min(1, (distance - this.tolerance) / this.tolerance));
      mask[i] = Math.round(alpha * 255);
    }

    options.onProgress?.(1, 'done');
    return { mask: { data: mask, width: w, height: h } };
  }

  async healthCheck(): Promise<{ ok: boolean }> {
    return { ok: true };
  }
}
