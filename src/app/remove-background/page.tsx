import { InnerCta } from '@/components/marketing/inner-cta';
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
      <div className="inner-page inner-remover">
        <header className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-3xl font-bold tracking-[-0.025em] text-ink sm:text-4xl">
            Background Remover
          </h1>
          <p className="mt-3.5 text-base leading-relaxed text-ink-muted">
            Drop an image below. You&apos;ll get a transparent PNG back at the resolution you
            started with, ready to download or edit.
          </p>
        </header>

        <div className="inner-studio mt-10" id="upload">
          <BackgroundRemoverStudio />
        </div>
        <InnerCta/>
      </div>
    </SiteShell>
  );
}
