import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteShell } from '@/components/layout/site-shell';
import { CodeBlock } from '@/components/marketing/code-block';

export const metadata: Metadata = {
  title: 'Resources',
  description:
    'How background removal works, how to install the browser extension, and how to get better cut-outs.',
  alternates: { canonical: '/resources' },
};

export default function ResourcesPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
        <header>
          <h1 className="font-display text-4xl font-bold tracking-[-0.03em] text-ink sm:text-5xl">
            Resources
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted">
            What is happening under the hood, and how to get the most out of it.
          </p>
        </header>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
            How background removal works here
          </h2>
          <div className="mt-4 flex flex-col gap-4 text-sm leading-relaxed text-ink-muted">
            <p>
              Your image is decoded on the server and downscaled to a bounded size — 1024 pixels on
              the longest edge by default. That copy is fed to a salient-object segmentation model
              running under ONNX Runtime, which predicts an alpha value for every pixel: 0 for
              background, 255 for subject, and everything in between for soft edges like hair.
            </p>
            <p>
              The model output is only a mask. Rather than returning the model&apos;s downscaled
              image, the mask is scaled back up and composited onto your untouched original. That is
              why a 40-megapixel upload returns a 40-megapixel cut-out: the model bounds inference
              cost, not output quality.
            </p>
            <p>
              Because the mask has partial values rather than a hard on/off, the result composites
              cleanly onto a new background instead of showing the tell-tale halo of a
              threshold-based cut-out.
            </p>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
            Getting a better cut-out
          </h2>
          <ul className="mt-4 flex flex-col gap-3 text-sm leading-relaxed text-ink-muted">
            {[
              'Upload the highest-resolution version you have. Detail near the subject boundary is exactly what the model uses.',
              'Prefer a subject that is clearly the focal point. Saliency models look for the thing the photo is about; a flat lay of twenty equal objects is ambiguous.',
              'Watch out for subject-coloured backgrounds. A white shirt against a white wall is genuinely hard, for any tool.',
              'Check reflective and transparent objects at full zoom before publishing. Glass and chrome are where automatic segmentation is weakest.',
              'If the subject touches the frame edge, that is fine — but leaving a little margin usually produces a cleaner boundary.',
            ].map((tip) => (
              <li key={tip} className="flex gap-3">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-ink-subtle" aria-hidden />
                {tip}
              </li>
            ))}
          </ul>
        </section>

        <section id="extension" className="mt-14 scroll-mt-24">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">
            Installing the browser extension
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            The extension is a Manifest V3 add-on for Chromium browsers — Chrome, Edge, Brave, Arc
            and Opera. It is loaded unpacked from the repository rather than from a store.
          </p>

          <ol className="mt-6 flex list-decimal flex-col gap-4 pl-5 text-sm leading-relaxed text-ink-muted marker:font-medium marker:text-ink">
            <li>
              Build it from the project root:
              <CodeBlock className="mt-2.5" language="bash" code="npm run ext:build" />
            </li>
            <li>
              Open <code className="rounded-xs bg-paper-sunken px-1.5 py-0.5 font-mono text-[12.5px] text-ink">chrome://extensions</code>{' '}
              and turn on <strong className="font-medium text-ink">Developer mode</strong>.
            </li>
            <li>
              Choose <strong className="font-medium text-ink">Load unpacked</strong> and select the{' '}
              <code className="rounded-xs bg-paper-sunken px-1.5 py-0.5 font-mono text-[12.5px] text-ink">
                extension/dist
              </code>{' '}
              folder.
            </li>
            <li>
              Open the extension&apos;s options and point it at your deployment. It defaults to{' '}
              <code className="rounded-xs bg-paper-sunken px-1.5 py-0.5 font-mono text-[12.5px] text-ink">
                http://localhost:3000
              </code>
              .
            </li>
            <li>
              Right-click any image on a page and choose{' '}
              <strong className="font-medium text-ink">Remove background</strong>, or click the
              toolbar icon to upload a local file.
            </li>
          </ol>

          <p className="mt-6 text-sm leading-relaxed text-ink-muted">
            The extension stores no secrets. It calls your deployment the same way the web app does,
            and any API key you configure lives in your browser&apos;s extension storage.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] text-ink">Privacy</h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Uploads are held in memory for the length of the request and discarded once the response
            is written. Nothing is saved to disk on the server, and the default engine performs no
            outbound network calls at all — the model runs in-process. The server records only
            metadata: filename, dimensions, byte size and processing time. Your visual history lives
            in this browser&apos;s IndexedDB and can be cleared from the{' '}
            <Link href="/dashboard/history" className="font-medium text-ink underline underline-offset-4">
              dashboard
            </Link>
            .
          </p>
        </section>
      </div>
    </SiteShell>
  );
}
