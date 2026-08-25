'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Route-level error boundary.
 *
 * Shows a plain-language message. The digest is rendered only so a user can
 * quote it in a support request — the underlying message and stack stay in the
 * server log where they belong.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-5 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg border border-line bg-paper-raised">
        <AlertTriangle className="size-5 text-danger" aria-hidden />
      </span>
      <div className="max-w-md">
        <h1 className="text-xl font-semibold tracking-tight text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          This page hit an unexpected error. Trying again usually resolves it.
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <Button onClick={reset}>
          <RotateCw aria-hidden />
          Try again
        </Button>
        <Button variant="outline" onClick={() => window.location.assign('/')}>
          Go home
        </Button>
      </div>
      {error.digest && (
        <p className="text-xs text-ink-subtle">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      )}
    </div>
  );
}
