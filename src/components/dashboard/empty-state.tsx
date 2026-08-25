import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-16 text-center">
      <span className="flex size-11 items-center justify-center rounded-sm border border-line bg-paper-sunken text-ink-muted">
        {icon}
      </span>
      <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>
      {action && (
        <Button variant="outline" size="sm" className="mt-2" asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
