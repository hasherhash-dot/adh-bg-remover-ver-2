import { Cpu, Monitor, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Privacy, drawn as the architecture rather than asserted as a badge.
 *
 * Three nodes and a terminating one. The last node is the point: after the
 * response is sent there is no downstream store, so the diagram ends in a
 * discard instead of the cloud-database icon these sections usually finish on.
 *
 * ACCURACY. This is checked against the code, not written from the marketing
 * copy, because a privacy claim is the worst possible place to be approximately
 * right:
 *
 *   src/lib/storage/index.ts   `EphemeralStorage` is the default driver and its
 *                              `put` returns null — image bytes are never
 *                              written anywhere.
 *   api/remove-background      calls `persistResult`, which is a no-op unless a
 *                              durable STORAGE_DRIVER is configured, and
 *                              `appendHistory`, which DOES record filename,
 *                              dimensions, byte size and timing.
 *
 * So the honest claim is "the image is discarded", not "nothing is recorded".
 * The caption says exactly that. Do not shorten it to the tidier sentence.
 */

const NODES = [
  {
    icon: Monitor,
    title: 'Your browser',
    body: 'The file is sent straight to the endpoint over HTTPS.',
  },
  {
    icon: Cpu,
    title: 'ADH processing',
    body: 'Decoded, segmented and composited in memory on our own server.',
  },
  {
    icon: Trash2,
    title: 'Discarded',
    body: 'The response is streamed back and the image data is released.',
    terminal: true,
  },
];

export function PrivacyFlow({ className }: { className?: string }) {
  return (
    <div className={className}>
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
        {NODES.map((node, index) => (
          <li key={node.title} className="flex flex-1 items-center gap-3 sm:block">
            <div
              className={cn(
                'flex h-full flex-col rounded-lg border p-4',
                node.terminal
                  ? 'border-dashed border-control bg-transparent'
                  : 'border-line bg-paper-raised shadow-subtle',
              )}
            >
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-md',
                  node.terminal ? 'bg-paper-sunken text-ink-subtle' : 'bg-navy text-white',
                )}
              >
                <node.icon className="size-4.5" aria-hidden />
              </span>
              <p
                className={cn(
                  'mt-3 font-display text-[15px] font-semibold',
                  node.terminal ? 'text-ink-subtle' : 'text-ink',
                )}
              >
                {node.title}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">{node.body}</p>
            </div>

            {/* Connector. Fades out into the terminal node rather than
                continuing to another box, because nothing follows it. */}
            {index < NODES.length - 1 && (
              <span
                className="hidden h-px w-6 shrink-0 self-center bg-gradient-to-r from-line-strong to-control sm:block"
                aria-hidden
              />
            )}
          </li>
        ))}
      </ol>

      <p className="mt-5 font-display text-[19px] font-semibold tracking-tight text-ink">
        Processed. Returned. Discarded.
      </p>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-muted">
        Your image is held in memory only for as long as the request takes and is not written to
        storage in the default configuration. A usage record — filename, dimensions, file size and
        how long it took — is kept so your own history and quota work. The picture itself is not
        part of that record.
      </p>
    </div>
  );
}
