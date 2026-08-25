'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, KeyRound, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: LayoutGrid },
  { href: '/dashboard/history', label: 'History', icon: Clock },
  { href: '/dashboard/api-keys', label: 'API keys', icon: KeyRound },
] as const;

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard">
      <ul className="flex gap-1 overflow-x-auto scrollbar-slim lg:flex-col lg:overflow-visible">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-paper-sunken text-ink'
                    : 'text-ink-muted hover:bg-paper-sunken/60 hover:text-ink',
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
