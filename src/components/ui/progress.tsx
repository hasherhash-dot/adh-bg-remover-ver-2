import { cn } from '@/lib/utils';
import { clamp } from '@/lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 0..100. Pass `null` for an indeterminate bar. */
  value: number | null;
  label?: string;
  size?: 'sm' | 'md';
}

export function Progress({ value, label, size = 'md', className, ...props }: ProgressProps) {
  const percent = value === null ? null : clamp(value, 0, 100);

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-label={label ?? 'Progress'}
      className={cn(
        'w-full overflow-hidden rounded-full bg-paper-sunken',
        size === 'sm' ? 'h-1' : 'h-1.5',
        className,
      )}
      {...props}
    >
      {percent === null ? (
        <div className="h-full w-1/3 animate-shimmer rounded-full bg-linear-to-r from-transparent via-ink to-transparent bg-[length:200%_100%]" />
      ) : (
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-300 ease-out-soft"
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}
