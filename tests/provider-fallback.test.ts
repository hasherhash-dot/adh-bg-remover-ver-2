import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FallbackProvider, withFallback } from '@/lib/bg-removal/providers/with-fallback';
import { resolveProvider, resetProvider } from '@/lib/bg-removal/registry';
import { resetServerEnvCache } from '@/lib/config/env';
import { AppError } from '@/lib/errors';
import type { BackgroundRemovalProvider, SegmentationResult } from '@/lib/bg-removal/types';

/**
 * Provider selection and the standby engine.
 *
 * The property under test is attribution. A fallback that engages invisibly
 * would make an A/B comparison compare one engine against itself on exactly the
 * images where the two differ most, so every assertion here is ultimately about
 * whether the caller is told the truth about which engine ran.
 */

function stubProvider(
  id: string,
  behaviour: 'ok' | 'unavailable' | 'processing-error' = 'ok',
): BackgroundRemovalProvider & { calls: number } {
  const provider = {
    id,
    name: `stub ${id}`,
    isLocal: true,
    calls: 0,
    async segment(): Promise<SegmentationResult> {
      provider.calls += 1;
      if (behaviour === 'unavailable') {
        throw new AppError('PROVIDER_MISCONFIGURED', { detail: `${id} has no model` });
      }
      if (behaviour === 'processing-error') {
        throw new AppError('PROCESSING_FAILED', { detail: `${id} could not handle this image` });
      }
      return { mask: { data: Buffer.alloc(4, 200), width: 2, height: 2 } };
    },
    async healthCheck() {
      return behaviour === 'unavailable'
        ? { ok: false, detail: `${id} has no model` }
        : { ok: true, detail: `${id} ready` };
    },
  };
  return provider;
}

const IMAGE = { data: Buffer.alloc(8), mimeType: 'image/png', filename: 'x.png' };

describe('withFallback', () => {
  it('adds no wrapper at all when no standby is configured', () => {
    const primary = stubProvider('adh-onnx');
    expect(withFallback(primary, null)).toBe(primary);
  });

  it('refuses a standby that is the same engine as the primary', () => {
    expect(() => withFallback(stubProvider('adh-onnx'), stubProvider('adh-onnx'))).toThrow(AppError);
  });

  it('uses the primary and never touches the standby while the primary works', async () => {
    const primary = stubProvider('adh-onnx');
    const standby = stubProvider('local-onnx');
    const provider = withFallback(primary, standby);

    await provider.segment(IMAGE);

    expect(provider.id).toBe('adh-onnx');
    expect(primary.calls).toBe(1);
    expect(standby.calls).toBe(0);
  });
});

describe('FallbackProvider — when the primary cannot start', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('serves from the standby and reports the standby as the engine', async () => {
    const primary = stubProvider('adh-onnx', 'unavailable');
    const standby = stubProvider('local-onnx');
    const provider = withFallback(primary, standby);

    const result = await provider.segment(IMAGE);

    expect(result.mask).toBeDefined();
    expect(standby.calls).toBe(1);
    // The whole point: the caller is told which engine actually ran, so
    // X-Provider, the usage record and the dashboard cannot disagree.
    expect(provider.id).toBe('local-onnx');
  });

  it('says so loudly rather than switching in silence', async () => {
    const provider = withFallback(stubProvider('adh-onnx', 'unavailable'), stubProvider('local-onnx'));
    await provider.segment(IMAGE);

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/unavailable, switching to local-onnx/);
  });

  it('stops retrying the primary once it is known to be unusable', async () => {
    const primary = stubProvider('adh-onnx', 'unavailable');
    const standby = stubProvider('local-onnx');
    const provider = withFallback(primary, standby);

    await provider.segment(IMAGE);
    await provider.segment(IMAGE);
    await provider.segment(IMAGE);

    // A missing model will still be missing on request 400; re-probing would
    // add a failed model load to every request.
    expect(primary.calls).toBe(1);
    expect(standby.calls).toBe(3);
  });

  it('reflects the switch in the health check', async () => {
    const provider = withFallback(stubProvider('adh-onnx', 'unavailable'), stubProvider('local-onnx'));
    const health = await provider.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.detail).toMatch(/adh-onnx unavailable/);
    expect(health.detail).toMatch(/serving from local-onnx/);
  });

  it('reports unhealthy when neither engine can start', async () => {
    const provider = withFallback(
      stubProvider('adh-onnx', 'unavailable'),
      stubProvider('local-onnx', 'unavailable'),
    );
    expect((await provider.healthCheck()).ok).toBe(false);
  });
});

describe('FallbackProvider — when an image fails', () => {
  it('surfaces a processing failure instead of hiding it behind the standby', async () => {
    const primary = stubProvider('adh-onnx', 'processing-error');
    const standby = stubProvider('local-onnx');
    const provider = withFallback(primary, standby);

    // One awkward image is that image's problem. Retrying it elsewhere would
    // mask a genuine defect behind a second opinion and quietly change which
    // engine the result came from.
    await expect(provider.segment(IMAGE)).rejects.toThrow(AppError);
    expect(standby.calls).toBe(0);
    expect(provider.id).toBe('adh-onnx');
  });
});

describe('configured default', () => {
  const provider = process.env.BACKGROUND_REMOVAL_PROVIDER;
  const fallback = process.env.BACKGROUND_REMOVAL_FALLBACK;

  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };

  beforeEach(() => {
    delete process.env.BACKGROUND_REMOVAL_PROVIDER;
    delete process.env.BACKGROUND_REMOVAL_FALLBACK;
    resetProvider();
    resetServerEnvCache();
  });

  afterEach(() => {
    restore('BACKGROUND_REMOVAL_PROVIDER', provider);
    restore('BACKGROUND_REMOVAL_FALLBACK', fallback);
    resetProvider();
    resetServerEnvCache();
  });

  it('defaults to the ADH engine', () => {
    expect(resolveProvider().id).toBe('adh-onnx');
  });

  it('keeps IMG.LY reachable by configuration', () => {
    process.env.BACKGROUND_REMOVAL_PROVIDER = 'local';
    resetServerEnvCache();
    expect(resolveProvider().id).toBe('local-onnx');
  });

  it('adds no standby unless one is asked for', async () => {
    const resolved = resolveProvider();
    expect(resolved).not.toBeInstanceOf(FallbackProvider);
  });

  it('wires a standby when the environment names one', () => {
    process.env.BACKGROUND_REMOVAL_FALLBACK = 'mock';
    resetServerEnvCache();
    resetProvider();

    const resolved = resolveProvider();
    expect(resolved).toBeInstanceOf(FallbackProvider);
    // Still reports the primary, because the primary has not failed.
    expect(resolved.id).toBe('adh-onnx');
  });

  it('gives an explicit override the exact engine asked for, standby or not', () => {
    process.env.BACKGROUND_REMOVAL_FALLBACK = 'mock';
    resetServerEnvCache();
    resetProvider();

    // A/B tooling and the health check name an engine and must get that engine
    // unwrapped, or a result cannot be attributed to it.
    expect(resolveProvider('local').id).toBe('local-onnx');
    expect(resolveProvider('adh-onnx').id).toBe('adh-onnx');
    expect(resolveProvider('local')).not.toBeInstanceOf(FallbackProvider);
  });
});
