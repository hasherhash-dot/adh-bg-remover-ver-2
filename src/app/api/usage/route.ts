import { NextResponse } from 'next/server';
import { jsonError, resolveContext } from '@/lib/api/http';
import { getUsage } from '@/lib/api/usage';
import { getPlan } from '@/lib/billing/plans';

/** GET /api/usage — current period consumption and plan entitlements. */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await resolveContext(request);
    const usage = await getUsage(context.ownerId, context.planId);
    const plan = getPlan(context.planId);

    return NextResponse.json({
      success: true,
      usage: {
        period: usage.period,
        imagesProcessed: usage.imagesProcessed,
        batchesProcessed: usage.batchesProcessed,
        apiRequests: usage.apiRequests,
        monthlyLimit: usage.monthlyLimit,
        remaining: usage.remaining,
      },
      plan: {
        id: plan.id,
        name: plan.name,
        entitlements: plan.entitlements,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
