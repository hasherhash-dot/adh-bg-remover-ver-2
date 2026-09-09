import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/layout/logo';
import { BRAND, ORGANISATION } from '@/lib/marketing/brand';

/**
 * Two tiers, deliberately.
 *
 * The upper tier is navigation and nothing else. The lower tier carries the
 * things a reader checks when deciding whether to trust the tool — who made it,
 * where they are, and what happens to an uploaded file — plus the link across
 * to the rest of the ADH toolkit.
 *
 * Every href below resolves to a real route. A footer full of links to pages
 * that do not exist is the fastest way to look unfinished.
 */

const SECTIONS = [
  {
    title: 'Product',
    links: [
      { href: '/remove-background', label: 'Background remover' },
      { href: '/tools', label: 'All tools' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/dashboard', label: 'Dashboard' },
    ],
  },
  {
    title: 'Resources & legal',
    links: [
      { href: '/api', label: 'API reference' },
      { href: '/api#extension', label: 'Browser extension' },
      { href: '/resources', label: 'Resources' },
      { href: '/privacy-policy', label: 'Privacy Policy' },
      { href: '/terms', label: 'Terms and Conditions' },
    ],
  },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-line bg-paper-sunken">
      <div className="mx-auto max-w-[92rem] px-5 sm:px-8">
        {/* Tier one — navigation. */}
        <div className="grid gap-9 py-14 sm:grid-cols-2 lg:grid-cols-[1.8fr_repeat(2,1fr)] lg:gap-12">
          <div>
            <Link
              href="/"
              className="-my-2 inline-flex min-h-11 items-center gap-2.5 rounded-xs"
              aria-label={`${BRAND.name} — home`}
            >
              <Logo className="w-[210px]" />
            </Link>
            <p className="mt-3.5 max-w-64 text-sm leading-relaxed text-ink-muted">
              Transparent PNGs at the resolution you uploaded. Free, no account.
            </p>
          </div>

          {SECTIONS.map((section) => (
            <nav key={section.title} aria-label={section.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-subtle">
                {section.title}
              </h3>
              <ul className="mt-2 flex flex-col sm:mt-3.5 sm:gap-1.5">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="-mx-1 inline-flex min-h-9 items-center rounded-xs px-1 text-sm text-ink-muted transition-colors hover:text-ink sm:min-h-0 sm:py-0.5"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Tier two — who made it, and the rest of the toolkit. */}
        <div className="flex flex-col gap-5 border-t border-line py-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="text-xs leading-relaxed text-ink-subtle">
            <p>
              A free tool by{' '}
              <a
                href={ORGANISATION.url}
                rel="noopener"
                className="font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                {ORGANISATION.name}
              </a>
              , {ORGANISATION.address.locality}, {ORGANISATION.address.region}.
            </p>
            <p className="mt-1">
              © {new Date().getFullYear()} {ORGANISATION.name}. Image processing, local history and data handling: see our Privacy Policy.
            </p>
          </div>

          <ul className="flex flex-wrap gap-2">
            {ORGANISATION.siblings.map((sibling) => (
              <li key={sibling.url}>
                <a
                  href={sibling.url}
                  rel="noopener"
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-sm border border-line bg-paper-raised px-3 text-[13px] font-medium text-ink-muted transition-colors hover:border-ink/25 hover:text-ink"
                >
                  {sibling.name}
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
