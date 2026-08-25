import { serialiseJsonLd } from '@/lib/seo/structured-data';

/**
 * Emits a JSON-LD block.
 *
 * Rendered by a server component so the markup is in the initial HTML — a
 * crawler or AI fetcher that does not execute JavaScript still sees it, which
 * is most of them.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // Serialiser escapes `<`, so a value cannot close this script element.
      dangerouslySetInnerHTML={{ __html: serialiseJsonLd(data) }}
    />
  );
}
