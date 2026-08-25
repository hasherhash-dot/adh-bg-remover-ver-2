import type { Metadata } from 'next';
import { ToolLanding } from '@/components/marketing/tool-landing';
import { LANDING_PAGES } from '@/lib/marketing/landing-content';

const page = LANDING_PAGES['remove-background-from-jpg']!;

export const metadata: Metadata = {
  title: page.metaTitle,
  description: page.metaDescription,
  alternates: { canonical: '/remove-background-from-jpg' },
};

export default function Page() {
  return (
    <ToolLanding
      eyebrow={page.eyebrow}
      title={page.title}
      intro={page.intro}
      points={page.points}
      faq={page.faq}
      related={page.related}
    />
  );
}
