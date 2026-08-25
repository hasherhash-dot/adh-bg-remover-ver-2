import 'server-only';
import { z } from 'zod';

/**
 * Server-side environment. Importing this module from a client component is a
 * build error thanks to `server-only`, which keeps secrets out of the bundle.
 *
 * Parsing is lazy so that a missing optional variable never breaks `next build`
 * for pages that do not touch the affected subsystem.
 */

const booleanish = z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .pipe(z.boolean());

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  BACKGROUND_REMOVAL_PROVIDER: z
    .enum(['local', 'http', 'replicate', 'mock'])
    .default('local'),
  BACKGROUND_REMOVAL_MODEL: z.enum(['small', 'medium', 'large']).default('medium'),
  BACKGROUND_REMOVAL_INFERENCE_SIZE: z.coerce.number().int().min(256).max(4096).default(1024),
  BACKGROUND_REMOVAL_API_URL: z.string().url().optional(),
  BACKGROUND_REMOVAL_API_KEY: z.string().min(1).optional(),
  REPLICATE_API_TOKEN: z.string().min(1).optional(),
  REPLICATE_MODEL_VERSION: z.string().min(1).optional(),

  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().max(200).default(25),
  MAX_BATCH_SIZE: z.coerce.number().int().positive().max(100).default(20),
  MAX_IMAGE_MEGAPIXELS: z.coerce.number().positive().max(200).default(50),

  RATE_LIMIT_DRIVER: z.enum(['memory', 'none']).default('memory'),
  RATE_LIMIT_REQUESTS_PER_MINUTE: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_BATCH_PER_HOUR: z.coerce.number().int().positive().default(10),

  STORAGE_DRIVER: z.enum(['ephemeral', 'local', 's3', 'r2', 'supabase']).default('ephemeral'),
  STORAGE_TEMP_DIR: z.string().default('.data/tmp'),
  STORAGE_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  PERSISTENCE_DRIVER: z.enum(['file', 'memory', 'postgres']).default('file'),
  DATABASE_URL: z.string().optional(),

  AUTH_DRIVER: z.enum(['anonymous', 'nextauth']).default('anonymous'),
  AUTH_SECRET: z.string().optional(),

  BILLING_DRIVER: z.enum(['disabled', 'stripe']).default('disabled'),
  STRIPE_SECRET_KEY: z.string().optional(),

  DEBUG_BG_REMOVAL: booleanish.optional().default(false),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — forces the next `serverEnv()` call to re-read process.env. */
export function resetServerEnvCache(): void {
  cached = null;
}

export const maxUploadBytes = (): number => serverEnv().MAX_UPLOAD_SIZE_MB * 1024 * 1024;
