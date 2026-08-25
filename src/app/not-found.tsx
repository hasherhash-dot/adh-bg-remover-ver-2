import Link from 'next/link';
import { SiteShell } from '@/components/layout/site-shell';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <SiteShell>
      <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-28 text-center sm:px-8">
        <p className="font-display text-6xl font-extrabold text-steel">404</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-ink">
          That page doesn&apos;t exist
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted">
          The link may be out of date. The background remover is still right where you left it.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
          <Button variant="accent" asChild>
            <Link href="/remove-background">Remove a background</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Back home</Link>
          </Button>
        </div>
      </div>
    </SiteShell>
  );
}
