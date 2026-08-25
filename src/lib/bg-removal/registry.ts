import 'server-only';
import { AppError } from '@/lib/errors';
import { serverEnv } from '@/lib/config/env';
import type { BackgroundRemovalProvider } from './types';
import { LocalOnnxProvider } from './providers/local-onnx';
import { HttpProvider } from './providers/http';
import { ReplicateProvider } from './providers/replicate';
import { MockProvider } from './providers/mock';

/**
 * Resolves the configured provider.
 *
 * This is the only place in the codebase that knows which engines exist. Adding
 * a new one means writing a class that implements BackgroundRemovalProvider and
 * adding a case here — no UI, API or service change required.
 */

export type ProviderId = 'local' | 'http' | 'replicate' | 'mock';

type ProviderFactory = () => BackgroundRemovalProvider;

const factories: Record<ProviderId, ProviderFactory> = {
  local: () => {
    const env = serverEnv();
    return new LocalOnnxProvider({
      model: env.BACKGROUND_REMOVAL_MODEL,
      debug: env.DEBUG_BG_REMOVAL,
    });
  },
  http: () => {
    const env = serverEnv();
    if (!env.BACKGROUND_REMOVAL_API_URL) {
      throw new AppError('PROVIDER_MISCONFIGURED', {
        detail: 'BACKGROUND_REMOVAL_API_URL is not set',
      });
    }
    return new HttpProvider({
      endpoint: env.BACKGROUND_REMOVAL_API_URL,
      apiKey: env.BACKGROUND_REMOVAL_API_KEY,
    });
  },
  replicate: () => {
    const env = serverEnv();
    if (!env.REPLICATE_API_TOKEN || !env.REPLICATE_MODEL_VERSION) {
      throw new AppError('PROVIDER_MISCONFIGURED', {
        detail: 'REPLICATE_API_TOKEN and REPLICATE_MODEL_VERSION are not set',
      });
    }
    return new ReplicateProvider({
      apiToken: env.REPLICATE_API_TOKEN,
      modelVersion: env.REPLICATE_MODEL_VERSION,
    });
  },
  mock: () => new MockProvider(),
};

let instance: BackgroundRemovalProvider | null = null;
let instanceId: ProviderId | null = null;

/** Returns the process-wide provider singleton, constructing it on first use. */
export function resolveProvider(override?: ProviderId): BackgroundRemovalProvider {
  const id = override ?? (serverEnv().BACKGROUND_REMOVAL_PROVIDER as ProviderId);
  if (instance && instanceId === id) return instance;

  const factory = factories[id];
  if (!factory) {
    throw new AppError('PROVIDER_MISCONFIGURED', { detail: `unknown provider "${id}"` });
  }
  instance = factory();
  instanceId = id;
  return instance;
}

/** Test helper — drops the memoised provider. */
export function resetProvider(): void {
  instance = null;
  instanceId = null;
}
