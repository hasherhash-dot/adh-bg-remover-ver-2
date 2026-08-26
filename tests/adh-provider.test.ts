import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { AdhOnnxProvider, ADH_MODEL_CONFIG, decodeMask } from '@/lib/bg-removal/providers/adh-onnx';
import { resolveProvider, resetProvider } from '@/lib/bg-removal/registry';
import { resetServerEnvCache } from '@/lib/config/env';
import { compositeMask, normalizeImage, resizeMask } from '@/lib/image/pipeline';
import { AppError } from '@/lib/errors';

/**
 * The ADH engine.
 *
 * Split into three groups by what they need:
 *
 *   - decode and configuration tests run everywhere, with no model
 *   - registry and switching tests need no model either
 *   - inference tests need models/birefnet-lite-640.onnx and are skipped
 *     without it, so a clone that has not built the weights still gets a
 *     green suite rather than a wall of failures
 *
 * The buffer-shape assertions matter more than they look. Every serious defect
 * this engine has had was a silent disagreement about bytes per pixel, and each
 * one produced output that looked plausible until someone zoomed in.
 */

const MODEL = ADH_MODEL_CONFIG.defaultModelPath;
const hasModel = existsSync(MODEL);
const withModel = hasModel ? describe : describe.skip;

if (!hasModel) {
  console.warn(`[adh-provider] ${MODEL} not found — inference tests skipped. See models/README.md`);
}

/** A tensor shaped the way the real model's output is shaped. */
function fakeOutput(width: number, height: number, fill: (i: number) => number, channels = 1) {
  const data = new Float32Array(width * height * channels);
  for (let i = 0; i < data.length; i += 1) data[i] = fill(i);
  return { data, dims: [1, channels, height, width] as const };
}

describe('decodeMask — output interpretation', () => {
  it('maps probabilities straight onto 0..255 without thresholding', () => {
    const output = fakeOutput(4, 4, (i) => i / 15);
    const mask = decodeMask(output);

    expect(mask.width).toBe(4);
    expect(mask.height).toBe(4);
    expect(mask.data).toHaveLength(16);
    expect(mask.data[0]).toBe(0);
    expect(mask.data[15]).toBe(255);
    // The midpoint must survive as a midpoint. If this becomes 0 or 255,
    // something has started thresholding and soft edges are gone.
    expect(mask.data[8]).toBeGreaterThan(100);
    expect(mask.data[8]).toBeLessThan(160);
  });

  it('preserves the full soft-alpha range rather than collapsing it', () => {
    const output = fakeOutput(16, 16, (i) => (i % 256) / 255);
    const mask = decodeMask(output);

    const distinct = new Set(mask.data);
    // A thresholded mask has 2 distinct values. A soft one has many.
    expect(distinct.size).toBeGreaterThan(50);
  });

  it('applies a sigmoid when the export emits logits instead', () => {
    // Range well outside [0,1] — this is what an export missing the sigmoid
    // wrapper would produce, and squashing it linearly would be wrong.
    const output = fakeOutput(2, 2, (i) => [-8, -1, 1, 8][i] as number);
    const mask = decodeMask(output);

    expect(mask.data[0]).toBeLessThan(5); // sigmoid(-8) ~ 0.0003
    expect(mask.data[3]).toBeGreaterThan(250); // sigmoid(8) ~ 0.9997
    expect(mask.data[1]).toBeGreaterThan(50); // sigmoid(-1) ~ 0.27
    expect(mask.data[1]).toBeLessThan(90);
  });

  it('reads the first plane contiguously, never striding across channels', () => {
    // Plane 0 all 1.0, plane 1 all 0.0. A strided read would interleave them.
    const width = 8;
    const height = 8;
    const plane = width * height;
    const data = new Float32Array(plane * 2);
    data.fill(1, 0, plane);
    data.fill(0, plane);

    const mask = decodeMask({ data, dims: [1, 2, height, width] });

    expect(mask.data).toHaveLength(plane);
    expect([...mask.data].every((v) => v === 255)).toBe(true);
  });

  it('produces exactly width * height bytes', () => {
    for (const [w, h] of [[640, 640], [17, 23], [1, 1]] as const) {
      const mask = decodeMask(fakeOutput(w, h, () => 0.5));
      expect(mask.data).toHaveLength(w * h);
      expect(mask.width).toBe(w);
      expect(mask.height).toBe(h);
    }
  });

  it('rejects a tensor whose length is not a whole multiple of the plane', () => {
    const data = new Float32Array(17);
    expect(() => decodeMask({ data, dims: [1, 1, 4, 4] })).toThrow(AppError);
  });

  it('rejects a tensor with too few dimensions to carry geometry', () => {
    expect(() => decodeMask({ data: new Float32Array(4), dims: [4] })).toThrow(AppError);
  });
});

describe('model configuration', () => {
  it('states the geometry and normalisation the export was built for', () => {
    // These are not free parameters. Changing the size requires a matching
    // re-export, and changing mean/std silently degrades every mask.
    expect(ADH_MODEL_CONFIG.inputSize).toBe(640);
    expect(ADH_MODEL_CONFIG.mean).toEqual([0.485, 0.456, 0.406]);
    expect(ADH_MODEL_CONFIG.std).toEqual([0.229, 0.224, 0.225]);
  });
});

describe('provider identity and failure behaviour', () => {
  it('reports itself as local so no outbound call is implied', () => {
    const provider = new AdhOnnxProvider();
    expect(provider.id).toBe('adh-onnx');
    expect(provider.isLocal).toBe(true);
    expect(provider.name).toContain('640');
  });

  it('fails loudly when the model file is missing, and names the fix', async () => {
    const provider = new AdhOnnxProvider({ modelPath: join('models', 'does-not-exist.onnx') });
    const health = await provider.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.detail).toMatch(/export-birefnet/);
  });

  it('does not fall back to another engine when it cannot start', async () => {
    const provider = new AdhOnnxProvider({ modelPath: join('models', 'does-not-exist.onnx') });

    await expect(
      provider.segment({ data: Buffer.alloc(8), mimeType: 'image/png', filename: 'x.png' }),
    ).rejects.toThrow(AppError);
  });
});

describe('provider switching', () => {
  const original = process.env.BACKGROUND_REMOVAL_PROVIDER;

  beforeEach(() => {
    resetProvider();
    resetServerEnvCache();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.BACKGROUND_REMOVAL_PROVIDER;
    else process.env.BACKGROUND_REMOVAL_PROVIDER = original;
    resetProvider();
    resetServerEnvCache();
  });

  it('selects the IMG.LY engine by default', () => {
    delete process.env.BACKGROUND_REMOVAL_PROVIDER;
    resetServerEnvCache();
    // Registry key is 'local'; the provider reports itself as 'local-onnx'.
    expect(resolveProvider().id).toBe('local-onnx');
  });

  it('selects the ADH engine when the environment asks for it', () => {
    process.env.BACKGROUND_REMOVAL_PROVIDER = 'adh-onnx';
    resetServerEnvCache();

    const provider = resolveProvider();
    expect(provider.id).toBe('adh-onnx');
    expect(provider.isLocal).toBe(true);
  });

  it('keeps both engines reachable so results can be attributed', () => {
    expect(resolveProvider('local').id).toBe('local-onnx');
    expect(resolveProvider('adh-onnx').id).toBe('adh-onnx');
  });

  it('rejects an unknown provider rather than defaulting to one', () => {
    expect(() => resolveProvider('nonsense' as never)).toThrow(AppError);
  });
});

withModel('inference', () => {
  let provider: AdhOnnxProvider;

  beforeEach(() => {
    provider = new AdhOnnxProvider();
  });

  afterEach(async () => {
    await provider.dispose();
  });

  async function fixture() {
    const path = join('debug', 'input', 'portrait-1.jpg');
    if (!existsSync(path)) return null;
    return readFile(path);
  }

  it('loads the model and reports the tensor names it will use', async () => {
    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.detail).toContain('birefnet-lite-640');
  });

  it('returns a single-channel mask at the model resolution', async () => {
    const image = await fixture();
    if (!image) return;

    const result = await provider.segment({
      data: image,
      mimeType: 'image/jpeg',
      filename: 'portrait-1.jpg',
    });

    expect(result.mask).toBeDefined();
    const mask = result.mask as { data: Buffer; width: number; height: number };
    expect(mask.width).toBe(640);
    expect(mask.height).toBe(640);
    // Exactly one byte per pixel. Three would mean sharp replicated the band,
    // which is the stride bug that sheared every mask before.
    expect(mask.data).toHaveLength(640 * 640);
  }, 120_000);

  it('produces a mask with both foreground and background, and soft edges', async () => {
    const image = await fixture();
    if (!image) return;

    const result = await provider.segment({
      data: image,
      mimeType: 'image/jpeg',
      filename: 'portrait-1.jpg',
    });
    const mask = result.mask as { data: Buffer; width: number; height: number };

    let clear = 0;
    let opaque = 0;
    let soft = 0;
    for (const v of mask.data) {
      if (v < 10) clear += 1;
      else if (v > 245) opaque += 1;
      if (v > 32 && v < 224) soft += 1;
    }
    const total = mask.data.length;

    expect(clear / total).toBeGreaterThan(0.1);
    expect(opaque / total).toBeGreaterThan(0.1);
    // Some transition band must survive; a fully binary mask means the soft
    // alpha has been thresholded away somewhere.
    expect(soft).toBeGreaterThan(0);
  }, 120_000);

  it('keeps the full source resolution through the composite', async () => {
    const image = await fixture();
    if (!image) return;

    const source = await sharp(image).metadata();
    const original = await normalizeImage(image, 'image/jpeg', 50);
    const result = await provider.segment({
      data: image,
      mimeType: 'image/jpeg',
      filename: 'portrait-1.jpg',
    });

    const composited = await compositeMask(original, result.mask as never);

    // The model ran at 640x640; the output must still be the source geometry.
    expect(composited.width).toBe(source.width);
    expect(composited.height).toBe(source.height);
    expect(composited.rgba).toHaveLength((source.width as number) * (source.height as number) * 4);
    expect(composited.backgroundRatio).toBeGreaterThan(0);
    expect(composited.backgroundRatio).toBeLessThan(1);
  }, 120_000);

  it('scales a 640 mask up to a large frame with exact byte length', async () => {
    const image = await fixture();
    if (!image) return;

    const result = await provider.segment({
      data: image,
      mimeType: 'image/jpeg',
      filename: 'portrait-1.jpg',
    });
    const mask = result.mask as { data: Buffer; width: number; height: number };

    const scaled = await resizeMask(mask, 3000, 2000);
    expect(scaled).toHaveLength(3000 * 2000);
    // Alpha is a byte; anything outside 0..255 means a type has gone wrong.
    expect(Math.min(...scaled.subarray(0, 5000))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...scaled.subarray(0, 5000))).toBeLessThanOrEqual(255);
  }, 120_000);

  it('reuses one session across repeated inferences and stays deterministic', async () => {
    const image = await fixture();
    if (!image) return;

    const input = { data: image, mimeType: 'image/jpeg', filename: 'portrait-1.jpg' };
    const first = await provider.segment(input);
    const second = await provider.segment(input);
    const third = await provider.segment(input);

    const a = (first.mask as { data: Buffer }).data;
    const b = (second.mask as { data: Buffer }).data;
    const c = (third.mask as { data: Buffer }).data;

    // Same input, same session, same answer. A difference here would mean
    // state leaking between runs.
    expect(Buffer.compare(a, b)).toBe(0);
    expect(Buffer.compare(b, c)).toBe(0);
  }, 240_000);

  it('keeps concurrent requests isolated from one another', async () => {
    const image = await fixture();
    if (!image) return;

    const solo = await provider.segment({
      data: image,
      mimeType: 'image/jpeg',
      filename: 'portrait-1.jpg',
    });

    // A different image alongside it. If the session shared state between
    // in-flight requests, the shared-input result would drift.
    const other = await sharp(image).rotate(90).jpeg().toBuffer();
    const [together] = await Promise.all([
      provider.segment({ data: image, mimeType: 'image/jpeg', filename: 'a.jpg' }),
      provider.segment({ data: other, mimeType: 'image/jpeg', filename: 'b.jpg' }),
    ]);

    expect(
      Buffer.compare((solo.mask as { data: Buffer }).data, (together.mask as { data: Buffer }).data),
    ).toBe(0);
  }, 240_000);

  it('honours an abort signal instead of running to completion', async () => {
    const image = await fixture();
    if (!image) return;

    const controller = new AbortController();
    controller.abort();

    await expect(
      provider.segment(
        { data: image, mimeType: 'image/jpeg', filename: 'portrait-1.jpg' },
        { signal: controller.signal },
      ),
    ).rejects.toThrow();
  }, 60_000);
});
