import { NextResponse } from 'next/server';
import { jsonError, resolveContext } from '@/lib/api/http';
import { clearHistory, listHistory } from '@/lib/history/server-history';

/**
 * GET    /api/history  - metadata for recently processed images
 * DELETE /api/history  - erase this owner's server-side records
 *
 * Metadata only. Image bytes are never persisted server-side; the visual
 * history with thumbnails lives in the browser (see src/lib/history/local).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveContext(request);
    const url = new URL(request.url);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50)));
    const entries = await listHistory(context.ownerId, limit);
    return NextResponse.json({ success: true, entries, count: entries.length });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const context = await resolveContext(request);
    await clearHistory(context.ownerId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
