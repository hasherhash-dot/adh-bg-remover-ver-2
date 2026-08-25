import type { Metadata } from 'next';
import Link from 'next/link';
import { Globe, KeyRound, Terminal } from 'lucide-react';
import { SiteShell } from '@/components/layout/site-shell';
import { CodeBlock } from '@/components/marketing/code-block';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'API',
  description:
    'POST an image to /api/remove-background and get a transparent PNG back. Batch endpoint, usage reporting and API key management included.',
  alternates: { canonical: '/api' },
};

const ENDPOINTS = [
  {
    method: 'POST',
    path: '/api/remove-background',
    summary: 'Remove the background from one image. Returns a PNG.',
  },
  {
    method: 'POST',
    path: '/api/batch/remove-background',
    summary: 'Process up to your plan limit in one request. Returns a ZIP.',
  },
  { method: 'GET', path: '/api/usage', summary: 'Current period usage and plan entitlements.' },
  { method: 'GET', path: '/api/history', summary: 'Metadata for recently processed images.' },
  { method: 'GET', path: '/api/api-keys', summary: 'List your API keys.' },
  { method: 'POST', path: '/api/api-keys', summary: 'Create a key. The secret is shown once.' },
  { method: 'DELETE', path: '/api/api-keys/:id', summary: 'Revoke a key immediately.' },
  { method: 'GET', path: '/api/health', summary: 'Readiness probe and active provider.' },
];

export default function ApiDocsPage() {
  return (
    <SiteShell>
      <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
        <header>
          <Badge variant="outline" className="mb-5">
            <Terminal className="size-3" aria-hidden />
            REST · multipart
          </Badge>
          <h1 className="font-display text-4xl font-bold tracking-[-0.03em] text-ink sm:text-5xl">
            API reference
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted">
            One endpoint does the work. Send an image as multipart form data, get a transparent PNG
            back with metadata in the response headers. No SDK required.
          </p>
        </header>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Quick start</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            From the browser session you are already in, no key is needed. For server-to-server
            calls, pass a key from the dashboard.
          </p>
          <CodeBlock
            className="mt-5"
            language="bash"
            code={`curl -X POST https://your-deployment.example/api/remove-background \\
  -H "Authorization: Bearer adh_live_YOUR_KEY" \\
  -F "image=@photo.jpg" \\
  -o cutout.png`}
          />
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Endpoints</h2>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {ENDPOINTS.map((endpoint) => (
              <li
                key={`${endpoint.method} ${endpoint.path}`}
                className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-baseline sm:gap-4"
              >
                <span className="flex shrink-0 items-baseline gap-2.5">
                  <span
                    className={`w-14 shrink-0 text-[11px] font-semibold uppercase tracking-wider ${
                      endpoint.method === 'POST'
                        ? 'text-success'
                        : endpoint.method === 'DELETE'
                          ? 'text-danger'
                          : 'text-ink-muted'
                    }`}
                  >
                    {endpoint.method}
                  </span>
                  <code className="font-mono text-[13px] text-ink">{endpoint.path}</code>
                </span>
                <span className="text-sm text-ink-muted sm:ml-auto sm:text-right">
                  {endpoint.summary}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Request parameters</h2>
          <div className="mt-5 overflow-x-auto scrollbar-slim">
            <table className="w-full min-w-2xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th scope="col" className="py-2.5 pr-4 font-medium text-ink-muted">Field</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">Type</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">Default</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-ink-muted">Notes</th>
                </tr>
              </thead>
              <tbody className="align-top">
                {[
                  ['image', 'file', '—', 'Required. JPG, PNG, WEBP, HEIC or AVIF.'],
                  ['background', 'string', 'transparent', 'transparent | color | image'],
                  ['backgroundColor', 'string', '#ffffff', 'Hex, used when background=color'],
                  ['backgroundImage', 'file', '—', 'Used when background=image'],
                  ['format', 'string', 'png', 'png | jpeg | webp — forced to png if transparent'],
                  ['response', 'string', 'binary', 'binary | json (base64 with metadata)'],
                ].map(([field, type, fallback, notes]) => (
                  <tr key={field} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4">
                      <code className="font-mono text-[13px] text-ink">{field}</code>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{type}</td>
                    <td className="px-4 py-3 text-ink-muted">{fallback}</td>
                    <td className="px-4 py-3 text-ink-muted">{notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Response headers</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            A successful binary response carries the metadata you would otherwise need a second
            request for.
          </p>
          <CodeBlock
            className="mt-5"
            language="http"
            code={`Content-Type: image/png
Content-Disposition: attachment; filename="photo.png"
X-Image-Width: 4000
X-Image-Height: 3000
X-Image-Bytes: 8123456
X-Processing-Time-Ms: 3421
X-Inference-Time-Ms: 2870
X-Provider: local-onnx
X-RateLimit-Remaining: 19`}
          />
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Errors</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Every failure returns the same JSON shape with an appropriate status code. Messages are
            written for end users, so they can be surfaced directly in your own UI.
          </p>
          <CodeBlock
            className="mt-5"
            language="json"
            code={`{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "That image is too large. Please upload a smaller file.",
    "retryable": false
  }
}`}
          />
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            Codes include <Code>INVALID_FILE_TYPE</Code>, <Code>FILE_TOO_LARGE</Code>,{' '}
            <Code>IMAGE_TOO_LARGE</Code>, <Code>CORRUPTED_IMAGE</Code>,{' '}
            <Code>PROCESSING_FAILED</Code>, <Code>PROCESSING_TIMEOUT</Code>,{' '}
            <Code>RATE_LIMITED</Code>, <Code>QUOTA_EXCEEDED</Code> and <Code>UNAUTHORIZED</Code>.
            Retry only when <Code>retryable</Code> is true.
          </p>
        </section>

        <section className="mt-14">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Batch</h2>
          <CodeBlock
            className="mt-5"
            language="bash"
            code={`curl -X POST https://your-deployment.example/api/batch/remove-background \\
  -H "Authorization: Bearer adh_live_YOUR_KEY" \\
  -F "images=@one.jpg" -F "images=@two.png" -F "images=@three.webp" \\
  -o results.zip`}
          />
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            The archive contains one PNG per successful image plus a{' '}
            <Code>_manifest.json</Code> describing every outcome. A batch where some images fail
            still returns 200 — check the manifest rather than the status code.
          </p>
        </section>

        <section id="extension" className="mt-14 scroll-mt-24">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Browser extension</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            The Manifest V3 extension in <Code>extension/</Code> talks to this same API. It holds no
            secrets: it calls your deployment&apos;s public endpoint, and the API key, if you set
            one, is stored in the browser&apos;s own extension storage under your control.
          </p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <Button variant="outline" asChild>
              <Link href="/resources#extension">
                <Globe aria-hidden />
                Install instructions
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/api-keys">
                <KeyRound aria-hidden />
                Manage API keys
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-14 rounded-lg border border-line bg-paper-sunken p-6">
          <h2 className="text-base font-semibold tracking-tight text-ink">Rate limits</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Single-image requests are limited per minute and batch requests per hour, both
            configurable per deployment. Responses include{' '}
            <Code>X-RateLimit-Limit</Code>, <Code>X-RateLimit-Remaining</Code> and{' '}
            <Code>X-RateLimit-Reset</Code>; a 429 also carries <Code>Retry-After</Code>.
          </p>
        </section>
      </div>
    </SiteShell>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-xs bg-paper-sunken px-1.5 py-0.5 font-mono text-[12.5px] text-ink">
      {children}
    </code>
  );
}
