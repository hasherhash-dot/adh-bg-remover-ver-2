/**
 * Plan catalogue and entitlements.
 *
 * TRUTH RULE: every field in `PlanEntitlements` must be enforced somewhere in
 * the codebase. A declared limit that nothing checks is worse than no limit —
 * it makes the plan data lie about the product, and sooner or later someone
 * writes marketing copy from it.
 *
 * An audit found three fields that were declared but inert: `maxOutputDimension`
 * (2000px, while the product has always returned full resolution),
 * `maxUploadMb` (10, while the real limit is the 25MB server setting) and
 * `priorityQueue` (nothing prioritises anything). They have been corrected to
 * match real behaviour or removed, rather than switched on — the current
 * behaviour is the intended product.
 *
 * Billing is NOT implemented. `./stripe.ts` throws, has no callers, and no
 * surface in the app offers a purchase. Pro and Business are kept here as the
 * shape a future paid tier would take, and every UI that renders them must say
 * they are unavailable.
 */

export type PlanId = 'free' | 'pro' | 'business';

export interface PlanEntitlements {
  /** Images per calendar month. Enforced in `api/usage.ts`. */
  monthlyImages: number;
  /** Largest accepted upload, in MB. Mirrors MAX_UPLOAD_SIZE_MB. */
  maxUploadMb: number;
  /** Images per batch request. Enforced in the batch route. */
  maxBatchSize: number;
  /** Enforced in `api/http.ts` and the API-keys route. */
  apiAccess: boolean;
}

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in the smallest currency unit. 0 = free. */
  priceCents: number;
  currency: 'usd';
  tagline: string;
  features: string[];
  entitlements: PlanEntitlements;
  /**
   * False until checkout exists. Anything rendering a plan must check this
   * before showing something that looks buyable.
   */
  available: boolean;
  highlighted?: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    currency: 'usd',
    tagline: 'Everything the tool can currently do.',
    features: [
      '30 images per month',
      'Full original resolution — no downscaling',
      'Transparent PNG with no watermark',
      'Background replacement and the built-in editor',
      'Batch processing with ZIP download',
      'No account required',
    ],
    entitlements: {
      monthlyImages: 30,
      // Matches MAX_UPLOAD_SIZE_MB, which is what the server actually enforces.
      maxUploadMb: 25,
      // Matches MAX_BATCH_SIZE and the client-side queue cap.
      maxBatchSize: 20,
      apiAccess: false,
    },
    available: true,
    highlighted: true,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 1200,
    currency: 'usd',
    tagline: 'Planned. Higher monthly volume for regular use.',
    features: ['Higher monthly limit', 'Larger uploads', 'Larger batches'],
    entitlements: {
      monthlyImages: 1_000,
      maxUploadMb: 50,
      maxBatchSize: 50,
      apiAccess: false,
    },
    available: false,
  },
  business: {
    id: 'business',
    name: 'Business',
    priceCents: 4900,
    currency: 'usd',
    tagline: 'Planned. API access for automated pipelines.',
    features: ['Highest monthly limit', 'API access with keys', 'Team seats'],
    entitlements: {
      monthlyImages: 10_000,
      maxUploadMb: 50,
      maxBatchSize: 50,
      apiAccess: true,
    },
    available: false,
  },
};

export const PLAN_LIST: Plan[] = [PLANS.free, PLANS.pro, PLANS.business];

/** Only plans a user can actually be on today. */
export const AVAILABLE_PLANS: Plan[] = PLAN_LIST.filter((plan) => plan.available);

export const DEFAULT_PLAN: PlanId = 'free';

export function getPlan(id: PlanId | string | undefined): Plan {
  if (id && id in PLANS) return PLANS[id as PlanId];
  return PLANS[DEFAULT_PLAN];
}

export function formatPrice(plan: Plan): string {
  if (plan.priceCents === 0) return 'Free';
  return `$${(plan.priceCents / 100).toFixed(0)}`;
}
