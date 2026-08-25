import 'server-only';
import { AppError } from '@/lib/errors';
import { serverEnv } from '@/lib/config/env';
import type { PlanId } from './plans';

/**
 * Payment integration boundary.
 *
 * NOTHING here charges anyone. Stripe is not wired up, and rather than fake a
 * checkout flow that appears to work, every entry point throws a clear
 * NOT_IMPLEMENTED error until the environment is configured.
 *
 * To enable payments:
 *   1. `npm install stripe`
 *   2. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and BILLING_DRIVER=stripe
 *   3. Replace the bodies below with real Stripe calls
 *   4. Add price IDs to the plan catalogue and map them here
 *
 * The rest of the application only ever calls these three functions, so the
 * blast radius of enabling billing is this file plus the webhook route.
 */

export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export function isBillingEnabled(): boolean {
  return serverEnv().BILLING_DRIVER === 'stripe' && Boolean(serverEnv().STRIPE_SECRET_KEY);
}

export async function createCheckoutSession(_params: {
  planId: PlanId;
  ownerId: string;
  returnUrl: string;
}): Promise<CheckoutSession> {
  if (!isBillingEnabled()) {
    throw new AppError('NOT_IMPLEMENTED', {
      detail:
        'Stripe is not configured. Set BILLING_DRIVER=stripe and STRIPE_SECRET_KEY to enable checkout.',
    });
  }
  throw new AppError('NOT_IMPLEMENTED', {
    detail: 'createCheckoutSession has no Stripe implementation yet.',
  });
}

export async function createBillingPortalSession(_ownerId: string): Promise<{ url: string }> {
  throw new AppError('NOT_IMPLEMENTED', {
    detail: 'Billing portal requires a configured Stripe account.',
  });
}

export async function handleWebhook(_payload: string, _signature: string): Promise<void> {
  throw new AppError('NOT_IMPLEMENTED', { detail: 'Stripe webhooks are not configured.' });
}
