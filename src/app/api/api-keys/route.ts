import { NextResponse } from 'next/server';
import { z } from 'zod';
import { jsonError, resolveContext } from '@/lib/api/http';
import { createApiKey, listApiKeys } from '@/lib/auth/api-keys';
import { getPlan } from '@/lib/billing/plans';
import { AppError } from '@/lib/errors';

/**
 * GET  /api/api-keys - list this owner's keys (never includes the secret)
 * POST /api/api-keys - mint a key; the plaintext is returned exactly once
 *
 * Keys may only be managed from a browser session. Allowing an API key to mint
 * further keys would turn a single leaked credential into permanent access.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name: z.string().trim().min(1).max(64).default('Untitled key'),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveContext(request);
    const keys = await listApiKeys(context.ownerId);
    return NextResponse.json({ success: true, keys });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await resolveContext(request);
    if (context.via === 'api-key') {
      throw new AppError('UNAUTHORIZED', { detail: 'API keys cannot mint other API keys' });
    }

    const plan = getPlan(context.planId);
    if (!plan.entitlements.apiAccess) {
      throw new AppError('UNAUTHORIZED', {
        detail: `plan ${plan.id} does not include API access`,
      });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError('INVALID_FILE_TYPE', { detail: 'invalid key name' });
    }

    const { key, summary } = await createApiKey({
      ownerId: context.ownerId,
      name: parsed.data.name,
      planId: context.planId,
    });

    return NextResponse.json(
      {
        success: true,
        // Shown once. Never retrievable again — only the digest is stored.
        key,
        summary,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
