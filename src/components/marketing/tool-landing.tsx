import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { BackgroundRemoverStudio } from '@/components/studio/background-remover-studio';

/**
 * Shared layout for the format- and use-case-specific landing pages.
 *
 * Each page gets genuinely distinct copy and its own FAQ — the same tool, with
 * guidance written for the person who searched for that particular thing. The
 * uploader is the real studio, so these pages are usable, not doorways.
 */

export interface ToolLandingProps {
  eyebrow: string;
  title: string;
  intro: string;
  /** Three to four short points specific to this use case. */
  points: Array<{ title: string; body: string }>;
  faq: Array<{ question: string; answer: string }>;
  related?: Array<{ href: string; label: string }>;
}

export function ToolLanding({ eyebrow, title, intro, points, faq, related }: ToolLandingProps) {
  return (
    <SiteShell>
      {/* FAQ structured data helps this page earn a rich result honestly. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faq.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: { '@type': 'Answer', text: item.answer },
            })),
          }),
        }}
      />

      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="mx-auto max-w-2xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            {eyebrow}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">{intro}</p>
        </header>

        <div className="mt-10">
          <BackgroundRemoverStudio />
        </div>

        <section className="mt-20 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {points.map((point) => (
            <div key={point.title}>
              <h2 className="text-[15px] font-semibold tracking-tight text-ink">{point.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{point.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-20">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
            Common questions
          </h2>
          <dl className="mt-6 divide-y divide-line border-y border-line">
            {faq.map((item) => (
              <div key={item.question} className="py-5">
                <dt className="text-[15px] font-medium text-ink">{item.question}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-ink-muted">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {related && related.length > 0 && (
          <section className="mt-14">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
              Related
            </h2>
            <ul className="mt-4 flex flex-wrap gap-2">
              {related.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-paper-raised px-3.5 py-2 text-sm text-ink-muted transition-colors hover:border-ink/30 hover:text-ink"
                  >
                    {link.label}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </SiteShell>
  );
}
