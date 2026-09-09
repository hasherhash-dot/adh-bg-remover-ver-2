import { cn } from '@/lib/utils';

/** The supplied ADH wordmark, preserved as an SVG at its original proportions. */
export function Logo({ className }: { className?: string }) {
  return <img src="/adh-logo.svg" alt="American Design Hub — BG Remover" width={497.2} height={144.1} className={cn('h-auto shrink-0', className)} />;
}
