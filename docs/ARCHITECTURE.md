# Architecture

How the pieces fit, and why the seams are where they are.

The organising rule: **the UI must not know which model is running, and the
model must not dictate output quality.** Almost every boundary below exists to
protect one of those two properties.

---

## 1. Layers

```
┌───────────────────────────────────────────────────────────────────┐
│ Surfaces          Web app        Browser extension        curl     │
│                       │                  │                  │      │
│                       └──────────────────┴──────────────────┘      │
│                                    │  HTTP multipart               │
├────────────────────────────────────┼──────────────────────────────┤
│ Transport          src/app/api/*   ▼                               │
│                    validation · identity · rate limit · quota      │
│                    error serialisation                             │
├────────────────────────────────────┬──────────────────────────────┤
│ Domain             BackgroundRemovalService                        │
│                    orchestration only — owns no model code         │
├──────────────────┬─────────────────┴──────────────────────────────┤
│ Infrastructure   │ image/pipeline (sharp)                          │
│                  │ providers (ONNX · HTTP · Replicate · mock)      │
│                  │ persistence · storage · rate limiter · analytics│
└──────────────────┴─────────────────────────────────────────────────┘
```

Dependencies point downward only. `src/lib/bg-removal/types.ts` imports nothing
— it is the contract both sides agree on.

---

## 2. The request path

`POST /api/remove-background` with a 12MP JPEG:

| # | Step | Module | Notes |
| --- | --- | --- | --- |
| 1 | Identify caller | `api/http.ts` | API key if presented, else signed session cookie. An invalid key is refused, never downgraded to anonymous. |
| 2 | Rate limit | `api/rate-limit.ts` | Sliding window keyed by API key or client IP. |
| 3 | Quota check | `api/usage.ts` | Runs *before* processing, so a user never waits for work that will be rejected. |
| 4 | Parse multipart | `api/form.ts` | Size checked from `File.size` before any buffer is allocated. |
| 5 | Validate bytes | `image/validate.ts` | Magic-byte sniffing. Filename and client MIME type are ignored. |
| 6 | Normalise | `image/pipeline.ts` | HEIC → RGBA if needed; EXIF rotation baked in; pixel budget enforced. |
| 7 | Downscale | `image/pipeline.ts` | Longest edge to 1024px. Bounds inference memory and time. |
| 8 | Segment | provider | Returns an **alpha mask** (or a PNG whose alpha is extracted). |
| 9 | Composite | `image/pipeline.ts` | Mask scaled to the original and interleaved into RGBA at **full resolution**. |
| 10 | Render | `image/pipeline.ts` | Background fill applied; PNG/JPEG/WebP encoded. |
| 11 | Account | `api/usage.ts`, `history/server-history.ts` | Only on success. Metadata only — no image bytes. |
| 12 | Respond | route | Binary body plus `X-*` metadata headers, or JSON with base64. |

Steps 7–9 are the quality story. The model sees a 1024px image; the user gets
back their original resolution, because only the mask makes the round trip.

---

## 3. Key decisions

### The provider abstraction

`BackgroundRemovalProvider` has one required method, `segment()`. Providers may
return a raw mask or a finished PNG; the service normalises both to a mask
(`resolveMask`) so the full-resolution composite path is identical regardless of
engine.

This is why the default engine could be replaced with a hosted API by changing
one environment variable, and why all but a handful of the tests run without
loading a 130MB model.

### Mask, not image

Returning the model's own output would cap every result at the inference
resolution. Returning a mask decouples the two. The cost is one extra composite
pass; the benefit is that `BACKGROUND_REMOVAL_INFERENCE_SIZE` becomes a pure
speed/quality dial with no effect on output dimensions.

### Manual RGBA interleave

`compositeMask` builds the output buffer with an explicit loop rather than
`sharp.joinChannel`. In sharp 0.35, `joinChannel` with a raw single-channel
input silently discards the joined band, producing a fully opaque image — a
failure that looks like "the model did nothing". The loop is also cheaper than
an extra decode/encode round trip. This is covered by
`bg-removal-service.test.ts`, which asserts on real alpha distributions.

### Masks are single-channel, and that is checked

`sharp` does not guarantee that a single-band raw input stays single-band.
`sharp(raw, { channels: 1 }).resize(...).raw()` returns **three** bytes per
pixel, because the resize runs in sRGB and the band is replicated.

This shipped as a bug. `compositeMask` interleaves RGB and alpha by index, so
a mask with three bytes per pixel made every output pixel read mask byte `i`
instead of mask pixel `i`. The mask was effectively stretched along raster
order: the cutout came out diagonally sheared, with large parts of the subject
transparent. The guard at the time was `alpha.length < pixels`, which passed
because the buffer was *larger* than expected, not smaller.

Three things now prevent a recurrence:

1. `resizeMask` forces `toColourspace('b-w')` before `.raw()`.
2. `asSingleChannel` de-interleaves anything that still arrives with extra
   bands (they are replicas, so this is lossless) and throws when the length is
   not a whole number of bands.
3. `compositeMask` asserts **exact** buffer lengths before the loop. Stride-
   sensitive code must never accept 'at least this many bytes'.

The regression tests assert on *position*, not on aggregate statistics — a
shear barely changes the percentage of transparent pixels, which is why the
original suite stayed green while the output was visibly broken.

Mask scaling uses the `mitchell` kernel rather than `lanczos3`. A segmentation
mask is close to binary and lanczos overshoots at hard edges, producing a
bright halo outside the silhouette and a dark bite inside it.

### No animation library

Toast enter/exit, the processing sweep and every hover transition are CSS
keyframes. An animation library was used briefly for the toast alone and was
removed: 5.5MB on disk and ~121KB of shipped JavaScript for one slide-in that
the compositor handles natively. Exit animations are managed by marking a
toast `leaving`, letting the keyframe play, then unmounting it.

The same rule applies generally: visual polish should not cost the user
download size.

### Serialised inference

`LocalOnnxProvider` funnels calls through a promise chain. One ONNX session
running two inferences concurrently does not double throughput on CPU — it
doubles peak memory and slows both. Batch concurrency therefore defaults to 2 in
`InProcessJobRunner`, and the client-side queue uses 3 (bounded by network, not
CPU).

### Batch splits in two

- **Web app:** the browser calls the *single-image* endpoint N times with
  bounded concurrency. That is what makes per-image progress, per-image errors
  and per-image retry possible.
- **API:** one request in, one ZIP out. An API consumer wants a single call, and
  base64-in-JSON would inflate a 20-image batch by a third for nothing.

Both paths go through the same service. The batch route runs work through
`JobRunner`, which is shaped so a durable queue can replace it: to move to
BullMQ, implement the interface, return a job id, and add a status endpoint.

### One error catalogue

`src/lib/errors.ts` maps every `AppErrorCode` to a status, a user-safe message
and a `retryable` flag. `jsonError()` is the single place an error becomes a
response, and it emits only `{ code, message, retryable }`. Internal detail goes
to the log via `AppError.detail`. Tests assert that a provider throwing
`"CUDA out of memory at 0x7fff"` surfaces as a generic retryable message.

### Identity before accounts

Usage, quotas, keys and history all need a stable owner. Rather than defer that
until authentication exists, `getSession()` is called everywhere today and the
anonymous driver satisfies it with a signed http-only cookie. Adding real
accounts is one `AuthDriver` implementation; no call site changes.

---

## 4. Data and retention

| Data | Where | Lifetime |
| --- | --- | --- |
| Uploaded image | Server memory | The request. Never written to disk. |
| Result image | Response body; browser blob | Not retained server-side. |
| Visual history + thumbnails | Browser IndexedDB | Until cleared; capped at 50 items. |
| Processing metadata | `DocumentStore` | Last 100 per owner. No pixels. |
| Usage counters | `DocumentStore` | Keyed by owner + month. |
| API keys | `DocumentStore` | SHA-256 digest only. |

Two history modules exist deliberately: `history/local-history.ts` (IndexedDB,
holds the images) and `history/server-history.ts` (metadata only). A background
remover should not quietly become a photo archive.

`StorageDriver` defaults to `ephemeral`. `local`, `s3`, `r2` and `supabase` are
documented in `.env.example` as the intended extension points.

---

## 5. Client architecture

### `useImageJobs`

One hook owns the queue for one image or fifty; the state machine is identical.

- Jobs are keyed by id, never by index, so a concurrent completion cannot write
  into the wrong slot.
- Every object URL is tracked and revoked on removal and unmount. A long batch
  session would otherwise pin every original and every result in memory.
- Callbacks are held in refs so the concurrency pump does not re-create itself
  on every render.

### Honest progress

`api-client.ts` uploads via `XMLHttpRequest` because `fetch` still cannot report
upload progress. The bar shows **real byte progress** during upload, then
becomes indeterminate while the server works, because server-side inference has
no measurable percentage. Nothing here animates to 100% on a timer.

### Editor

`lib/client/compose.ts` holds pure drawing functions used by both the on-screen
preview and the export, so what the user sees is what downloads. The preview
canvas is capped at 1200px; the export renders at full source resolution.

`useEditorState` stores **settings**, not pixels — a raster undo stack for a
24MP image would exhaust memory in a few steps. Consecutive slider changes are
coalesced so one gesture is one undo step.

---

## 6. Extension architecture

```
context menu ──┐
               ├─→ service worker ──→ IndexedDB (job) ──→ result page
popup upload ──┘         │                                    ▲
                         └──→ POST /api/remove-background ─────┘
```

- **All network work lives in the service worker.** A popup is destroyed when it
  loses focus; a request started there would be aborted mid-flight. The popup
  writes the file to IndexedDB and hands off.
- **IndexedDB, not `chrome.storage`.** The latter serialises to JSON, which means
  base64 for image data. IndexedDB stores Blobs natively and works in an MV3
  worker.
- **No content scripts.** Nothing is injected into pages. The worker fetches the
  image directly using host permissions.
- **No secrets.** The extension ships no key. It calls the configured
  deployment; any key is the user's own, stored locally.
- **CORS is respected.** If a host refuses the download, that is reported with a
  suggested workaround (save locally, use the popup). No proxying around site
  protections.

MV3 workers are killed aggressively, so no state lives in module scope: the
context menu is recreated on install, and a job is durable from the moment it is
created.

---

## 7. Extension points

| Want to… | Do this | Files that change |
| --- | --- | --- |
| Use a different model | Implement `BackgroundRemovalProvider`, register it | `bg-removal/providers/*`, `registry.ts` |
| Add real accounts | Implement `AuthDriver` | `auth/session.ts` |
| Move to Postgres | Implement `DocumentStore` | `persistence/store.ts` |
| Share rate limits across instances | Implement `RateLimiter` | `api/rate-limit.ts` |
| Durable batch queue | Implement `JobRunner` | `batch/queue.ts`, batch route |
| Persist images | Implement the storage driver | `storage/`, `.env.example` |
| Enable payments | Implement the three Stripe functions | `billing/stripe.ts` |
| Send analytics somewhere | Implement `AnalyticsAdapter` | `analytics/index.ts` |

Each of these is one file plus a registration. That is the whole point of the
indirection — none of it is speculative generality; each interface has at least
two real implementations or one implementation plus a documented, tested
refusal.

---

## 8. Known limits

- **CPU-bound.** ~2–4s per image on a typical CPU. GPU execution providers exist
  for ONNX Runtime but are not configured.
- **Single-instance state.** The rate limiter and the file-backed store are
  per-process. Both are interface-swapped, not rewritten, to fix.
- **Saliency assumptions.** The model finds the *salient* subject. Flat graphics
  with no focal point, and scenes with several equally-weighted objects, are
  where it is weakest — as is anything transparent or highly reflective.
- **Batch is synchronous.** Bounded by `maxDuration`. A large-scale pipeline
  should move to the queue interface.
- **HEIC decode is pure JS**, so it is slower than the libvips path used for
  other formats.
