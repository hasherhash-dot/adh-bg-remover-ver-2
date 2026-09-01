import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  ImageOff,
  Layers,
  Lock,
  Maximize,
  Scissors,
  Sparkles,
  Upload,
} from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { cn } from '@/lib/utils';
import { BackgroundRemoverStudio } from '@/components/studio/background-remover-studio';
import { BeforeAfterSlider } from '@/components/compare/before-after-slider';
import { Button } from '@/components/ui/button';
import { Faq } from '@/components/marketing/faq';
import { JsonLd } from '@/components/marketing/json-ld';
import { Reveal } from '@/components/marketing/product-visuals';
import { HeroScene } from '@/components/marketing/hero-scene';
import { BackgroundSwap } from '@/components/marketing/background-swap';
import { EditorPreview } from '@/components/marketing/editor-preview';
import { BatchStrip } from '@/components/marketing/batch-strip';
import { EdgeCrops } from '@/components/marketing/edge-crops';
import { ResolutionProof } from '@/components/marketing/resolution-proof';
import { PrivacyFlow } from '@/components/marketing/privacy-flow';
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
 * The governing rule is: show the capability, do not describe it. Every claim
 * this page makes has a picture or a control attached to it, and the ten things
 * the product actually does are each demonstrated by something on screen rather
 * than by a paragraph in a card.
 *
 * That is the second attempt at the idea. The first mounted the real editor,
 * batch queue and background picker directly here, which was accurate but
 * turned a landing page into an application dashboard. These demonstrations are
 * DOM and CSS only — no canvas, no blob compositing, no animation library and
 * no application components — so each one communicates exactly one capability
 * and costs almost nothing to render.
 *
 * Imagery is art-directed rather than accumulated: five recurring subjects,
 * every one of them real output from the ADH engine via scripts/build-showcase-
 * assets.mjs and scripts/build-showcase-crops.mjs. The close crops are at native
 * resolution, because a resampled edge would prove nothing about alpha quality.
 *
 * Rhythm alternates white, grey and navy, and no two adjacent sections share a
 * column count or a card treatment. The quiet sections — how it works, privacy,
 * the comparison table — are quiet on purpose, so the loud ones have somewhere
 * to be loud.
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
      <BackgroundSection />
      <EditorSection />
      <BatchSection />
      <EdgeSection />
      <ResolutionAndPrivacy />
      <Comparison />
      <Ecosystem />
      <FaqSection />
      <FinalCta />
    </SiteShell>
  );
}

/* ---------------------------------------------------------------- shared -- */

function Eyebrow({
  children,
  tone = 'accent',
}: {
  children: React.ReactNode;
  tone?: 'accent' | 'light';
}) {
  return (
    <p
      className={cn(
        'text-[12px] font-semibold uppercase tracking-[0.12em]',
        tone === 'light' ? 'text-white/60' : 'text-accent',
      )}
    >
      {children}
    </p>
  );
}

/**
 * Section heading.
 *
 * Sized up deliberately. The previous pass capped at 41px and set feature
 * headings at 17px, which is most of why the page read as a document rather
 * than a product — the type was doing filing-cabinet work. If something only
 * fits at a smaller size, the layout is wrong, not the type.
 */
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
        'font-display text-[2rem] font-bold leading-[1.06] tracking-[-0.03em] sm:text-[2.6rem] lg:text-[3.1rem]',
        tone === 'light' ? 'text-white' : 'text-ink',
        className,
      )}
    >
      {children}
    </h2>
  );
}

function Lede({
  children,
  tone = 'ink',
  className,
}: {
  children: React.ReactNode;
  tone?: 'ink' | 'light';
  className?: string;
}) {
  return (
    <p
      className={cn(
        'text-[17px] leading-relaxed',
        tone === 'light' ? 'text-white/70' : 'text-ink-muted',
        className,
      )}
    >
      {children}
    </p>
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

      <div className="relative mx-auto grid max-w-[92rem] items-center gap-12 px-5 pb-20 pt-12 sm:px-8 lg:grid-cols-[minmax(0,42%)_minmax(0,58%)] lg:gap-10 lg:pb-28 lg:pt-20">
        <div className="lg:pr-6">
          <h1 className="font-display text-[2.75rem] font-bold leading-[1.01] tracking-[-0.038em] text-ink sm:text-[3.5rem] lg:text-[4.25rem]">
            Remove image backgrounds <span className="text-accent">in seconds.</span>
          </h1>

          <Lede className="mt-6 max-w-md">
            Upload a photo and download a transparent PNG at the size you started with.
          </Lede>

          <ul className="mt-9 grid max-w-md grid-cols-2 gap-x-5 gap-y-6">
            {TRUST.map((item) => (
              <li key={item.label} className="flex gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-paper-raised shadow-subtle">
                  <item.icon className="size-4 text-accent" aria-hidden />
                </span>
                <span>
                  <span className="block text-[14px] font-semibold text-ink">{item.label}</span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-subtle">
                    {item.note}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* The product scene. The uploader is the front object; behind it a
            real result wipes in from the original, so the proposition is
            visible before a word is read. */}
        <HeroScene
          beforeUrl={`${S}/hero-before.webp`}
          afterUrl={`${S}/hero-after.webp`}
          width={920}
          height={720}
        >
          <div className="p-5 sm:p-6">
            <BackgroundRemoverStudio />
          </div>
        </HeroScene>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- result -- */

const RESULT_POINTS = [
  {
    icon: Maximize,
    label: 'Full resolution',
    note: 'Original dimensions preserved.',
  },
  {
    icon: Scissors,
    label: 'Fine edges',
    note: 'Hair and soft boundaries retained.',
  },
  {
    icon: Layers,
    label: 'Transparent PNG',
    note: 'Ready for design or ecommerce.',
  },
  {
    icon: ImageOff,
    label: 'No watermark',
    note: 'The downloaded result stays clean.',
  },
];

function Result() {
  return (
    <section className="border-b border-line bg-paper-sunken" aria-labelledby="result">
      <div className="mx-auto max-w-[92rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow>The result</Eyebrow>
          <Heading id="result" className="mt-4">
            Drag it. This is the actual output.
          </Heading>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)] lg:gap-14">
          {/* The product's own slider, at the largest size on the page. */}
          <Reveal>
            <BeforeAfterSlider
              beforeUrl={`${S}/proof-before.webp`}
              afterUrl={`${S}/proof-after.webp`}
              alt="A portrait before and after its background was removed"
              maxViewportHeight={80}
            />
          </Reveal>

          <div className="lg:pt-4">
            <ul className="flex flex-col gap-7">
              {RESULT_POINTS.map((point) => (
                <li key={point.label} className="flex gap-4">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-paper-raised shadow-subtle">
                    <point.icon className="size-5 text-navy" aria-hidden />
                  </span>
                  <span>
                    <span className="block font-display text-[19px] font-semibold text-ink">
                      {point.label}
                    </span>
                    <span className="mt-1 block text-[15px] leading-relaxed text-ink-muted">
                      {point.note}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------- how it works -- */

const STEP_ICONS = [Upload, Sparkles, Download];

function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24" aria-labelledby="how">
      <Eyebrow>Three steps</Eyebrow>
      <Heading id="how" className="mt-4">
        How it works
      </Heading>

      <ol className="mt-12 grid gap-8 sm:grid-cols-3">
        {HOW_IT_WORKS.map((step, index) => {
          const Icon = STEP_ICONS[index] ?? Upload;
          return (
            <li key={step.name}>
              {/* A small product frame rather than an icon in a circle: each
                  step shows the state the interface is actually in. */}
              <div className="relative overflow-hidden rounded-lg border border-line bg-paper-sunken">
                <StepVisual index={index} />
                <span className="absolute left-3 top-3 flex size-7 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>

              <h3 className="mt-5 flex items-center gap-2 font-display text-[21px] font-semibold text-ink">
                <Icon className="size-4.5 text-accent" aria-hidden />
                {step.name}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{step.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The three states, drawn small. Compact by design — this is a breather. */
function StepVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="flex aspect-video items-center justify-center p-5">
        <span className="flex size-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-control bg-paper-raised">
          <Upload className="size-6 text-accent" aria-hidden />
          <span className="text-[12px] font-medium text-ink-subtle">Drop an image</span>
        </span>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="relative aspect-video overflow-hidden">
        <img
          src={`${S}/step-before.webp`}
          alt=""
          aria-hidden
          loading="lazy"
          className="size-full object-cover object-center"
        />
        {/* The same scan cue the hero uses, at small scale. */}
        <span
          className="absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-accent/45 to-transparent"
          style={{ animation: 'var(--animate-sweep)' }}
          aria-hidden
        />
      </div>
    );
  }

  return (
    <div className="checkerboard relative aspect-video">
      <img
        src={`${S}/step-after.webp`}
        alt=""
        aria-hidden
        loading="lazy"
        className="size-full object-contain"
      />
      <span className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-md border border-line bg-paper-raised px-2.5 py-1.5 shadow-subtle">
        <Download className="size-3.5 text-navy" aria-hidden />
        <span className="text-[11px] font-semibold text-ink">PNG</span>
      </span>
    </div>
  );
}

/* --------------------------------------------------- background swapping -- */

const SWAP_OPTIONS = [
  {
    id: 'transparent',
    label: 'Transparent',
    note: 'The download is a PNG with a real alpha channel — the default.',
  },
  {
    id: 'white',
    label: 'White',
    color: '#ffffff',
    note: 'What most marketplaces ask for in a product listing.',
  },
  {
    id: 'black',
    label: 'Black',
    color: '#0e0e10',
    note: 'Composited at full resolution, so the download matches the preview.',
  },
  {
    id: 'brand',
    label: 'ADH red',
    color: '#cd0f36',
    note: 'Any colour you like — the picker takes a hex value or a colour wheel.',
  },
  {
    id: 'photo',
    label: 'Photo',
    image: `${S}/backdrop.webp`,
    note: 'Backdrop images are set in the editor, one step on from the colour picker.',
  },
];

function BackgroundSection() {
  return (
    <section className="relative overflow-hidden bg-navy" aria-labelledby="backgrounds">
      <div className="dot-field pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden />

      <div className="relative mx-auto max-w-[88rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
          <div>
            <Eyebrow tone="light">Straight after removal</Eyebrow>
            <Heading id="backgrounds" tone="light" className="mt-4">
              A cut-out is the start, not the end.
            </Heading>
            <Lede tone="light" className="mt-6 max-w-md">
              Once the background is gone, put anything behind it. Try it — the preview updates as
              you pick.
            </Lede>
          </div>

          <Reveal>
            <BackgroundSwap
              cutoutUrl={`${S}/swap-after.webp`}
              alt="A model cut out from her surroundings, shown on the selected backdrop"
              width={600}
              height={800}
              options={SWAP_OPTIONS}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- editor -- */

function EditorSection() {
  return (
    <section className="border-b border-line" aria-labelledby="editor">
      <div className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Eyebrow>Built in</Eyebrow>
            <Heading id="editor" className="mt-4">
              There is an editor behind it.
            </Heading>
          </div>
          <Lede className="max-w-sm">
            Crop, scale, rotate, pad and recolour without opening another app. Every control here
            is live — try it.
          </Lede>
        </div>

        <Reveal className="mt-12">
          <EditorPreview
            cutoutUrl={`${S}/swap-after.webp`}
            alt="A cut-out in the editor's canvas"
            width={600}
            height={800}
            filename="lookbook-04.png"
            backdropUrl={`${S}/backdrop.webp`}
          />
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- batch -- */

/**
 * Five categories, deliberately unalike.
 *
 * This is the one section where unrelated subjects are the point: the feature
 * being demonstrated is "many different images in one run", and five variations
 * on the same subject would demonstrate the opposite. Everywhere else on the
 * page the imagery is deliberately narrow.
 */
const BATCH_ITEMS = [
  { filename: 'portrait-01.jpg', beforeUrl: `${S}/batch-portrait-before.webp`, afterUrl: `${S}/batch-portrait-after.webp` },
  { filename: 'sideboard-02.jpg', beforeUrl: `${S}/batch-furniture-before.webp`, afterUrl: `${S}/batch-furniture-after.webp` },
  { filename: 'lookbook-03.jpg', beforeUrl: `${S}/batch-fashion-before.webp`, afterUrl: `${S}/batch-fashion-after.webp` },
  { filename: 'product-04.png', beforeUrl: `${S}/batch-object-before.webp`, afterUrl: `${S}/batch-object-after.webp` },
  { filename: 'menu-05.jpg', beforeUrl: `${S}/batch-food-before.webp`, afterUrl: `${S}/batch-food-after.webp` },
];

function BatchSection() {
  return (
    <section className="border-b border-line bg-paper-sunken" aria-labelledby="batch">
      <div className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Eyebrow>In bulk</Eyebrow>
            <Heading id="batch" className="mt-4">
              Twenty at a time, one ZIP at the end.
            </Heading>
          </div>
          <Lede className="max-w-sm">
            Every image reports its own state. Anything that fails can be retried on its own,
            without losing the rest of the run.
          </Lede>
        </div>

        <div className="mt-12">
          <BatchStrip items={BATCH_ITEMS} />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- edge quality -- */

/**
 * Three different hard boundaries, each a native-resolution crop.
 *
 * Unequal spans, and three different aspect ratios, because these are three
 * photographs rather than three cards. Every crop is displayed at or below its
 * native pixel size so nothing is upscaled — the section's whole purpose is
 * that the masking can be inspected.
 */
const EDGE_CROPS = [
  {
    key: 'hair',
    beforeUrl: `${S}/edge-hair-before.webp`,
    afterUrl: `${S}/edge-hair-after.webp`,
    title: 'Hair',
    note: 'Loose strands against a bright interior.',
    width: 620,
    height: 620,
    span: 'lg:col-span-4',
  },
  {
    key: 'fabric',
    beforeUrl: `${S}/edge-fabric-before.webp`,
    afterUrl: `${S}/edge-fabric-after.webp`,
    title: 'Frayed fabric',
    note: 'Loose scarf threads over an open sky.',
    width: 660,
    height: 420,
    span: 'lg:col-span-5',
  },
  {
    key: 'fur',
    beforeUrl: `${S}/edge-fur-before.webp`,
    afterUrl: `${S}/edge-fur-after.webp`,
    title: 'Fur and whiskers',
    note: 'Pale, thin detail on dark foliage.',
    width: 420,
    height: 330,
    span: 'lg:col-span-3',
  },
];

function EdgeSection() {
  return (
    <section className="border-b border-line" aria-labelledby="edges">
      <div className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow>Where most tools fail</Eyebrow>
          <Heading id="edges" className="mt-4">
            Look at the edges.
          </Heading>
        </div>

        <EdgeCrops crops={EDGE_CROPS} className="mt-10" />
      </div>
    </section>
  );
}

/* --------------------------------------------- full resolution + privacy -- */

/**
 * The two claims that need evidence rather than a card, laid out as an
 * editorial spread: resolution takes the wide top half, privacy the narrower
 * block beneath it. Different weights, because they are not equally important.
 */
function ResolutionAndPrivacy() {
  return (
    <section className="border-b border-line bg-paper-sunken" aria-labelledby="resolution">
      <div className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8 lg:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Eyebrow>Nothing is downscaled</Eyebrow>
            <Heading id="resolution" className="mt-4">
              17 megapixels in. 17 megapixels out.
            </Heading>
          </div>
          <Lede className="max-w-sm">
            Detection runs on a small copy; the mask it produces is applied to your original. The
            free tier is not a preview of a paid one.
          </Lede>
        </div>

        <Reveal className="mt-12">
          <ResolutionProof
            beforeUrl={`${S}/res-before.webp`}
            afterUrl={`${S}/res-after.webp`}
            zoomBeforeUrl={`${S}/res-zoom-before.webp`}
            zoomAfterUrl={`${S}/res-zoom-after.webp`}
            zoomWidth={1020}
            zoomHeight={750}
            width={5040}
            height={3360}
          />
        </Reveal>

        <div className="mt-16 grid gap-10 border-t border-line pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-16">
          <div>
            <Eyebrow>Privacy</Eyebrow>
            <h3 className="mt-4 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink lg:text-[30px]">
              Your image passes through. It does not stay.
            </h3>
          </div>
          <PrivacyFlow />
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
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-24" aria-labelledby="comparison">
      <div className="max-w-2xl">
        <Eyebrow>Verified {COMPARISON_VERIFIED_ON}</Eyebrow>
        <Heading id="comparison" className="mt-4">
          What &ldquo;free&rdquo; actually means
        </Heading>
      </div>

      {/* The differences, at a size you can read across the room. The table
          below is the evidence, not the design. */}
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {HEADLINES.map((item) => (
          <div key={item.value} className="rounded-xl border border-line bg-paper-raised p-6">
            <item.icon className="size-6 text-accent" aria-hidden />
            <p className="mt-4 font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-ink">
              {item.value}
            </p>
            <p className="mt-1.5 text-[14px] text-ink-subtle">{item.note}</p>
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
                <th
                  scope="col"
                  className="bg-paper-sunken px-5 py-4 text-left font-display text-[13px] font-semibold text-ink-subtle"
                >
                  Feature
                </th>
                <th
                  scope="col"
                  className="bg-accent px-5 py-4 text-left font-display text-[13px] font-semibold text-white"
                >
                  {BRAND.name}
                </th>
                <th
                  scope="col"
                  className="bg-paper-sunken px-5 py-4 text-left font-display text-[13px] font-semibold text-ink-subtle"
                >
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
    </section>
  );
}

/* ------------------------------------------------------------- ecosystem -- */

function Ecosystem() {
  return (
    <section className="relative overflow-hidden bg-navy" aria-labelledby="ecosystem">
      <div className="dot-field pointer-events-none absolute inset-0 opacity-[0.12]" aria-hidden />

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-2xl">
          <Eyebrow tone="light">The ADH toolkit</Eyebrow>
          <Heading id="ecosystem" tone="light" className="mt-4">
            Built by {ORGANISATION.name}
          </Heading>
          <Lede tone="light" className="mt-6 max-w-lg">
            We build brands, websites and apps for clients in Atlanta — and free tools like this
            one for everyone else.
          </Lede>
        </div>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,1fr)]">
          <a
            href={ORGANISATION.url}
            rel="noopener"
            className="group flex flex-col justify-between rounded-lg border border-white/15 bg-white/[0.06] p-6 transition-colors hover:border-white/30"
          >
            <span className="font-display text-[17px] font-semibold text-white">
              {ORGANISATION.name}
            </span>
            <span className="mt-8 flex items-center gap-1.5 text-[13px] text-white/60">
              Design &amp; development studio
              <ArrowUpRight
                className="size-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </a>

          {/* The relationship, drawn rather than described. */}
          <div className="hidden items-center justify-center px-2 lg:flex" aria-hidden>
            <svg width="40" height="120" viewBox="0 0 40 120" fill="none" className="text-white/25">
              <path
                d="M0 60 H16 M16 24 V96 M16 24 H40 M16 96 H40"
                stroke="currentColor"
                strokeWidth="1.5"
              />
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
              <span className="font-display text-[17px] font-semibold text-white">{tool.name}</span>
              <span className="mt-8 flex items-center gap-1.5 text-[13px] text-white/60">
                Compress &amp; convert
                <ArrowUpRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </span>
            </a>
          ))}

          <div className="flex flex-col justify-between rounded-lg border border-accent bg-accent/15 p-6">
            <span className="font-display text-[17px] font-semibold text-white">{BRAND.name}</span>
            <span className="mt-8 inline-flex w-fit rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
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
      <Heading id="faq" className="mt-4">
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
      {/* Sized by the image rather than by a fixed box: the cut-out is 800x1270,
          so a fixed width left it floating with gaps instead of running off the
          edge. Width follows height, and it bleeds slightly past the right. */}
      <div className="pointer-events-none absolute -right-4 bottom-0 hidden lg:block" aria-hidden>
        <img
          src={`${S}/cta-after.webp`}
          alt=""
          loading="lazy"
          className="h-[26rem] w-auto"
        />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-20 sm:px-8 lg:py-28">
        <div className="max-w-xl">
          <h2 className="font-display text-[2.2rem] font-bold leading-[1.05] tracking-[-0.03em] text-white sm:text-[2.9rem]">
            Try it with your own photo.
          </h2>
          <Lede tone="light" className="mt-5">
            No account, no watermark, full resolution.
          </Lede>
          <div className="mt-9 flex flex-wrap items-center gap-4">
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
