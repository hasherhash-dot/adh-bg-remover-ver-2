import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowUpRight, Boxes, Globe, Image as ImageIcon, Scissors, Sliders, Terminal } from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { Badge } from '@/components/ui/badge';

export const metadata: Metadata = {
  title: 'Tools',
  description:
    'Everything in the ADH toolkit: the background remover, batch processing, the image editor, the browser extension and the API.',
  alternates: { canonical: '/tools' },
};

const TOOLS = [
  {
    href: '/remove-background',
    icon: Scissors,
    title: 'Background Remover',
    body: 'The core tool. Upload an image, get a transparent PNG at full resolution.',
    status: 'Ready',
  },
  {
    href: '/remove-background',
    icon: Boxes,
    title: 'Batch processing',
    body: 'Queue up to twenty images. Per-image progress, per-image retry, ZIP download.',
    status: 'Ready',
  },
  {
    href: '/remove-background',
    icon: Sliders,
    title: 'Image editor',
    body: 'Solid colours, replacement backgrounds, scale, position, crop and rotate — with undo.',
    status: 'Ready',
  },
  {
    href: '/resources#extension',
    icon: Globe,
    title: 'Browser extension',
    body: 'Right-click any image on the web and remove its background without leaving the page.',
    status: 'Ready',
  },
  {
    href: '/api',
    icon: Terminal,
    title: 'API',
    body: 'One multipart endpoint. Returns a PNG with dimensions and timing in the headers.',
    status: 'Ready',
  },
  {
    href: '/remove-background-online',
    icon: ImageIcon,
    title: 'Format conversion',
    body: 'HEIC, WEBP and AVIF are decoded on upload, so there is no conversion step first.',
    status: 'Ready',
  },
];

export default function ToolsPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
        <header className="max-w-2xl">
          <h1 className="font-display text-4xl font-bold tracking-[-0.03em] text-ink sm:text-5xl">Tools</h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            One engine, five ways to reach it — in the browser, in bulk, in the editor, from a
            right-click, or from your own code.
          </p>
        </header>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="group flex flex-col rounded-lg border border-line bg-paper-raised p-6 transition-all duration-200 hover:border-ink/25 hover:shadow-raised"
            >
              <div className="flex items-start justify-between">
                <span className="flex size-9 items-center justify-center rounded-sm border border-line bg-paper-sunken">
                  <tool.icon className="size-4 text-ink" aria-hidden />
                </span>
                <ArrowUpRight
                  className="size-4 text-ink-subtle transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink"
                  aria-hidden
                />
              </div>
              <h2 className="mt-4 text-[15px] font-semibold tracking-tight text-ink">
                {tool.title}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-muted">{tool.body}</p>
              <Badge variant="success" size="sm" className="mt-4 self-start">
                {tool.status}
              </Badge>
            </Link>
          ))}
        </div>
      </div>
    </SiteShell>
  );
}
