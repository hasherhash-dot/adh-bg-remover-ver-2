'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import { cn } from '@/lib/utils';

/**
 * Site navigation.
 *
 * Four links and one action. The product itself is the CTA — "Remove
 * background" is reachable from every page rather than buried behind a generic
 * "Get started", because that is the only thing most visitors came to do.
 */

/**
 * Pricing is deliberately absent: nothing is purchasable yet, so a primary nav
 * slot pointing at a page that says 'not available' is a dead end. It stays
 * linked from the footer.
 */
const NAV_LINKS = [
  { href: '/tools', label: 'Tools' },
  { href: '/api', label: 'API' },
  { href: '/resources', label: 'Help' },
] as const;

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock the page behind the mobile sheet, and close it on Escape.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const isStudio = pathname === '/remove-background';

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-colors duration-300',
        scrolled ? 'border-line bg-paper/85 backdrop-blur-md' : 'border-transparent bg-paper',
      )}
    >
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 sm:px-8"
        aria-label="Main"
      >
        <Link
          href="/"
          className="-my-2 flex min-h-11 shrink-0 items-center gap-2.5 rounded-xs"
          aria-label="ADH Background Remover — home"
        >
          <Logo className="size-7" />
          {/* The full product name needs room. On a phone the wordmark plus a
              CTA plus a menu button does not fit, so the descriptor is dropped
              below sm — the page title carries it there instead. */}
          <span className="text-[15px] font-semibold tracking-tight text-ink">
            ADH{' '}
            <span className="hidden font-normal text-ink-muted sm:inline">Background Remover</span>
          </span>
        </Link>

        <ul className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-xs px-3 py-2 text-[13.5px] font-medium transition-colors',
                    active ? 'text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          {/* Hidden on the studio page itself — a CTA to where you already are
              is noise. */}
          {!isStudio && (
            <Button variant="primary" size="sm" asChild>
              <Link href="/remove-background">Remove background</Link>
            </Button>
          )}
        </div>

        {/* Mobile: keep the product action visible, tuck the rest behind a menu. */}
        <div className="flex items-center gap-1.5 md:hidden">
          {!isStudio && (
            <Button variant="primary" size="sm" asChild>
              <Link href="/remove-background">Remove background</Link>
            </Button>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="-mr-2 rounded-xs p-2 text-ink"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="mobile-menu"
          className="fixed inset-x-0 bottom-0 top-16 z-40 overflow-y-auto border-t border-line bg-paper px-5 py-5 md:hidden animate-fade-in"
        >
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="flex items-center justify-between border-b border-line py-4 text-base font-medium text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/dashboard"
                className="flex items-center justify-between border-b border-line py-4 text-base font-medium text-ink"
              >
                Dashboard
              </Link>
            </li>
          </ul>

          <Button variant="accent" size="lg" className="mt-6 w-full" asChild>
            <Link href="/remove-background">Remove a background</Link>
          </Button>
        </div>
      )}
    </header>
  );
}
