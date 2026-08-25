import { NextResponse } from 'next/server';
import { backgroundRemovalService } from '@/lib/bg-removal/service';
import { parseImageRequest } from '@/lib/api/form';
import {
  enforceRateLimit,
  jsonError,
  rateLimitHeaders,
  resolveContext,
} from '@/lib/api/http';
import { singleImageRule } from '@/lib/api/rate-limit';
import { assertWithinQuota, recordUsage } from '@/lib/api/usage';
import { appendHistory } from '@/lib/history/server-history';
import { persistResult } from '@/lib/storage';
import { toPngFilename } from '@/lib/image/detect';
import { AppError } from '@/lib/errors';

/**
 * POST /api/remove-background
 *
 * multipart/form-data:
 *   image            (required) the source file
 *   background       transparent | color | image      default: transparent
 *   backgroundColor  hex, when background=color
 *   backgroundImage  file, when background=image
 *   format           png | jpeg | webp                default: png
 *   response         binary | json                    default: binary
 *
 * Returns the processed image as a binary body with metadata in X- headers, or
 * a JSON envelope with base64 data when response=json.
 */

// Inference is CPU-bound native code: this route cannot run on the edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await resolveContext(request);
    const limit = await enforceRateLimit(request, context, singleImageRule(), 'single');
    await assertWithinQuota(context.ownerId, context.planId, 1);

    const parsed = await parseImageRequest(request);
    const image = parsed.images[0];
    if (!image) throw new AppError('NO_FILE_PROVIDED');

    const result = await backgroundRemovalService.removeBackground({
      data: image.data,
      filename: image.filename,
      background: parsed.background,
      format: parsed.format,
      signal: request.signal,
    });

    // Accounting must never destroy finished work. The image is already
    // processed at this point; if the usage counter or the history entry cannot
    // be written, that is our problem to log, not a reason to throw away the
    // user's result. This previously turned a transient file-rename failure on
    // Windows into a 500 for an image that had converted perfectly.
    await recordAccounting(context.ownerId, {
      filename: image.filename,
      width: result.width,
      height: result.height,
      byteSize: result.byteSize,
      processingTimeMs: result.meta.processingTimeMs,
    });

    // No-op unless a durable STORAGE_DRIVER is configured; images are
    // ephemeral by default and this must never fail a successful conversion.
    await persistResult(`${crypto.randomUUID()}.png`, result.data, result.mimeType);

    const downloadName = toPngFilename(image.filename);
    const metaHeaders: Record<string, string> = {
      ...rateLimitHeaders(limit),
      'X-Image-Width': String(result.width),
      'X-Image-Height': String(result.height),
      'X-Image-Bytes': String(result.byteSize),
      'X-Processing-Time-Ms': String(result.meta.processingTimeMs),
      'X-Inference-Time-Ms': String(result.meta.inferenceTimeMs),
      'X-Provider': result.meta.providerId,
      'X-Source-Width': String(result.meta.source.width),
      'X-Source-Height': String(result.meta.source.height),
      // Lets the browser read the metadata from a cross-origin fetch.
      'Access-Control-Expose-Headers': [
        'X-Image-Width',
        'X-Image-Height',
        'X-Image-Bytes',
        'X-Processing-Time-Ms',
        'X-Inference-Time-Ms',
        'X-Provider',
        'X-Source-Width',
        'X-Source-Height',
        'Content-Disposition',
      ].join(', '),
    };

    if (parsed.responseMode === 'json') {
      return NextResponse.json(
        {
          success: true,
          image: {
            data: result.data.toString('base64'),
            mimeType: result.mimeType,
            filename: downloadName,
          },
          metadata: {
            width: result.width,
            height: result.height,
            byteSize: result.byteSize,
            ...result.meta,
          },
        },
        { headers: metaHeaders },
      );
    }

    return new NextResponse(new Uint8Array(result.data), {
      status: 200,
      headers: {
        ...metaHeaders,
        'Content-Type': result.mimeType,
        'Content-Length': String(result.byteSize),
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}


/**
 * Records usage and history without letting either fail the request.
 *
 * Quota still works: the counter is checked before processing, so a write that
 * fails here means one image may not be counted — a far better outcome than
 * discarding an image the user already waited for.
 */
async function recordAccounting(
  ownerId: string,
  entry: {
    filename: string;
    width: number;
    height: number;
    byteSize: number;
    processingTimeMs: number;
  },
): Promise<void> {
  try {
    await recordUsage(ownerId, { images: 1, apiRequests: 1 });
  } catch (error) {
    console.error('[usage] failed to record a processed image', error);
  }
  try {
    await appendHistory(ownerId, entry);
  } catch (error) {
    console.error('[history] failed to record a processed image', error);
  }
}

export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Use POST with multipart/form-data. See /api for documentation.',
        retryable: false,
      },
    },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
