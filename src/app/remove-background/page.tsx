import type { Metadata } from 'next';
import { SiteShell } from '@/components/layout/site-shell';
import { BackgroundRemoverStudio } from '@/components/studio/background-remover-studio';

export const metadata: Metadata = {
  title: 'Background Remover — upload an image, get a transparent PNG',
  description:
    'Remove the background from any image automatically. Upload JPG, PNG, WEBP or HEIC and download a transparent PNG at full resolution.',
  alternates: { canonical: '/remove-background' },
};

export default function RemoveBackgroundPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">
            Background Remover
          </h1>
          <p className="mt-3.5 text-base leading-relaxed text-ink-muted">
            Drop an image below. You&apos;ll get a transparent PNG back at the resolution you
            started with, ready to download or edit.
          </p>
        </header>

        <div className="mt-10">
          <BackgroundRemoverStudio />
        </div>
      </div>
    </SiteShell>
  );
}
