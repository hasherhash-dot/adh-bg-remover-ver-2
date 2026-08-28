import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Crop,
  Download,
  FileArchive,
  ImageOff,
  Layers,
  Lock,
  Maximize,
  RotateCw,
  Scissors,
  Sliders,
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
 * Fewer things, each one larger. The page carries three sample subjects and
 * reuses them deliberately — a portrait, a product shot and a hair close-up —
 * rather than a different photograph in every card.
 *
 * There is exactly one interactive product surface above the fold (the
 * uploader) and exactly one below it (the comparison slider). Everything else
 * is a static composition built from real engine output. The editor, the batch
 * queue and the background picker are the tool's job, not the homepage's.
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
      <Features />
      <Trust />
      <MadeBy />
      <FaqSection />
      <FinalCta />
    </SiteShell>
  );
}

/* ---------------------------------------------------------------- shared -- */

/** One container width for all text. Visuals may bleed past it; copy may not. */
const CONTAINER = 'mx-auto w-full max-w-[76rem] px-6 sm:px-8';

function SectionHeading({
  id,
  children,
  tone = 'ink',
  className,
}: {
  id?: string;
  children: React.ReactNode;
  tone?: 'ink' | 'light';
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={cn(
        'font-display text-[2.25rem] font-bold leading-[1.08] tracking-[-0.025em] sm:text-[2.75rem]',
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
  { icon: Maximize, label: 'Full resolution' },
  { icon: ImageOff, label: 'No watermark' },
  { icon: Check, label: 'No signup' },
  { icon: Lock, label: 'Images not stored' },
];

function Hero() {
  return (
    <section className="border-b border-line">
      <div
        className={cn(
          CONTAINER,
          'grid items-center gap-14 py-16 lg:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] lg:gap-16 lg:py-24',
        )}
      >
        <div>
          <h1 className="font-display text-[2.75rem] font-bold leading-[1.03] tracking-[-0.035em] text-ink sm:text-[3.5rem]">
            Remove image backgrounds{' '}
            <span className="text-accent">in seconds.</span>
          </h1>
          <p className="mt-6 max-w-md text-[18px] leading-relaxed text-ink-muted">
            Upload a photo and download a transparent PNG at the size you started with.
          </p>

          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-3">
            {TRUST.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <item.icon className="size-4 shrink-0 text-accent" aria-hidden />
                <span className="text-[14px] font-medium text-ink">{item.label}</span>
              </li>
            ))}
          </ul>

          {/* The uploader is the primary action. No window chrome around it —
              it is the product, not a screenshot of the product. */}
          <div className="mt-9">
            <BackgroundRemoverStudio />
          </div>
        </div>

        {/* One finished result. It hints at the transformation with a single
            small original inset; the full comparison lives in the next
            section and is not duplicated here. */}
        <div className="relative">
          <div className="checkerboard overflow-hidden rounded-xl border border-line shadow-float">
            <img
              src={`${S}/portrait-after.webp`}
              alt="A portrait with its background removed, on a transparency grid"
              width={1200}
              height={1600}
              className="aspect-4/5 w-full object-cover object-top"
            />
          </div>

          <figure className="absolute -bottom-6 left-4 m-0 w-28 overflow-hidden rounded-lg border border-line bg-paper-raised shadow-float sm:-left-6 sm:w-36">
            <img
              src={`${S}/portrait-before.webp`}
              alt=""
              width={1200}
              height={1600}
              className="aspect-4/5 w-full object-cover object-top"
            />
            <figcaption className="px-3 py-2 text-[13px] font-medium text-ink-subtle">
              Original
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- result -- */

const RESULT_POINTS = [
  { icon: Maximize, label: 'Original dimensions preserved' },
  { icon: Scissors, label: 'Fine, soft edges' },
  { icon: Layers, label: 'Transparent PNG' },
  { icon: ImageOff, label: 'No watermark' },
];

function Result() {
  return (
    <section className="bg-paper-sunken py-20 lg:py-28" aria-labelledby="result">
      <div className={CONTAINER}>
        <SectionHeading id="result" className="max-w-2xl">
          Drag to see the difference
        </SectionHeading>

        <div className="mt-12 grid items-center gap-12 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] lg:gap-16">
          <Reveal>
            <BeforeAfterSlider
              beforeUrl={`${S}/portrait-before.webp`}
              afterUrl={`${S}/portrait-after.webp`}
              alt="A portrait before and after its background was removed"
              maxViewportHeight={78}
            />
          </Reveal>

          <ul className="flex flex-col gap-6">
            {RESULT_POINTS.map((point) => (
              <li key={point.label} className="flex items-center gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-paper-raised">
                  <point.icon className="size-5 text-navy" aria-hidden />
                </span>
                <span className="text-[17px] font-medium text-ink">{point.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- how it works -- */

const STEP_ICONS = [Upload, Wand2, Download];

function HowItWorks() {
  return (
    <section className="py-20 lg:py-24" aria-labelledby="how">
      <div className={CONTAINER}>
        <SectionHeading id="how">How it works</SectionHeading>

        <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-10">
          {HOW_IT_WORKS.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? Upload;
            return (
              <li key={step.name}>
                <span className="flex size-12 items-center justify-center rounded-lg bg-navy">
                  <Icon className="size-5 text-white" aria-hidden />
                </span>
                <h3 className="mt-5 font-display text-[1.375rem] font-semibold tracking-tight text-ink">
                  {step.name}
                </h3>
                <p className="mt-2 text-[16px] leading-relaxed text-ink-muted">{step.text}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- features -- */

/**
 * One feature per row, image and copy swapping sides. Four rows, each
 * readable in about three seconds.
 */
function FeatureRow({
  title,
  body,
  visual,
  flip = false,
}: {
  title: string;
  body: string;
  visual: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <Reveal>
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn(flip && 'lg:order-2')}>{visual}</div>
        <div className={cn('max-w-md', flip && 'lg:order-1 lg:justify-self-end')}>
          <h3 className="font-display text-[1.5rem] font-semibold tracking-tight text-ink">
            {title}
          </h3>
          <p className="mt-3 text-[17px] leading-relaxed text-ink-muted">{body}</p>
        </div>
      </div>
    </Reveal>
  );
}

/** A static representation of the editor. The real one lives in the tool. */
function EditorPreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-paper-raised shadow-raised">
      <div className="checkerboard flex items-center justify-center p-8">
        <img
          src={`${S}/product-after.webp`}
          alt="A cut-out being adjusted in the editor"
          loading="lazy"
          className="max-h-56 w-auto object-contain"
        />
      </div>
      <div className="flex items-center gap-6 border-t border-line px-6 py-5">
        <div className="flex gap-2">
          {[Sliders, Crop, RotateCw].map((Icon, index) => (
            <span
              key={index}
              className={cn(
                'flex size-9 items-center justify-center rounded-lg border',
                index === 0 ? 'border-navy bg-navy text-white' : 'border-line text-ink-muted',
              )}
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
          ))}
        </div>
        <div className="flex-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-ink-muted">Scale</span>
            <span className="text-[13px] tabular-nums text-ink-subtle">68%</span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-paper-sunken">
            <div className="h-full w-[68%] rounded-full bg-navy" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A static representation of the batch queue. */
function BatchPreview() {
  const rows = [
    { name: 'portrait-01.png', src: `${S}/portrait-after.webp`, done: true },
    { name: 'product-02.png', src: `${S}/product-after.webp`, done: true },
    { name: 'studio-03.png', src: `${S}/hair-after.webp`, done: false },
  ];

  return (
    <div className="rounded-xl border border-line bg-paper-raised p-6 shadow-raised">
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-4 rounded-lg border border-line p-3">
            <span className="checkerboard size-12 shrink-0 overflow-hidden rounded-md border border-line">
              <img src={row.src} alt="" loading="lazy" className="size-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-ink">{row.name}</span>
              <span className="text-[13px] text-ink-subtle">
                {row.done ? 'Ready · PNG' : 'Removing background…'}
              </span>
            </span>
            {row.done ? (
              <Check className="size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-paper-sunken">
                <span className="block h-full w-2/3 rounded-full bg-navy" />
              </span>
            )}
          </li>
        ))}
      </ul>
      <span className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-[15px] font-semibold text-white">
        <FileArchive className="size-4" aria-hidden />
        Download all as ZIP
      </span>
    </div>
  );
}

function Features() {
  return (
    <section className="bg-paper-sunken py-20 lg:py-28" aria-labelledby="features">
      <div className={CONTAINER}>
        <SectionHeading id="features" className="max-w-2xl">
          More than a one-click cut-out
        </SectionHeading>

        <div className="mt-14 flex flex-col gap-20 lg:gap-28">
          <FeatureRow
            title="Full-resolution output"
            body="Detection runs on a smaller copy for speed, but the mask is applied to your original file. Nothing is downscaled on the way out."
            visual={
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: '480 × 360 in', src: `${S}/product-before.webp`, board: false },
                  { label: '480 × 360 out', src: `${S}/product-after.webp`, board: true },
                ].map((shot) => (
                  <figure key={shot.label} className="m-0">
                    <div
                      className={cn(
                        'aspect-4/3 overflow-hidden rounded-xl border border-line',
                        shot.board ? 'checkerboard' : 'bg-paper-raised',
                      )}
                    >
                      <img
                        src={shot.src}
                        alt={shot.label}
                        loading="lazy"
                        className="size-full object-contain"
                      />
                    </div>
                    <figcaption className="mt-3 text-[14px] tabular-nums text-ink-subtle">
                      {shot.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            }
          />

          <FeatureRow
            flip
            title="Change the background"
            body="Keep it transparent, drop in a solid colour, or use your own image."
            visual={
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Transparent', className: 'checkerboard' },
                  { label: 'White', style: { background: '#ffffff' } },
                  { label: 'Colour', style: { background: '#153566' } },
                ].map((ground) => (
                  <figure key={ground.label} className="m-0">
                    <div
                      className={cn(
                        'aspect-3/4 overflow-hidden rounded-xl border border-line',
                        'className' in ground ? ground.className : undefined,
                      )}
                      style={'style' in ground ? ground.style : undefined}
                    >
                      <img
                        src={`${S}/portrait-after.webp`}
                        alt={`Cut-out on a ${ground.label.toLowerCase()} background`}
                        loading="lazy"
                        className="size-full object-cover object-top"
                      />
                    </div>
                    <figcaption className="mt-3 text-[14px] text-ink-subtle">
                      {ground.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            }
          />

          <FeatureRow
            title="Edit your result"
            body="Crop, scale, rotate and reposition the subject without opening another application."
            visual={<EditorPreview />}
          />

          <FeatureRow
            flip
            title="Process a set together"
            body="Drop in a folder of images, watch each one finish, and take them all as a single ZIP."
            visual={<BatchPreview />}
          />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- trust -- */

const KEY_ROWS = ['Free output resolution', 'Account required to download', 'Watermark'];

const DIFFERENCES = [
  { icon: Maximize, title: 'Full resolution', note: 'Not a 0.25 MP preview' },
  { icon: ImageOff, title: 'No watermark', note: 'On every download' },
  { icon: Check, title: 'No signup', note: 'No credits to buy' },
];

function Trust() {
  const rows = COMPARISON_ROWS.filter((row) => KEY_ROWS.includes(row.feature));

  return (
    <section className="py-20 lg:py-24" aria-labelledby="trust">
      <div className={CONTAINER}>
        <SectionHeading id="trust" className="max-w-2xl">
          What &ldquo;free&rdquo; actually means
        </SectionHeading>

        <div className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-10">
          {DIFFERENCES.map((item) => (
            <div key={item.title}>
              <item.icon className="size-6 text-accent" aria-hidden />
              <p className="mt-4 font-display text-[1.5rem] font-semibold tracking-tight text-ink">
                {item.title}
              </p>
              <p className="mt-2 text-[15px] text-ink-muted">{item.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 overflow-hidden rounded-xl border border-line">
          <div className="overflow-x-auto scrollbar-slim">
            <table className="w-full min-w-xl border-collapse text-[15px]">
              <caption className="sr-only">
                Comparison between {BRAND.name} and {COMPETITOR.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="bg-paper-sunken px-6 py-4 text-left font-display text-[14px] font-semibold text-ink-subtle">
                    Feature
                  </th>
                  <th scope="col" className="bg-accent px-6 py-4 text-left font-display text-[14px] font-semibold text-white">
                    {BRAND.name}
                  </th>
                  <th scope="col" className="bg-paper-sunken px-6 py-4 text-left font-display text-[14px] font-semibold text-ink-subtle">
                    {COMPETITOR.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.feature} className="border-t border-line bg-paper-raised">
                    <th scope="row" className="px-6 py-5 text-left font-normal text-ink-muted">
                      {row.feature}
                    </th>
                    <td className="bg-accent-soft px-6 py-5 font-medium text-ink">{row.ours}</td>
                    <td className="px-6 py-5 text-ink-subtle">{row.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed text-ink-subtle">
          Checked against {COMPETITOR.name}&apos;s own help pages, {COMPARISON_VERIFIED_ON}.{' '}
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
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- made by -- */

function MadeBy() {
  return (
    <section className="bg-navy py-20 lg:py-24" aria-labelledby="made-by">
      <div className={CONTAINER}>
        <div className="max-w-2xl">
          <SectionHeading id="made-by" tone="light">
            Built by {ORGANISATION.name}
          </SectionHeading>
          <p className="mt-6 text-[18px] leading-relaxed text-white/70">
            A design and development studio in Atlanta. We build brands, websites and apps for
            clients — and free tools like this one for everyone else.
          </p>
        </div>

        <ul className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-3 text-[15px]">
          <li>
            <a
              href={ORGANISATION.url}
              rel="noopener"
              className="font-medium text-white underline underline-offset-4 decoration-white/30 hover:decoration-white"
            >
              {ORGANISATION.name}
            </a>
          </li>
          {ORGANISATION.siblings.map((tool) => (
            <li key={tool.url} className="flex items-center gap-3">
              <span className="text-white/55" aria-hidden>
                /
              </span>
              <a
                href={tool.url}
                rel="noopener"
                className="font-medium text-white underline underline-offset-4 decoration-white/30 hover:decoration-white"
              >
                {tool.name}
              </a>
            </li>
          ))}
          <li className="flex items-center gap-3">
            <span className="text-white/55" aria-hidden>
              /
            </span>
            <span className="font-medium text-white/60">{BRAND.name}</span>
          </li>
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- faq -- */

function FaqSection() {
  return (
    <section className="py-20 lg:py-24" aria-labelledby="faq">
      <div className="mx-auto w-full max-w-[45rem] px-6 sm:px-8">
        <SectionHeading id="faq">Before you upload</SectionHeading>
        <Faq className="mt-10" items={FAQ} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- cta -- */

function FinalCta() {
  return (
    <section className="border-t border-line bg-paper-sunken py-20 lg:py-28">
      <div className={cn(CONTAINER, 'grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_auto]')}>
        <div>
          <h2 className="font-display text-[2.25rem] font-bold leading-[1.08] tracking-[-0.025em] text-ink sm:text-[2.75rem]">
            Try it with your own photo.
          </h2>
          <p className="mt-5 max-w-md text-[18px] leading-relaxed text-ink-muted">
            No account, no watermark, full resolution.
          </p>
          <div className="mt-8">
            <Button variant="accent" size="lg" asChild>
              <Link href="/remove-background">
                Remove a background
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        <div className="checkerboard hidden w-64 overflow-hidden rounded-xl border border-line shadow-raised lg:block">
          <img
            src={`${S}/hair-after.webp`}
            alt=""
            loading="lazy"
            className="aspect-3/4 w-full object-cover object-top"
          />
        </div>
      </div>
    </section>
  );
}
