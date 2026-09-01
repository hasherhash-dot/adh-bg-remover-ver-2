'use client';

import { useInView } from '@/hooks/use-in-view';
import { cn } from '@/lib/utils';

/**
 * Scroll reveal for the marketing page.
 *
 * This file used to hold hand-built replicas of the editor, the batch queue and
 * the background picker, and then, briefly, the homepage mounted the real
 * components instead. Both approaches were wrong for a landing page: a replica
 * drifts from the product, and the real thing turns the page into an
 * application dashboard.
 *
 * What is left is the one piece with no product equivalent. The viewport maths
 * moved to `useInView`, which the homepage's demonstrations share.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn('reveal', inView && 'reveal-in', className)}
    >
      {children}
    </div>
  );
}
