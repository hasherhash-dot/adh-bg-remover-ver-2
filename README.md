# ADH Background Remover

Upload an image, get a transparent PNG. A production-shaped background removal
product in three parts that share one engine:

- **Web app** — Next.js 16 App Router, upload → process → compare → download
- **HTTP API** — `POST /api/remove-background`, multipart in, PNG out
- **Browser extension** — Manifest V3, right-click any image on the web

Segmentation runs **locally** — no API key, no per-image cost, no outbound
network call at inference time. Two engines are available:

- **`adh-onnx`** (default) — our own BiRefNet-lite pipeline on ONNX Runtime.
  Better edges, and it needs a model file that is **not in this repository**.
  See [Getting the engine running](#getting-the-engine-running) below.
- **`local`** — [`@imgly/background-removal-node`](https://github.com/imgly/background-removal-js)
  (ISNet). Weights ship inside the npm package, so it works straight after
  `npm install` with nothing else to fetch. Kept as the standby.

---

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>. The page will load — but **uploading an image
will fail on a fresh clone** until you deal with the model. That is expected;
see the next section.

> **Note on install size.** `@imgly/background-removal-node` is ~130MB unpacked
> because it bundles the ONNX weights. That is a one-time download.

---

## Getting the engine running

The default provider is `adh-onnx`, which loads
`models/birefnet-lite-640.onnx` plus its `.onnx.data` sidecar — **173MB of
weights that are deliberately not committed.** Without them the API returns:

```
PROVIDER_MISCONFIGURED: ADH model not found at <repo>/models/birefnet-lite-640.onnx
```

**Option A — start now, no model file.** Switch to the bundled ISNet engine.
Its weights come from npm, so there is nothing to download:

```bash
echo "BACKGROUND_REMOVAL_PROVIDER=local" >> .env.local
```

Everything works — upload, batch, editor, API, extension. Edge quality on hair
and fur is lower than the ADH engine, and that is the only difference.

**Option B — run the real ADH engine.** You need two files in `models/`:

```
models/birefnet-lite-640.onnx        4.6 MB   the graph
models/birefnet-lite-640.onnx.data 173.0 MB   the weights
```

Both are required and must sit side by side — ONNX Runtime resolves the sidecar
by name relative to the `.onnx`. Ask the maintainer for a copy, or build them
yourself from the upstream weights: [`models/README.md`](models/README.md) has
the full export procedure, which needs Python and takes a while.

Check which engine you ended up on:

```bash
curl http://localhost:3000/api/health
```

---

## What actually works

Everything below is implemented and covered by tests, not scaffolded:

| Capability | Status |
| --- | --- |
| Background removal (real ONNX inference) | Working |
| Full-resolution output from a downscaled inference pass | Working |
| JPG / PNG / WEBP / AVIF input | Working |
| HEIC / HEIF input | Working (pure-JS decode) |
| Transparent PNG download | Working (`photo.jpg` → `photo-no-background.png`) |
| Solid-colour and replacement-image backgrounds | Working |
| Before/after slider with zoom, pan, fullscreen | Working |
| Editor: scale, position, crop ratio, rotate, undo/redo | Working |
| Batch processing with per-image progress and ZIP download | Working |
| API: single, batch, usage, history, keys, health | Working |
| API key issue / verify / revoke | Working |
| Rate limiting and monthly quotas | Working (in-memory driver) |
| Browser extension: context menu, popup, options, result page | Working |
| Payments | **Not implemented** — see [Billing](#billing) |
| User accounts | **Not implemented** — see [Authentication](#authentication) |

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the web app on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm test` | Run the full test suite |
| `npm run test:watch` | Vitest in watch mode |
| `npm run typecheck` | Typecheck app, extension and tests |
| `npm run ext:build` | Build the extension into `extension/dist` |
| `npm run ext:watch` | Rebuild the extension on change |
| `npm run ext:zip` | Build and package the extension as a zip |
| `npm run debug:pipeline` | Dump every pipeline stage as images + stats |

---

## Architecture at a glance

```
Browser / Extension / curl
          │  multipart POST
          ▼
  app/api/remove-background      validation · auth · rate limit · quota
          │
          ▼
  BackgroundRemovalService       the only orchestrator
          │
          ├── image/pipeline     decode → downscale → composite → encode  (sharp)
          │
          └── BackgroundRemovalProvider   ← swappable
                ├── adh-onnx     BiRefNet-lite via ONNX RT   (default)
                ├── local        ISNet, weights from npm      (standby)
                ├── http         any service returning a PNG
                ├── replicate    hosted model
                └── mock         deterministic, no AI        (tests)
```

The full write-up, including the data flow and why each boundary exists, is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### How background removal works

1. The upload is identified by **magic bytes**, never by its filename or the
   `Content-Type` the client claimed.
2. It is decoded with sharp, EXIF rotation is baked in, and the pixel count is
   checked against a budget to stop decompression bombs.
3. A copy is downscaled to `BACKGROUND_REMOVAL_INFERENCE_SIZE` (1024px on the
   longest edge by default) and handed to the provider.
4. The provider returns an **alpha mask**, not a finished image.
5. The mask is scaled back up and composited onto the **untouched original**.

Step 5 is the important one: inference cost is bounded by the downscale, but
output resolution is bounded only by your input. A 40MP upload returns a 40MP
cutout.

### Debugging the pipeline

When a cutout looks wrong, run the harness rather than guessing:

```bash
# put a few real photographs in debug/input/ first
npm run debug:pipeline
```

It runs the real model over every image in `debug/input/` and writes each
stage to `debug/output/<name>/`:

| File | What it shows |
| --- | --- |
| `01-original.png` | what the pipeline actually decoded |
| `02-inference-input.png` | the downscaled RGBA handed to the model |
| `03-model-output.png` | the model’s own RGBA result |
| `04-mask-model.png` | model alpha as greyscale — what the AI detected |
| `05-mask-resized.png` | alpha after scaling to full resolution |
| `06-final.png` | the finished transparent cutout |
| `07-final-on-magenta.jpg` | flattened onto magenta to expose fringing |

`debug/output/report.txt` records, for every stage: dimensions, **bytes per
pixel**, and alpha statistics (min, max, mean, % transparent, % opaque,
% soft edge). Comparing stage 4 against stage 5 is the fastest way to tell a
bad mask (model’s fault) from a corrupted one (ours).

Viewing `04-mask-model.png` answers the first question directly: if the
greyscale silhouette is clean, the model is fine and the bug is downstream.

### Swapping the engine

Implement one interface:

```ts
export interface BackgroundRemovalProvider {
  readonly id: string;
  readonly name: string;
  readonly isLocal: boolean;
  segment(input: ImageInput, options?: BackgroundRemovalOptions): Promise<SegmentationResult>;
  healthCheck?(): Promise<{ ok: boolean; detail?: string }>;
}
```

Register it in `src/lib/bg-removal/registry.ts` and select it with
`BACKGROUND_REMOVAL_PROVIDER`. Nothing in the UI or the API layer changes — the
UI has no idea which model is running.

A provider may return either a raw mask (preferred, keeps full resolution) or a
finished PNG; the service extracts the alpha channel from the latter and takes
the same compositing path.

---

## Environment variables

Full annotated list in [`.env.example`](.env.example). The ones that matter:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | Canonical URL, OG tags, sitemap |
| `BACKGROUND_REMOVAL_PROVIDER` | `local` | `local` · `http` · `replicate` · `mock` |
| `BACKGROUND_REMOVAL_MODEL` | `medium` | `small` · `medium` · `large` |
| `BACKGROUND_REMOVAL_INFERENCE_SIZE` | `1024` | Inference resolution cap (not output) |
| `MAX_UPLOAD_SIZE_MB` | `25` | Rejected before the bytes are buffered |
| `MAX_IMAGE_MEGAPIXELS` | `50` | Decompression-bomb guard |
| `MAX_BATCH_SIZE` | `20` | Server-side batch ceiling |
| `RATE_LIMIT_REQUESTS_PER_MINUTE` | `20` | Per identity |
| `AUTH_SECRET` | — | **Required in production.** Signs the session cookie |
| `PERSISTENCE_DRIVER` | `file` | `file` (dev) · `memory` · `postgres` (not implemented) |
| `STORAGE_DRIVER` | `ephemeral` | Images are not persisted by default |

Only `NEXT_PUBLIC_*` variables reach the browser. Server config is read through
`src/lib/config/env.ts`, which imports `server-only` — importing it from a
client component is a build error, so a secret cannot leak into the bundle by
accident.

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## API

### Remove one background

```bash
curl -X POST http://localhost:3000/api/remove-background \
  -F "image=@photo.jpg" \
  -o cutout.png
```

Form fields: `image` (required), `background` (`transparent` | `color` |
`image`), `backgroundColor`, `backgroundImage`, `format` (`png` | `jpeg` |
`webp`), `response` (`binary` | `json`).

Metadata comes back in headers so no second request is needed:

```
X-Image-Width / X-Image-Height / X-Image-Bytes
X-Processing-Time-Ms / X-Inference-Time-Ms / X-Provider
X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset
```

### Batch

```bash
curl -X POST http://localhost:3000/api/batch/remove-background \
  -F "images=@a.jpg" -F "images=@b.png" \
  -o results.zip
```

Returns a ZIP of PNGs plus `_manifest.json` describing every outcome. A batch
with some failures still returns 200 — check the manifest, not the status code.

### Other endpoints

`GET /api/usage` · `GET /api/history` · `DELETE /api/history` ·
`GET|POST /api/api-keys` · `DELETE /api/api-keys/:id` · `GET /api/health`

### Errors

Every failure has the same shape and a message written for end users:

```json
{
  "success": false,
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "That image is too large. Please upload a smaller file.",
    "retryable": false
  }
}
```

Stack traces and upstream detail stay in the server log. See
`src/lib/errors.ts` for the full code list.

### Authentication

Browser requests use a signed, http-only session cookie. Server-to-server
requests pass `Authorization: Bearer adh_live_…` or `X-API-Key`. Keys are stored
as SHA-256 digests, compared in constant time, and shown to the user exactly
once at creation.

---

## Browser extension

```bash
npm run ext:build
```

Then in a Chromium browser:

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select `extension/dist`.
3. Open the extension options and set the server address (defaults to
   `http://localhost:3000`).
4. Right-click any image → **Remove background**, or use the toolbar popup to
   upload a local file.

**It contains no secrets.** It calls whatever deployment you configure, and an
API key — if your deployment needs one — is entered by you and stored in the
browser's own extension storage.

It requests `<all_urls>` host permission for one reason: to download the image
you right-clicked, whichever site it is on. If a server refuses that download,
the extension says so and suggests saving the file and using the popup. It does
not attempt to work around site protections.

Architecture: a service worker owns all network work (so a closing popup cannot
abort a request), jobs live in IndexedDB (blobs, not base64), and the result
page subscribes to job updates. No content scripts are injected.

---

## Testing

```bash
npm test                       # everything
SKIP_MODEL_TESTS=1 npm test    # skip real-model tests for a fast loop
```

147 tests across ten files:

| File | Covers |
| --- | --- |
| `bg-removal-service.test.ts` | Service orchestration, formats, background fills, error mapping |
| `local-provider.test.ts` | **Real ONNX inference** — asserts the background is actually transparent and the subject opaque |
| `image-validation.test.ts` | Magic-byte sniffing, spoofed extensions, pixel budget, path traversal, EXIF |
| `api-routes.test.ts` | Every route handler, quota accounting, rate limiting, ZIP batch, error shapes |
| `infrastructure.test.ts` | Job runner concurrency, rate limiter, API keys, quotas, billing boundary |
| `extension-api.test.ts` | Extension client contract against a stubbed `chrome` |
| `mask-compositing.test.ts` | Mask scaling, channel count and **spatial** alpha placement |
| `filenames.test.ts` | Download naming, suffix de-duplication, byte/duration formatting |
| `storage.test.ts` | Storage drivers, TTL sweep, path-traversal safety |
| `components/upload-zone.test.tsx` | Drop, browse, keyboard, paste, disabled state |

The model tests are the ones that prove the product works rather than merely
wiring up — they assert on actual alpha values, not on the code path taken.

---

## Security

- **Content sniffing.** Type comes from magic bytes; filename and client MIME
  type are ignored.
- **Path traversal.** Filenames are stripped of directory components and are
  only ever used to name a download, never to build a filesystem path.
- **Decompression bombs.** Pixel count is checked from the header before the
  raster is materialised; sharp is additionally given `limitInputPixels`.
- **Size limits.** Enforced before the upload is buffered.
- **Secrets.** Server config is behind `server-only`. Nothing sensitive is sent
  to the browser or bundled into the extension.
- **API keys.** Stored hashed, compared in constant time, revocable.
- **Rate limiting.** Sliding window per identity, with `Retry-After`.
- **Error messages.** A fixed catalogue of user-safe strings; internals never
  reach the client.
- **Retention.** Uploads live in memory for the request and are then discarded.
  No image bytes are written to disk by default.

---

## Deployment

The app needs a **Node runtime** — the inference route uses native modules and
cannot run on an edge runtime. `sharp`, `onnxruntime-node` and the imgly package
are declared in `serverExternalPackages` so they are loaded from `node_modules`
rather than bundled.

Before deploying:

1. Set `AUTH_SECRET` and `NEXT_PUBLIC_APP_URL`.
2. Decide on the provider. `local` needs ~1GB RAM headroom and real CPU; a
   hosted provider trades that for latency and cost.
3. Replace the single-instance drivers if you run more than one instance:
   `RATE_LIMIT_DRIVER` and `PERSISTENCE_DRIVER` are both per-process today.
4. Raise the platform's request body limit above `MAX_UPLOAD_SIZE_MB`.
5. Note that serverless platforms with short execution limits may time out on
   large images; `maxDuration` is set to 120s (single) and 300s (batch).

```bash
npm run build && npm start
```

> **Do not remove the `overrides` block in `package.json`.** It pins
> `@imgly/background-removal-node` to the same `sharp` version as the app. Two
> copies of sharp load two libvips binaries into one process and segfault Node.

---

## Not implemented, on purpose

These are isolated behind interfaces rather than faked:

**Billing.** `src/lib/billing/stripe.ts` throws `NOT_IMPLEMENTED` until Stripe
is configured. The plan catalogue and quota enforcement in
`src/lib/billing/plans.ts` are real and enforced; only taking money is missing.
The pricing page says so plainly instead of showing a checkout button that goes
nowhere.

**Authentication.** `src/lib/auth/session.ts` defines an `AuthDriver` and ships
an anonymous driver that issues a signed cookie, so usage, quotas, keys and
ownership all work today. Adding real accounts means writing one driver that
returns a `Session` with a real `userId` — no caller changes.

**Durable storage.** `STORAGE_DRIVER` documents S3/R2/Supabase as future
options; the default keeps images in memory only. `PERSISTENCE_DRIVER=postgres`
throws at boot rather than silently falling back to a non-durable store.

**Distributed rate limiting and queues.** The limiter and the batch job runner
are per-process. Both sit behind interfaces (`RateLimiter`, `JobRunner`) sized
for a Redis or BullMQ implementation.

---

## Project layout

```
src/
  app/                    routes — marketing, dashboard, /api/*
  components/
    ui/                   design system primitives
    upload/ compare/ editor/ batch/ result/ processing/
    studio/               the upload → result flow
    marketing/ dashboard/ layout/
  lib/
    bg-removal/           types, service, registry, providers/
    image/                detect, validate, pipeline (sharp)
    api/                  http, form, rate-limit, usage
    auth/                 session, api-keys
    billing/              plans, stripe boundary
    batch/                job runner
    storage/ persistence/ history/ analytics/ client/ config/
  hooks/                  use-image-jobs, use-editor-state
extension/
  src/                    manifest, service worker, popup, result, options
  build.mjs               esbuild bundle + icon rasterisation
tests/                    vitest suites and fixtures
docs/ARCHITECTURE.md      services, data flow, extension points
```

---

## Licence and model attribution

Background removal uses `@imgly/background-removal-node` by IMG.LY, which
bundles an ISNet-derived segmentation model. Review IMG.LY's licence before
commercial deployment — it is not covered by this project's terms.
