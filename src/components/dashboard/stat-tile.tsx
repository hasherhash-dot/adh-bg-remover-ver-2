import { cn } from '@/lib/utils';

export function StatTile({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-line bg-paper-raised p-5', className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className="mt-2.5 text-3xl font-semibold tracking-[-0.02em] tabular-nums text-ink">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
