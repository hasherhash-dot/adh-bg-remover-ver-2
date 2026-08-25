import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Download,
  ImageOff,
  Layers,
  Lock,
  Maximize,
  Scissors,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { cn } from '@/lib/utils';
import { BackgroundRemoverStudio } from '@/components/studio/background-remover-studio';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/marketing/faq';
import { JsonLd } from '@/components/marketing/json-ld';
import {
  AppFrame,
  BackgroundSwapDemo,
  BatchMock,
  BeforeAfter,
  DownloadCard,
  EditorMock,
  Reveal,
} from '@/components/marketing/product-visuals';
import {
  BRAND,
  COMPARISON_ROWS,
  COMPARISON_VERIFIED_ON,
  COMPETITOR,
  ORGANISATION,
  PRODUCT_FACTS,
} from '@/lib/marketing/brand';
import { FAQ, HOW_IT_WORKS, RESULT_QUALITY } from '@/lib/marketing/homepage-content';
import {
  applicationSchema,
  buildGraph,
  faqSchema,
  howToSchema,
  organisationSchema,
  websiteSchema,
} from '@/lib/seo/structured-data';

const SHOWCASE = '/showcase';

/**
 * Homepage.
 *
 * The job is still Upload → Remove → Download, but the page now *shows* the
 * product rather than describing it. Every photograph is a genuine result from
 * the live endpoint, and every interface fragment is built from the same
 * tokens as the application.
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
      <Quality />
      <HowItWorks />
      <FeatureBento />
      <Comparison />
      <Family />
      <FaqSection />
      <FinalCta />
    </SiteShell>
  );
}

/** Small caps label used to head each block. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">{children}</p>
  );
}

function Heading({
  id,
  children,
  className,
}: {
  id?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        'font-display text-[1.7rem] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[2.1rem]',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ hero -- */

const TRUST = [
  { icon: Maximize, label: 'Full resolution' },
  { icon: ImageOff, label: 'No watermark' },
  { icon: Check, label: 'No signup' },
  { icon: Lock, label: 'Images not stored' },
  { icon: Layers, label: PRODUCT_FACTS.inputFormats.join(' · ') },
];

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="grid-backdrop pointer-events-none absolute inset-0" aria-hidden />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        aria-hidden
        style={{ background: 'linear-gradient(to bottom, rgb(21 53 102 / 0.04), transparent)' }}
      />

      <div className="relative mx-auto max-w-6xl px-5 pb-14 pt-12 sm:px-8 sm:pb-18 sm:pt-16">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-display text-[2.4rem] font-bold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[3.5rem]">
            Remove image backgrounds{' '}
            <span className="text-accent">in seconds.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-ink-muted sm:text-lg">
            Upload a photo and download a transparent PNG at the size you started with.
          </p>
        </div>

        {/* The uploader lives inside window chrome so it reads as software
            rather than an empty field on a marketing page. */}
        <div className="relative mx-auto mt-9 max-w-3xl sm:mt-11">
          <AppFrame label={BRAND.name}>
            <div className="p-4 sm:p-6">
              <BackgroundRemoverStudio />
            </div>
          </AppFrame>

          {/* Floating accents, desktop only — they must never crowd the drop
              target on a phone. */}
          <div className="pointer-events-none absolute -left-28 top-16 hidden xl:block">
            <Reveal delay={150}>
              <DownloadCard dimensions="4000 × 6000" size="25.7 MB" />
            </Reveal>
          </div>
          <div className="pointer-events-none absolute -right-24 bottom-16 hidden xl:block">
            <Reveal delay={300}>
              <span className="flex items-center gap-2 rounded-md border border-line bg-paper-raised px-3 py-2 text-[12px] font-semibold text-ink shadow-float">
                <Maximize className="size-3.5 text-accent" aria-hidden />
                Full resolution
              </span>
            </Reveal>
          </div>
        </div>

        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-ink-subtle">
          {TRUST.map((item) => (
            <li key={item.label} className="flex items-center gap-1.5">
              <item.icon className="size-3.5 text-steel" aria-hidden />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- quality -- */

const QUALITY_ICONS = [Maximize, Scissors, Layers];

function Quality() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20" aria-labelledby="quality">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <Reveal>
          <BeforeAfter
            before={`${SHOWCASE}/portrait-before.webp`}
            after={`${SHOWCASE}/portrait-after.webp`}
            alt="A portrait before and after the background was removed"
          />
        </Reveal>

        <div>
          <Eyebrow>The result</Eyebrow>
          <Heading id="quality" className="mt-3">
            A real cut-out, not a preview
          </Heading>

          <ul className="mt-7 flex flex-col gap-5">
            {RESULT_QUALITY.map((item, index) => {
              const Icon = QUALITY_ICONS[index] ?? Maximize;
              return (
                <li key={item.heading} className="flex gap-3.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-paper-raised">
                    <Icon className="size-4 text-navy" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-display text-[15px] font-semibold text-ink">
                      {item.heading}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted">
                      {item.body}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* The edge-quality claim, shown at native resolution. */}
      <Reveal className="mt-14">
        <div className="rounded-lg border border-line bg-paper-sunken p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-display text-[15px] font-semibold text-ink">
              Hair, at 100% zoom
            </p>
            <p className="text-xs text-ink-subtle">Actual output · no retouching</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <figure className="m-0">
              <img
                src={`${SHOWCASE}/hair-before.webp`}
                alt="Original photograph, zoomed to the hairline"
                loading="lazy"
                width={620}
                height={420}
                className="w-full rounded-md border border-line"
              />
              <figcaption className="mt-2 text-xs text-ink-subtle">Original</figcaption>
            </figure>
            <figure className="m-0">
              <img
                src={`${SHOWCASE}/hair-after.webp`}
                alt="The same hairline after background removal, on a transparency grid"
                loading="lazy"
                width={620}
                height={420}
                className="checkerboard w-full rounded-md border border-line"
              />
              <figcaption className="mt-2 text-xs text-ink-subtle">
                Cut out — individual strands retained
              </figcaption>
            </figure>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/* ---------------------------------------------------------- how it works -- */

const STEP_ICONS = [Upload, Wand2, Download];

function HowItWorks() {
  return (
    <section
      className="border-y border-line bg-paper-sunken"
      aria-labelledby="how-it-works"
    >
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <Eyebrow>Three steps</Eyebrow>
        <Heading id="how-it-works" className="mt-3">
          How it works
        </Heading>

        <ol className="relative mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {/* Flow line, desktop only. */}
          <span
            className="pointer-events-none absolute left-0 right-0 top-5 hidden border-t border-dashed border-line-strong sm:block"
            aria-hidden
          />

          {HOW_IT_WORKS.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? Upload;
            return (
              <li key={step.name} id={`step-${index + 1}`} className="relative scroll-mt-24">
                <span className="relative flex size-10 items-center justify-center rounded-full border border-line bg-paper-raised shadow-subtle">
                  <Icon className="size-4 text-navy" aria-hidden />
                  <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-white">
                    {index + 1}
                  </span>
                </span>
                <h3 className="mt-4 font-display text-[15px] font-semibold text-ink">
                  {step.name}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- feature bento -- */

/** Shared card shell so the bento keeps one consistent frame. */
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
        'flex flex-col rounded-lg border p-5 transition-shadow duration-200 hover:shadow-raised sm:p-6',
        tone === 'navy' ? 'border-navy bg-navy' : 'border-line bg-paper-raised',
        className,
      )}
    >
      {children}
    </div>
  );
}

function CardTitle({ children, tone = 'light' }: { children: React.ReactNode; tone?: 'light' | 'navy' }) {
  return (
    <h3
      className={cn(
        'font-display text-[15px] font-semibold tracking-tight',
        tone === 'navy' ? 'text-white' : 'text-ink',
      )}
    >
      {children}
    </h3>
  );
}

function CardBody({ children, tone = 'light' }: { children: React.ReactNode; tone?: 'light' | 'navy' }) {
  return (
    <p
      className={cn(
        'mt-1.5 text-sm leading-relaxed',
        tone === 'navy' ? 'text-white/70' : 'text-ink-muted',
      )}
    >
      {children}
    </p>
  );
}

function FeatureBento() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20" aria-labelledby="features">
      <Eyebrow>What it does</Eyebrow>
      <Heading id="features" className="mt-3 max-w-xl">
        More than a one-click cut-out
      </Heading>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {/* Full resolution — the headline claim, shown as a readout. */}
        <Reveal className="lg:col-span-2">
          <Card className="h-full">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-sm">
                <CardTitle>Full resolution, free</CardTitle>
                <CardBody>
                  Detection runs on a smaller copy for speed, but the mask is applied to your
                  original file. Nothing is downscaled on the way out.
                </CardBody>
              </div>
              <span className="flex items-center gap-2.5 rounded-md border border-line bg-paper-sunken px-3 py-2">
                <span className="text-[11px] font-medium tabular-nums text-ink-muted">
                  4000 × 6000
                </span>
                <ArrowRight className="size-3.5 text-accent" aria-hidden />
                <span className="text-[11px] font-semibold tabular-nums text-ink">4000 × 6000</span>
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Uploaded', src: `${SHOWCASE}/food-before.webp`, plain: true },
                { label: 'Cut out', src: `${SHOWCASE}/food-after.webp` },
                { label: 'On white', src: `${SHOWCASE}/food-after.webp`, white: true },
              ].map((shot) => (
                <figure key={shot.label} className="m-0">
                  <div
                    className={cn(
                      'aspect-4/3 overflow-hidden rounded-md border border-line',
                      shot.plain ? 'bg-paper-sunken' : shot.white ? 'bg-white' : 'checkerboard',
                    )}
                  >
                    <img
                      src={shot.src}
                      alt={`${shot.label} example`}
                      loading="lazy"
                      className="size-full object-contain"
                    />
                  </div>
                  <figcaption className="mt-1.5 text-[11px] text-ink-subtle">
                    {shot.label}
                  </figcaption>
                </figure>
              ))}
            </div>
          </Card>
        </Reveal>

        {/* Privacy — navy for contrast in the grid. */}
        <Reveal delay={80}>
          <Card tone="navy" className="h-full justify-between">
            <div>
              <span className="flex size-9 items-center justify-center rounded-md border border-white/20 bg-white/10">
                <ShieldCheck className="size-4 text-white" aria-hidden />
              </span>
              <CardTitle tone="navy">
                <span className="mt-4 block">Your images are not kept</span>
              </CardTitle>
              <CardBody tone="navy">
                Files are processed in memory and discarded once the result is sent. Nothing is
                written to disk on our side.
              </CardBody>
            </div>
            <ul className="mt-5 flex flex-col gap-2">
              {['No account required', 'No watermark', 'History stays in your browser'].map((line) => (
                <li key={line} className="flex items-center gap-2 text-[13px] text-white/85">
                  <Check className="size-3.5 shrink-0 text-accent" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        </Reveal>

        {/* Background replacement — interactive. */}
        <Reveal delay={40}>
          <Card className="h-full">
            <CardTitle>Swap the background</CardTitle>
            <CardBody>Transparent, white, black or any colour you pick.</CardBody>
            <div className="mt-4">
              <BackgroundSwapDemo
                src={`${SHOWCASE}/woman-after.webp`}
                alt="The same cut-out shown on different backgrounds"
              />
            </div>
          </Card>
        </Reveal>

        {/* Editor. */}
        <Reveal delay={80}>
          <Card className="h-full">
            <CardTitle>Edit after removing</CardTitle>
            <CardBody>Crop, scale, rotate and reposition without another app.</CardBody>
            <div className="mt-4">
              <EditorMock src={`${SHOWCASE}/car-after.webp`} />
            </div>
          </Card>
        </Reveal>

        {/* Batch. */}
        <Reveal delay={120}>
          <Card className="h-full">
            <CardTitle>Process a set together</CardTitle>
            <CardBody>Each image reports its own progress. One ZIP at the end.</CardBody>
            <div className="mt-4">
              <BatchMock
                thumbs={[
                  { src: `${SHOWCASE}/girl-after.webp`, name: 'portrait-01.png' },
                  { src: `${SHOWCASE}/animal-after.webp`, name: 'product-02.png' },
                  { src: `${SHOWCASE}/car-after.webp`, name: 'vehicle-03.png' },
                ]}
              />
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- comparison -- */

function Comparison() {
  return (
    <section
      className="border-y border-line bg-paper-sunken"
      aria-labelledby="comparison"
    >
      <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
        <Eyebrow>Verified {COMPARISON_VERIFIED_ON}</Eyebrow>
        <Heading id="comparison" className="mt-3">
          What &ldquo;free&rdquo; actually means
        </Heading>

        <div className="mt-8 overflow-hidden rounded-lg border border-line bg-paper-raised">
          <div className="overflow-x-auto scrollbar-slim">
            <table className="w-full min-w-2xl border-collapse text-sm">
              <caption className="sr-only">
                Feature comparison between {BRAND.name} and {COMPETITOR.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="bg-navy px-4 py-3.5 text-left font-display text-[13px] font-semibold text-white/80">
                    Feature
                  </th>
                  <th scope="col" className="bg-accent px-4 py-3.5 text-left font-display text-[13px] font-semibold text-white">
                    {BRAND.name}
                  </th>
                  <th scope="col" className="bg-navy px-4 py-3.5 text-left font-display text-[13px] font-semibold text-white/80">
                    {COMPETITOR.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row, index) => (
                  <tr
                    key={row.feature}
                    className={cn(
                      'border-t border-line',
                      index % 2 === 1 && 'bg-stripe',
                      // The resolution row is the one that matters most.
                      index === 0 && 'bg-accent-soft',
                    )}
                  >
                    <th scope="row" className="px-4 py-3.5 text-left font-normal text-ink-muted">
                      {row.feature}
                    </th>
                    <td className="px-4 py-3.5 font-medium text-ink">
                      <span className="flex items-start gap-2">
                        {row.advantage && (
                          <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                        )}
                        {row.ours}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted">{row.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
          Checked against {COMPETITOR.name}&apos;s own help pages in{' '}
          {COMPARISON_VERIFIED_ON}:{' '}
          {COMPETITOR.sources.map((source, index) => (
            <span key={source}>
              {index > 0 && ', '}
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
          . Only limits published by the vendor are listed.
        </p>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- family -- */

function Family() {
  const tools = [
    {
      name: ORGANISATION.name,
      description: 'Design, web and branding studio in Atlanta.',
      href: ORGANISATION.url,
      current: false,
    },
    ...ORGANISATION.siblings.map((tool) => ({
      name: tool.name,
      description: tool.description,
      href: tool.url,
      current: false,
    })),
    {
      name: BRAND.name,
      description: 'Transparent PNGs at full resolution, free.',
      href: '/',
      current: true,
    },
  ];

  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20" aria-labelledby="family">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>The ADH toolkit</Eyebrow>
          <Heading id="family" className="mt-3">
            Built by {ORGANISATION.name}
          </Heading>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
          We build brands, websites and apps for clients — and free tools like this one for
          everyone else.
        </p>
      </div>

      <ul className="mt-8 grid gap-4 sm:grid-cols-3">
        {tools.map((tool) => (
          <li key={tool.name}>
            <a
              href={tool.href}
              rel={tool.href.startsWith('http') ? 'noopener' : undefined}
              className={cn(
                'group flex h-full flex-col rounded-lg border p-5 transition-all duration-200',
                tool.current
                  ? 'border-accent bg-accent-soft'
                  : 'border-line bg-paper-raised hover:border-ink/25 hover:shadow-raised',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="font-display text-[15px] font-semibold text-ink">{tool.name}</span>
                {tool.current ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                    You are here
                  </span>
                ) : (
                  <ArrowRight
                    className="size-3.5 -translate-x-1 text-ink-subtle opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                    aria-hidden
                  />
                )}
              </span>
              <span className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                {tool.description}
              </span>
            </a>
          </li>
        ))}
      </ul>

      <address className="mt-8 flex flex-wrap gap-x-6 gap-y-1 text-xs not-italic text-ink-subtle">
        <span>
          {ORGANISATION.address.street}, {ORGANISATION.address.locality},{' '}
          {ORGANISATION.address.region} {ORGANISATION.address.postalCode}
        </span>
        <a href={`tel:${ORGANISATION.telephone}`} className="hover:text-ink-muted">
          {ORGANISATION.telephone}
        </a>
        <a href={`mailto:${ORGANISATION.email}`} className="hover:text-ink-muted">
          {ORGANISATION.email}
        </a>
      </address>
    </section>
  );
}

/* -------------------------------------------------------------------- faq -- */

function FaqSection() {
  return (
    <section
      className="border-t border-line bg-paper-sunken"
      aria-labelledby="faq"
    >
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <Eyebrow>Questions</Eyebrow>
        <Heading id="faq" className="mt-3">
          Before you upload
        </Heading>
        <Faq className="mt-8" items={FAQ} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------- cta -- */

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-navy">
      <div className="dot-field pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden />
      <div className="relative mx-auto max-w-3xl px-5 py-16 text-center sm:px-8 sm:py-20">
        <Sparkles className="mx-auto size-6 text-accent" aria-hidden />
        <h2 className="mt-4 font-display text-[1.7rem] font-bold tracking-[-0.02em] text-white sm:text-[2.1rem]">
          Try it with your own photo.
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-white/70">
          No account, no watermark, full resolution.
        </p>
        <div className="mt-7">
          <Button variant="accent" size="lg" asChild>
            <Link href="/remove-background">
              Remove a background
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
