import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * FAQ built on native <details>/<summary>.
 *
 * Keyboard support, screen-reader semantics and open/close state come free from
 * the browser, and it costs nothing at runtime — no accordion library, no state,
 * no hydration. Also readable with JavaScript disabled, which matters for a
 * page search engines will index.
 *
 * Each row is its own card rather than a hairline in a stack: it gives the
 * summary a hit area you can see, and an open answer reads as attached to its
 * question instead of floating between two rules.
 */

export interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <dl className={cn('flex flex-col gap-2.5', className)}>
      {items.map((item) => (
        <details
          key={item.question}
          className="group overflow-hidden rounded-md border border-line bg-paper-raised transition-colors duration-150 hover:border-line-strong open:border-line-strong open:shadow-subtle"
        >
          <summary className="flex cursor-pointer list-none items-start justify-between gap-5 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
            <dt className="text-[15px] font-medium leading-snug text-ink">{item.question}</dt>
            <span
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-xs border border-line text-ink-subtle transition-transform duration-200 group-open:rotate-45 group-open:border-accent group-open:text-accent"
              aria-hidden
            >
              <Plus className="size-3.5" />
            </span>
          </summary>
          <dd className="border-t border-line px-4 pb-4 pt-3.5 text-sm leading-relaxed text-ink-muted sm:px-5">
            {item.answer}
          </dd>
        </details>
      ))}
    </dl>
  );
}
