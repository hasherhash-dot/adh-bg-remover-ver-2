import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import { backgroundRemovalService } from '@/lib/bg-removal/service';
import { parseImageRequest } from '@/lib/api/form';
import { enforceRateLimit, jsonError, rateLimitHeaders, resolveContext } from '@/lib/api/http';
import { batchRule } from '@/lib/api/rate-limit';
import { assertWithinQuota, recordUsage } from '@/lib/api/usage';
import { InProcessJobRunner } from '@/lib/batch/queue';
import { getPlan } from '@/lib/billing/plans';
import { toPngFilename } from '@/lib/image/detect';
import { AppError, toAppError } from '@/lib/errors';
import type { ProcessedImage } from '@/lib/bg-removal/types';

/**
 * POST /api/batch/remove-background
 *
 * Accepts up to the plan's batch limit in a single multipart request under the
 * `images` field. Returns a ZIP of transparent PNGs by default — base64 in JSON
 * inflates a 20-image batch by a third for no benefit to an API consumer.
 * Pass `response=json` for a manifest with base64 payloads.
 *
 * A partially successful batch still returns 200: per-image outcomes are
 * reported in the manifest (and in `_manifest.json` inside the ZIP) so one bad
 * file does not discard nineteen good results.
 *
 * NOTE ON SCALE: this processes inline and is bounded by `maxDuration`. The
 * work goes through `JobRunner`, so moving to a durable queue means swapping
 * the runner and returning a job id — see src/lib/batch/queue.ts.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface BatchItemResult {
  filename: string;
  status: 'fulfilled' | 'failed';
  width?: number;
  height?: number;
  byteSize?: number;
  processingTimeMs?: number;
  error?: { code: string; message: string };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await resolveContext(request);
    const limit = await enforceRateLimit(request, context, batchRule(), 'batch');

    const parsed = await parseImageRequest(request, { multiple: true });
    const planLimit = getPlan(context.planId).entitlements.maxBatchSize;
    if (parsed.images.length > planLimit) {
      throw new AppError('BATCH_TOO_LARGE', {
        detail: `plan ${context.planId} allows ${planLimit} images per batch`,
      });
    }

    await assertWithinQuota(context.ownerId, context.planId, parsed.images.length);

    const runner = new InProcessJobRunner<(typeof parsed.images)[number], ProcessedImage>(2);
    const jobs = parsed.images.map((input, index) => ({ id: `${index}`, input }));

    const outcomes = await runner.runAll(
      jobs,
      (input) =>
        backgroundRemovalService.removeBackground({
          data: input.data,
          filename: input.filename,
          background: parsed.background,
          format: parsed.format,
          signal: request.signal,
        }),
      { signal: request.signal },
    );

    const results: BatchItemResult[] = [];
    const zip = new JSZip();
    const jsonImages: Array<{ filename: string; data: string; mimeType: string }> = [];
    const usedNames = new Set<string>();
    let succeeded = 0;

    outcomes.forEach((outcome, index) => {
      const source = parsed.images[index];
      if (!source) return;
      const baseName = toPngFilename(source.filename);

      if (outcome.status === 'fulfilled') {
        succeeded += 1;
        const name = uniqueName(baseName, usedNames);
        zip.file(name, outcome.value.data);
        results.push({
          filename: name,
          status: 'fulfilled',
          width: outcome.value.width,
          height: outcome.value.height,
          byteSize: outcome.value.byteSize,
          processingTimeMs: outcome.value.meta.processingTimeMs,
        });
        if (parsed.responseMode === 'json') {
          jsonImages.push({
            filename: name,
            data: outcome.value.data.toString('base64'),
            mimeType: outcome.value.mimeType,
          });
        }
      } else {
        const error = toAppError(outcome.error);
        results.push({
          filename: source.filename,
          status: 'failed',
          error: { code: error.code, message: error.userMessage },
        });
      }
    });

    if (succeeded > 0) {
      // Same rule as the single-image route: a bookkeeping failure must not
      // discard a ZIP the user already waited for.
      try {
        await recordUsage(context.ownerId, { images: succeeded, batches: 1, apiRequests: 1 });
      } catch (error) {
        console.error('[usage] failed to record a batch', error);
      }
    }

    const summary = {
      total: parsed.images.length,
      succeeded,
      failed: parsed.images.length - succeeded,
    };
    const headers = { ...rateLimitHeaders(limit), 'Cache-Control': 'no-store' };

    if (parsed.responseMode === 'json') {
      return NextResponse.json(
        { success: true, summary, results, images: jsonImages },
        { headers },
      );
    }

    zip.file('_manifest.json', JSON.stringify({ summary, results }, null, 2));
    const archive = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      // PNGs are already deflated; a high level costs CPU for almost nothing.
      compressionOptions: { level: 1 },
    });

    return new NextResponse(new Uint8Array(archive), {
      headers: {
        ...headers,
        'Content-Type': 'application/zip',
        'Content-Length': String(archive.length),
        'Content-Disposition': 'attachment; filename="backgrounds-removed.zip"',
        'X-Batch-Total': String(summary.total),
        'X-Batch-Succeeded': String(summary.succeeded),
        'X-Batch-Failed': String(summary.failed),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Two uploads called `photo.jpg` must not overwrite each other in the ZIP. */
function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  let counter = 2;
  let candidate = `${stem}-${counter}${extension}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${stem}-${counter}${extension}`;
  }
  used.add(candidate);
  return candidate;
}
