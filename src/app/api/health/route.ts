import { NextResponse } from 'next/server';
import { backgroundRemovalService } from '@/lib/bg-removal/service';
import { serverEnv } from '@/lib/config/env';

/**
 * GET /api/health - readiness probe.
 *
 * Reports whether the configured engine can be loaded. Deliberately exposes no
 * configuration values beyond the provider id.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  try {
    const health = await backgroundRemovalService.health();
    return NextResponse.json(
      {
        success: health.ok,
        status: health.ok ? 'ready' : 'degraded',
        provider: health.provider,
        detail: health.detail,
        maxUploadMb: serverEnv().MAX_UPLOAD_SIZE_MB,
        maxBatchSize: serverEnv().MAX_BATCH_SIZE,
      },
      { status: health.ok ? 200 : 503 },
    );
  } catch (error) {
    console.error('[health]', error);
    return NextResponse.json({ success: false, status: 'error' }, { status: 503 });
  }
}
