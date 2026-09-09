import { InnerCta } from '@/components/marketing/inner-cta';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PLANS, PLAN_LIST } from '@/lib/billing/plans';
import { BRAND } from '@/lib/marketing/brand';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'ADH Background Remover is free to use — 30 images a month at full resolution, no account and no watermark. Paid plans are not available yet.',
  alternates: { canonical: '/pricing' },
};

/**
 * Pricing.
 *
 * There is no checkout. Previously this page rendered Pro and Business as
 * finished products with "Choose Pro" buttons that only produced a toast — the
 * page read as a storefront for something that cannot be bought.
 *
 * It now leads with what is actually available and lists the rest as a roadmap,
 * with no control that looks like a purchase.
 */
export default function PricingPage() {
  const free = PLANS.free;
  const planned = PLAN_LIST.filter((plan) => !plan.available);

  return (
    <SiteShell>
      <div className="inner-page inner-pricing">
        <header className="max-w-2xl">
          <Badge variant="accent" className="mb-5">
            Free while in development
          </Badge>
          <h1 className="font-display text-4xl font-bold tracking-[-0.03em] text-ink sm:text-5xl">
            Free to use
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-muted">
            {BRAND.name} is free, and every capability the tool has is available without paying or
            signing up. There is nothing to buy yet.
          </p>
        </header>

        {/* What you actually get today. */}
        <section className="mt-10 border border-line bg-paper-raised p-6 sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
                {free.name}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">{free.tagline}</p>
            </div>
            <p className="font-display text-4xl font-bold tracking-[-0.03em] text-ink">$0</p>
          </div>

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {free.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-ink">
                <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {feature}
              </li>
            ))}
          </ul>

          <Button variant="accent" size="lg" className="mt-7" asChild>
            <Link href="/remove-background">
              Remove a background
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </section>

        {/* Roadmap, stated as a roadmap. No prices, no buttons. */}
        <section className="mt-12" aria-labelledby="planned">
          <h2
            id="planned"
            className="font-display text-xl font-semibold tracking-tight text-ink"
          >
            Planned later
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Paid tiers are not built. There is no checkout, no billing and no way to subscribe — so
            rather than show prices you cannot act on, here is roughly what they would cover.
          </p>

          <ul className="mt-6 divide-y divide-line border-y border-line">
            {planned.map((plan) => (
              <li key={plan.id} className="flex flex-wrap items-start gap-x-6 gap-y-2 py-5">
                <div className="min-w-32">
                  <p className="font-display text-[15px] font-semibold text-ink">{plan.name}</p>
                  <Badge variant="neutral" size="sm" className="mt-1.5">
                    Not available
                  </Badge>
                </div>
                <p className="flex-1 text-sm leading-relaxed text-ink-muted">
                  {plan.tagline.replace(/^Planned\.\s*/, '')} {plan.features.join(' · ')}.
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12 border border-line bg-paper-sunken p-6">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            Questions
          </h2>
          <dl className="mt-4 flex flex-col gap-5">
            {[
              {
                q: 'Is there a catch?',
                a: 'No. The tool runs an open segmentation model on our own hardware, so the cost to us is compute rather than a per-image licence fee. That is why the free tier can return full-resolution files.',
              },
              {
                q: 'What counts towards the monthly limit?',
                a: 'One successful conversion. Failed uploads and rejected files are not counted — you are only charged against the limit for work that produced a result.',
              },
              {
                q: 'Will it stay free?',
                a: 'The free tier is the product right now. If paid tiers arrive they will add headroom and API access rather than take away what is currently free.',
              },
            ].map((item) => (
              <div key={item.q}>
                <dt className="text-sm font-medium text-ink">{item.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink-muted">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
        <InnerCta/>
      </div>
    </SiteShell>
  );
}
