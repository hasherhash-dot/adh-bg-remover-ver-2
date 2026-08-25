'use client';

import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0 active:scale-[0.985] select-none',
  {
    variants: {
      variant: {
        // Navy is the structural button on both ADH properties.
        primary: 'bg-navy text-white hover:bg-navy-hover',
        // Red is the action colour. Reserved for the one primary action per view.
        accent: 'bg-accent text-accent-ink hover:bg-accent-hover font-semibold',
        outline:
          'border border-control bg-paper-raised text-ink hover:bg-paper-sunken hover:border-ink/40',
        ghost: 'text-ink-muted hover:bg-paper-sunken hover:text-ink',
        subtle: 'bg-paper-sunken text-ink hover:bg-line/70',
        danger: 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
        link: 'text-ink underline underline-offset-4 decoration-line-strong hover:decoration-ink',
      },
      size: {
        sm: 'h-9 rounded-xs px-3.5 text-[13px] [&_svg]:size-4',
        md: 'h-11 rounded-sm px-5 text-sm [&_svg]:size-4',
        lg: 'h-13 rounded-sm px-7 text-[15px] [&_svg]:size-[18px]',
        icon: 'size-10 rounded-sm [&_svg]:size-[18px]',
        'icon-sm': 'size-8 rounded-xs [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
  /** Announced to screen readers while `loading` is true. */
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, loadingLabel, children, disabled, ...props },
  ref,
) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </Component>
  );
});

export { buttonVariants };
