import { cn } from '@/lib/utils';

/**
 * Mark: a solid form with a bite taken out of it, sitting on a checker square —
 * the subject separated from its background, in one glyph.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="ADH"
    >
      <rect width="32" height="32" rx="8" fill="#0e0e10" />
      <rect x="6" y="6" width="10" height="10" fill="#d7f24b" fillOpacity="0.22" />
      <rect x="16" y="16" width="10" height="10" fill="#d7f24b" fillOpacity="0.22" />
      <path
        d="M16 7.5c4.7 0 8.5 3.8 8.5 8.5S20.7 24.5 16 24.5c-2.2 0-4.2-.85-5.7-2.24 1.05.45 2.2.7 3.4.7 4.7 0 8.5-3.8 8.5-8.5 0-1.6-.44-3.1-1.2-4.37A8.46 8.46 0 0 0 16 7.5Z"
        fill="#d7f24b"
      />
      <circle cx="13" cy="16" r="4.6" fill="#d7f24b" />
    </svg>
  );
}
