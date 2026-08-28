import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Crop,
  Download,
  ImageOff,
  Layers,
  Lock,
  Maximize,
  Scissors,
  ShieldCheck,
  Upload,
  Wand2,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { cn } from '@/lib/utils';
import { BackgroundRemoverStudio } from '@/components/studio/background-remover-studio';
import { BeforeAfterSlider } from '@/components/compare/before-after-slider';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/marketing/faq';
import { JsonLd } from '@/components/marketing/json-ld';
import { Reveal } from '@/components/marketing/product-visuals';
import {
  LiveBackgroundPicker,
  LiveBatchQueue,
  LiveEditor,
  WhenNear,
} from '@/components/marketing/live-demo';
import {
  BRAND,
  COMPARISON_ROWS,
  COMPARISON_VERIFIED_ON,
  COMPETITOR,
  ORGANISATION,
} from '@/lib/marketing/brand';
import { FAQ, HOW_IT_WORKS } from '@/lib/marketing/homepage-content';
import {
  applicationSchema,
  buildGraph,
  faqSchema,
  howToSchema,
  organisationSchema,
  websiteSchema,
} from '@/lib/seo/structured-data';

const S = '/showcase';

/**
 * Homepage.
 *
 * Built out of the product rather than about it. The comparison slider, the
 * background picker, the editor and the batch queue on this page are the same
 * components the application uses, fed with real results from public/showcase —
 * not screenshots and not replicas, so none of it can drift.
 *
 * Rhythm is deliberate: light, full-bleed inset, light, bento, quiet, navy,
 * light, navy. No two adjacent sections share a shape, which is what stops the
 * page reading as a stack of equal rectangles.
 */
export default function HomePage() {
  const graph = buildGraph([
    organisationSchema(),
    websiteSchema(),
    applicationSchema(),
    howToSchema(HOW_IT_WORKS.map((step) => ({ name: step.name, text: step.text }))),
    faqSchema(FAQ),
  ]);

  return (
    <SiteShell>
      <JsonLd data={graph} />
      <Hero />
      <Result />
      <HowItWorks />
      <Capabilities />
      <Comparison />
      <Ecosystem />
      <FaqSection />
      <FinalCta />
    </SiteShell>
  );
}

/* ---------------------------------------------------------------- shared -- */

function Eyebrow({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'light' }) {
  return (
    <p
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.12em]',
        tone === 'light' ? 'text-white/55' : 'text-accent',
      )}
    >
      {children}
    </p>
  );
}

function Heading({
  id,
  children,
  className,
  tone = 'ink',
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
  tone?: 'ink' | 'light';
}) {
  return (
    <h2
      id={id}
      className={cn(
        'font-display text-[1.9rem] font-bold leading-[1.1] tracking-[-0.025em] sm:text-[2.6rem]',
        tone === 'light' ? 'text-white' : 'text-ink',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ hero -- */

const TRUST = [
  { icon: Maximize, label: 'Full resolution', note: 'Out at the size you sent' },
  { icon: ImageOff, label: 'No watermark', note: 'Ever, on any plan' },
  { icon: Check, label: 'No signup', note: 'Nothing to create' },
  { icon: Lock, label: 'Images not stored', note: 'Discarded after the reply' },
];

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="grid-backdrop pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative mx-auto grid max-w-[92rem] items-center gap-10 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] lg:gap-14 lg:pb-24 lg:pt-20">
        {/* Left: the claim. Kept narrow so the product has the room. */}
        <div className="lg:pr-4">
          <h1 className="font-display text-[2.6rem] font-bold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[3.4rem]">
            Remove image backgrounds{' '}
            <span className="text-accent">in seconds.</span>
          </h1>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-ink-muted">
            Upload a photo and download a transparent PNG at the size you started with.
          </p>

          <ul className="mt-8 grid max-w-md grid-cols-2 gap-x-4 gap-y-5">
            {TRUST.map((item) => (
              <li key={item.label} className="flex gap-2.5">
                <item.icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <span>
                  <span className="block text-[13px] font-semibold text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-subtle">
                    {item.note}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Right: the product. The uploader sits in front of a real result so
            upload target and finished cutout are both visible without
            scrolling. The result panel is allowed to bleed off the right edge
            on wide screens — a composition rather than a boxed widget. */}
        <div className="relative lg:min-h-[34rem]">
          <div
            className="pointer-events-none absolute -right-20 top-2 hidden w-[26rem] xl:block 2xl:-right-28 2xl:w-[30rem]"
            aria-hidden
          >
            <div className="checkerboard overflow-hidden rounded-lg border border-line shadow-float">
              <img
                src={`${S}/hero-after.webp`}
                alt=""
                width={801}
                height={1200}
                className="h-[30rem] w-full object-cover object-top"
              />
            </div>
            <span className="absolute -left-3 bottom-6 flex items-center gap-2 rounded-md border border-line bg-paper-raised px-3 py-2 shadow-float">
              <Download className="size-3.5 text-navy" aria-hidden />
              <span className="text-[11px] font-semibold text-ink">801 × 1200 PNG</span>
            </span>
          </div>

          <div className="relative z-10 overflow-hidden rounded-lg border border-line bg-paper-raised shadow-float xl:max-w-[38rem]">
            <div className="flex items-center gap-2 border-b border-line bg-paper-sunken px-4 py-3">
              <span className="flex gap-1.5" aria-hidden>
                <span className="size-2.5 rounded-full bg-accent" />
                <span className="size-2.5 rounded-full bg-steel" />
                <span className="size-2.5 rounded-full bg-line-strong" />
              </span>
              <span className="ml-1 text-[11px] font-medium tracking-wide text-ink-subtle">
                {BRAND.name}
              </span>
            </div>
            <div className="p-5 sm:p-7">
              <BackgroundRemoverStudio />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- result -- */

const RESULT_POINTS = [
  { icon: Maximize, label: 'Original dimensions kept' },
  { icon: Scissors, label: 'Soft edges, not a hard cut' },
  { icon: Layers, label: 'Genuine transparent PNG' },
  { icon: ImageOff, label: 'No watermark' },
];

function Result() {
  return (
    <section className="border-b border-line bg-paper-sunken" aria-labelledby="result">
      <div className="mx-auto max-w-[92rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow>The result</Eyebrow>
          <Heading id="result" className="mt-3">
            A real cut-out, not a preview
          </Heading>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] lg:gap-12">
          {/* The slider is the product's own component, zoom and all. */}
          <Reveal className="relative">
            <BeforeAfterSlider
              beforeUrl={`${S}/portrait-before.webp`}
              afterUrl={`${S}/portrait-after.webp`}
              alt="A portrait before and after its background was removed"
              maxViewportHeight={74}
            />

          </Reveal>

          <div className="lg:pt-2">
            <ul className="flex flex-col gap-4">
              {RESULT_POINTS.map((point) => (
                <li key={point.label} className="flex items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-paper-raised">
                    <point.icon className="size-4 text-navy" aria-hidden />
                  </span>
                  <span className="text-[15px] font-medium text-ink">{point.label}</span>
                </li>
              ))}
            </ul>

            <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line text-center">
              {[
                ['Output', '900 × 1200'],
                ['Format', 'PNG · RGBA'],
                ['Size', '1.5 MB'],
              ].map(([label, value]) => (
                <div key={label} className="bg-paper-raised px-2 py-3">
                  <dt className="text-[10px] uppercase tracking-wider text-ink-subtle">{label}</dt>
                  <dd className="mt-1 text-[13px] font-semibold tabular-nums text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- how it works -- */

const STEP_ICONS = [Upload, Wand2, Download];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24" aria-labelledby="how">
      <Eyebrow>Three steps</Eyebrow>
      <Heading id="how" className="mt-3">
        How it works
      </Heading>

      <ol className="relative mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
        <span
          className="pointer-events-none absolute left-[16%] right-[16%] top-6 hidden border-t border-dashed border-line-strong sm:block"
          aria-hidden
        />
        {HOW_IT_WORKS.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? Upload;
          return (
            <li key={step.name} className="group relative">
              <span className="relative z-10 flex size-12 items-center justify-center rounded-full border border-line bg-paper-raised shadow-subtle transition-transform duration-200 group-hover:-translate-y-0.5">
                <Icon className="size-5 text-navy" aria-hidden />
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                  {index + 1}
                </span>
              </span>
              <h3 className="mt-5 font-display text-[17px] font-semibold text-ink">{step.name}</h3>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">{step.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------- capabilities -- */

function Card({
  children,
  className,
  tone = 'light',
}: {
  children: React.ReactNode;
  className?: string;
  tone?: 'light' | 'navy';
}) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border p-6 transition-shadow duration-200 hover:shadow-raised sm:p-7',
        tone === 'navy' ? 'border-navy bg-navy' : 'border-line bg-paper-raised',
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardHead({
  title,
  body,
  tone = 'light',
}: {
  title: string;
  body: string;
  tone?: 'light' | 'navy';
}) {
  return (
    <div>
      <h3
        className={cn(
          'font-display text-[17px] font-semibold tracking-tight',
          tone === 'navy' ? 'text-white' : 'text-ink',
        )}
      >
        {title}
      </h3>
      <p
        className={cn(
          'mt-1.5 text-sm leading-relaxed',
          tone === 'navy' ? 'text-white/70' : 'text-ink-muted',
        )}
      >
        {body}
      </p>
    </div>
  );
}

const BATCH_SAMPLES = [
  { filename: 'portrait-01.jpg', originalUrl: `${S}/girl-before.webp`, resultUrl: `${S}/girl-after.webp`, width: 600, height: 399 },
  { filename: 'product-02.jpg', originalUrl: `${S}/product-before.webp`, resultUrl: `${S}/product-after.webp`, width: 480, height: 360 },
  { filename: 'lookbook-03.jpg', originalUrl: `${S}/dress-before.webp`, resultUrl: `${S}/dress-after.webp`, width: 600, height: 800 },
  { filename: 'studio-04.jpg', originalUrl: `${S}/stripes-before.webp`, width: 550, height: 759 },
];

function Capabilities() {
  return (
    <section className="border-y border-line bg-paper-sunken" aria-labelledby="capabilities">
      <div className="mx-auto max-w-[92rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-xl">
          <Eyebrow>What it does</Eyebrow>
          <Heading id="capabilities" className="mt-3">
            More than a one-click cut-out
          </Heading>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-12">
          {/* Full resolution — the headline claim, shown as three states. */}
          <Reveal className="lg:col-span-8">
            <Card className="h-full">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <CardHead
                  title="Full resolution, free"
                  body="Detection runs small; the mask is applied to your original."
                />
                <span className="flex items-center gap-2.5 rounded-md border border-line bg-paper-sunken px-3 py-2">
                  <span className="text-[11px] font-medium tabular-nums text-ink-muted">6000 × 4000</span>
                  <ArrowRight className="size-3.5 text-accent" aria-hidden />
                  <span className="text-[11px] font-semibold tabular-nums text-ink">6000 × 4000</span>
                </span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Uploaded', src: `${S}/food-before.webp`, bg: 'bg-paper-sunken' },
                  { label: 'Cut out', src: `${S}/food-after.webp`, bg: 'checkerboard' },
                  { label: 'On white', src: `${S}/food-after.webp`, bg: 'bg-white' },
                ].map((shot) => (
                  <figure key={shot.label} className="m-0">
                    <div className={cn('aspect-4/3 overflow-hidden rounded-md border border-line', shot.bg)}>
                      <img
                        src={shot.src}
                        alt={`${shot.label} example`}
                        loading="lazy"
                        className="size-full object-contain"
                      />
                    </div>
                    <figcaption className="mt-2 text-[11px] text-ink-subtle">{shot.label}</figcaption>
                  </figure>
                ))}
              </div>
            </Card>
          </Reveal>

          {/* Privacy — the one navy block in this grid. */}
          <Reveal delay={60} className="lg:col-span-4">
            <Card tone="navy" className="h-full justify-between">
              <div>
                <span className="flex size-10 items-center justify-center rounded-md border border-white/20 bg-white/10">
                  <ShieldCheck className="size-5 text-white" aria-hidden />
                </span>
                <div className="mt-5">
                  <CardHead
                    tone="navy"
                    title="Your images are not kept"
                    body="Processed in memory and discarded once the result is sent."
                  />
                </div>
              </div>
              <ul className="mt-6 flex flex-col gap-2.5">
                {['No account required', 'No watermark', 'History stays in your browser'].map((line) => (
                  <li key={line} className="flex items-center gap-2 text-[13px] text-white/85">
                    <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>

          {/* The real editor. */}
          <Reveal delay={40} className="lg:col-span-7">
            <Card className="h-full">
              <div className="mb-5 flex items-center gap-2">
                <Crop className="size-4 text-navy" aria-hidden />
                <CardHead
                  title="Edit after removing"
                  body="Crop, scale, rotate and reposition without another app."
                />
              </div>
              <WhenNear minHeight={360} label="Loading the editor">
                <LiveEditor src={`${S}/product-after.webp`} filename="vehicle.png" />
              </WhenNear>
            </Card>
          </Reveal>

          {/* The real background picker. */}
          <Reveal delay={80} className="lg:col-span-5">
            <Card className="h-full">
              <CardHead
                title="Swap the background"
                body="Transparent, white, black or any colour you pick."
              />
              <WhenNear minHeight={300} label="Loading backgrounds" className="mt-5">
                <LiveBackgroundPicker src={`${S}/animal-after.webp`} />
              </WhenNear>
            </Card>
          </Reveal>

          {/* The real batch queue. */}
          <Reveal delay={40} className="lg:col-span-7">
            <Card className="h-full">
              <CardHead
                title="Process a set together"
                body="Each image reports its own progress. One ZIP at the end."
              />
              <WhenNear minHeight={300} label="Loading the queue" className="mt-5">
                <LiveBatchQueue samples={BATCH_SAMPLES} />
              </WhenNear>
            </Card>
          </Reveal>

          {/* Fine edges. */}
          <Reveal delay={80} className="lg:col-span-5">
            <Card className="h-full">
              <CardHead
                title="Fine edges"
                body="Hair and fur keep partial transparency, so nothing looks stamped out."
              />
              <div className="checkerboard mt-5 flex-1 overflow-hidden rounded-md border border-line">
                <img
                  src={`${S}/hair-after.webp`}
                  alt="Hair detail at full resolution on a transparency grid"
                  loading="lazy"
                  className="size-full object-cover"
                />
              </div>
            </Card>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ comparison -- */

/** The four rows that carry the argument. The rest were noise. */
const KEY_ROWS = [
  'Free output resolution',
  'Account required to download',
  'Watermark',
  'Where images are processed',
];

const HEADLINES = [
  { icon: Maximize, value: 'Full resolution', note: 'Not a 0.25 MP preview' },
  { icon: ImageOff, value: 'No watermark', note: 'On any download' },
  { icon: Check, value: 'No signup', note: 'No credits to buy' },
];

function Comparison() {
  const rows = COMPARISON_ROWS.filter((row) => KEY_ROWS.includes(row.feature));

  return (
    <section className="mx-auto max-w-5xl px-5 py-20 sm:px-8 lg:py-24" aria-labelledby="comparison">
      <div className="max-w-xl">
        <Eyebrow>Verified {COMPARISON_VERIFIED_ON}</Eyebrow>
        <Heading id="comparison" className="mt-3">
          What &ldquo;free&rdquo; actually means
        </Heading>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {HEADLINES.map((item) => (
          <div key={item.value} className="rounded-lg border border-line bg-paper-raised p-5">
            <item.icon className="size-5 text-accent" aria-hidden />
            <p className="mt-3 font-display text-[17px] font-semibold text-ink">{item.value}</p>
            <p className="mt-1 text-[13px] text-ink-subtle">{item.note}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-line">
        <div className="overflow-x-auto scrollbar-slim">
          <table className="w-full min-w-2xl border-collapse text-sm">
            <caption className="sr-only">
              Feature comparison between {BRAND.name} and {COMPETITOR.name}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="bg-paper-sunken px-5 py-4 text-left font-display text-[13px] font-semibold text-ink-subtle">
                  Feature
                </th>
                <th scope="col" className="bg-accent px-5 py-4 text-left font-display text-[13px] font-semibold text-white">
                  {BRAND.name}
                </th>
                <th scope="col" className="bg-paper-sunken px-5 py-4 text-left font-display text-[13px] font-semibold text-ink-subtle">
                  {COMPETITOR.name}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.feature} className="border-t border-line bg-paper-raised">
                  <th scope="row" className="px-5 py-4 text-left font-normal text-ink-muted">
                    {row.feature}
                  </th>
                  <td className="bg-accent-soft px-5 py-4 font-medium text-ink">
                    <span className="flex items-start gap-2">
                      {row.advantage && (
                        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      )}
                      {row.ours}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-ink-subtle">{row.theirs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
        Checked against {COMPETITOR.name}&apos;s own help pages,{' '}
        {COMPARISON_VERIFIED_ON}.{' '}
        {COMPETITOR.sources.map((source, index) => (
          <span key={source}>
            {index > 0 && ' · '}
            <a
              href={source}
              rel="nofollow noopener"
              target="_blank"
              className="underline underline-offset-2 hover:text-ink-muted"
            >
              {source.replace('https://www.', '')}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- ecosystem -- */

function Ecosystem() {
  return (
    <section className="relative overflow-hidden bg-navy" aria-labelledby="ecosystem">
      <div className="dot-field pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <div className="max-w-xl">
          <Eyebrow tone="light">The ADH toolkit</Eyebrow>
          <Heading id="ecosystem" tone="light" className="mt-3">
            Built by {ORGANISATION.name}
          </Heading>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/70">
            We build brands, websites and apps for clients — and free tools like this one for
            everyone else.
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)]">
          <a
            href={ORGANISATION.url}
            rel="noopener"
            className="group flex flex-col justify-between rounded-lg border border-white/15 bg-white/[0.06] p-6 transition-colors hover:border-white/30"
          >
            <span className="font-display text-[15px] font-semibold text-white">
              {ORGANISATION.name}
            </span>
            <span className="mt-6 flex items-center gap-1.5 text-[13px] text-white/60">
              Design &amp; development studio
              <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </span>
          </a>

          {/* The relationship, drawn rather than described. */}
          <div className="hidden items-center justify-center px-2 lg:flex" aria-hidden>
            <svg width="40" height="120" viewBox="0 0 40 120" fill="none" className="text-white/25">
              <path d="M0 60 H16 M16 24 V96 M16 24 H40 M16 96 H40" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="2" cy="60" r="2.5" fill="currentColor" />
            </svg>
          </div>

          {ORGANISATION.siblings.map((tool) => (
            <a
              key={tool.url}
              href={tool.url}
              rel="noopener"
              className="group flex flex-col justify-between rounded-lg border border-white/15 bg-white/[0.06] p-6 transition-colors hover:border-white/30"
            >
              <span className="font-display text-[15px] font-semibold text-white">{tool.name}</span>
              <span className="mt-6 flex items-center gap-1.5 text-[13px] text-white/60">
                Compress &amp; convert
                <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </a>
          ))}

          <div className="flex flex-col justify-between rounded-lg border border-accent bg-accent/15 p-6">
            <span className="font-display text-[15px] font-semibold text-white">{BRAND.name}</span>
            <span className="mt-6 inline-flex w-fit rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
              You are here
            </span>
          </div>
        </div>

        <address className="mt-10 flex flex-wrap gap-x-6 gap-y-1 text-xs not-italic text-white/70">
          <span>
            {ORGANISATION.address.street}, {ORGANISATION.address.locality},{' '}
            {ORGANISATION.address.region} {ORGANISATION.address.postalCode}
          </span>
          <a href={`tel:${ORGANISATION.telephone}`} className="hover:text-white">
            {ORGANISATION.telephone}
          </a>
          <a href={`mailto:${ORGANISATION.email}`} className="hover:text-white/70">
            {ORGANISATION.email}
          </a>
        </address>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- faq -- */

function FaqSection() {
  return (
    <section className="mx-auto max-w-3xl px-5 py-20 sm:px-8 lg:py-24" aria-labelledby="faq">
      <Eyebrow>Questions</Eyebrow>
      <Heading id="faq" className="mt-3">
        Before you upload
      </Heading>
      <Faq className="mt-10" items={FAQ} />
    </section>
  );
}

/* -------------------------------------------------------------------- cta -- */

function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-line bg-navy">
      <div className="dot-field pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden />

      {/* A real cut-out bleeding in, so the last thing on the page is still
          the product rather than a poster. */}
      <div
        className="pointer-events-none absolute -right-8 bottom-0 hidden w-[22rem] lg:block"
        aria-hidden
      >
        <img
          src={`${S}/hero-after.webp`}
          alt=""
          loading="lazy"
          className="h-[22rem] w-full object-cover object-top opacity-90"
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24">
        <div className="max-w-lg">
          <h2 className="font-display text-[1.9rem] font-bold leading-tight tracking-[-0.025em] text-white sm:text-[2.6rem]">
            Try it with your own photo.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            No account, no watermark, full resolution.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button variant="accent" size="lg" asChild>
              <Link href="/remove-background">
                Remove a background
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <span className="text-[13px] text-white/55">JPG · PNG · WEBP · AVIF · HEIC</span>
          </div>
        </div>
      </div>
    </section>
  );
}
