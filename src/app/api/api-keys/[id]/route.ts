import { NextResponse } from 'next/server';
import { jsonError, resolveContext } from '@/lib/api/http';
import { revokeApiKey } from '@/lib/auth/api-keys';
import { AppError } from '@/lib/errors';

/** DELETE /api/api-keys/:id — revoke a key. Revocation is immediate. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const context = await resolveContext(request);
    if (context.via === 'api-key') {
      throw new AppError('UNAUTHORIZED', { detail: 'API keys cannot revoke keys' });
    }

    const { id } = await params;
    const revoked = await revokeApiKey(context.ownerId, id);
    if (!revoked) throw new AppError('NOT_FOUND', { detail: 'key not found for this owner' });

    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error);
  }
}
