import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AVAILABLE_PLANS, PLANS, PLAN_LIST } from '@/lib/billing/plans';
import { UPLOAD_LIMITS } from '@/lib/config/public';
import { PRODUCT_FACTS } from '@/lib/marketing/brand';
import { FAQ } from '@/lib/marketing/homepage-content';

/**
 * Product-truth guards.
 *
 * An audit found the plan catalogue describing a product that did not exist:
 * a 2000px output cap that was never applied, a 10MB upload limit while the
 * server accepted 25MB, a 5-image batch limit the web app ignored, and a
 * priority queue with no implementation. None of it was enforced, so the data
 * was simply wrong — and marketing copy gets written from data like that.
 *
 * These tests fail when the numbers we publish stop matching the numbers the
 * product uses.
 */

describe('plan entitlements match real behaviour', () => {
  const free = PLANS.free;

  it('states the same upload limit the server enforces', () => {
    const serverLimitMb = UPLOAD_LIMITS.maxFileSizeBytes / (1024 * 1024);
    expect(free.entitlements.maxUploadMb).toBe(serverLimitMb);
  });

  it('states the same batch size the client queue enforces', () => {
    expect(free.entitlements.maxBatchSize).toBe(UPLOAD_LIMITS.maxBatchFiles);
  });

  it('declares no output-resolution cap', () => {
    // Full-resolution output is the product's headline claim. A cap here would
    // either be a lie or, if wired up, would break the claim.
    expect(free.entitlements).not.toHaveProperty('maxOutputDimension');
  });

  it('declares no entitlement that nothing implements', () => {
    // Every key must be enforced somewhere. `priorityQueue` was removed because
    // no scheduler exists.
    expect(Object.keys(free.entitlements).sort()).toEqual([
      'apiAccess',
      'maxBatchSize',
      'maxUploadMb',
      'monthlyImages',
    ]);
  });

  it('agrees with the marketing facts used in copy and schema', () => {
    expect(PRODUCT_FACTS.maxUploadMb).toBe(free.entitlements.maxUploadMb);
    expect(PRODUCT_FACTS.freeImagesPerMonth).toBe(free.entitlements.monthlyImages);
    expect(PRODUCT_FACTS.maxBatchSize).toBe(free.entitlements.maxBatchSize);
  });
});

describe('nothing is presented as purchasable', () => {
  it('marks only the free plan as available', () => {
    expect(AVAILABLE_PLANS.map((plan) => plan.id)).toEqual(['free']);
  });

  it('flags every paid plan as unavailable while there is no checkout', () => {
    for (const plan of PLAN_LIST) {
      if (plan.priceCents > 0) {
        expect(plan.available, `${plan.name} must not be marked available`).toBe(false);
      }
    }
  });

  it('has no checkout call site anywhere in the app', () => {
    // stripe.ts exists as a boundary for later. If something ever imports it,
    // this test forces a deliberate decision rather than a silent dead button.
    const sources = ['src/app', 'src/components'];
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    let hits = '';
    try {
      hits = execSync(
        `grep -rl "createCheckoutSession\\|createBillingPortalSession" ${sources.join(' ')} || true`,
        { encoding: 'utf8' },
      );
    } catch {
      hits = '';
    }
    expect(hits.trim()).toBe('');
  });

  it('offers no purchase control on the pricing page', () => {
    // Strip comments and prose first: the page legitimately *discusses* the
    // absence of checkout. What must not exist is a control labelled as though
    // it starts one, so only JSX element text is examined.
    const source = readFileSync('src/app/pricing/page.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

    const elementText = [...source.matchAll(/>\s*([A-Za-z][^<>{}]{2,40}?)\s*</g)].map((m) =>
      m[1]!.trim(),
    );

    const purchaseLabel = /^(choose|subscribe|buy|upgrade|get)\b/i;
    const offenders = elementText.filter((text) => purchaseLabel.test(text));

    expect(offenders, `purchase-style labels found: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('homepage copy stays honest', () => {
  const page = readFileSync('src/app/page.tsx', 'utf8');
  const content = readFileSync('src/lib/marketing/homepage-content.ts', 'utf8');

  it('does not sell the API or API keys, which users cannot reach', () => {
    expect(page).not.toMatch(/API keys/i);
  });

  it('keeps the FAQ to a useful size rather than padding it for schema', () => {
    expect(FAQ.length).toBeGreaterThanOrEqual(6);
    expect(FAQ.length).toBeLessThanOrEqual(8);
  });

  it('does not lean on "AI-powered" as a selling phrase', () => {
    expect(page).not.toMatch(/AI[- ]powered/i);
    expect(content).not.toMatch(/AI[- ]powered/i);
  });

  it('qualifies the storage claim rather than promising absolutes', () => {
    // "never stored" is stronger than the architecture guarantees once a
    // durable STORAGE_DRIVER is switched on.
    expect(content).toMatch(/discarded|not written to disk|held in memory/i);
  });
});
