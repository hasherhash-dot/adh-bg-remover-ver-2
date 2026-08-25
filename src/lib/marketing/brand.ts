/**
 * Brand and organisation facts — one source of truth.
 *
 * Everything user-visible and every structured-data emitter reads from here, so
 * the product name, the parent company and the claims we make about ourselves
 * cannot drift apart between the page copy, the <title>, and the JSON-LD that
 * search engines and AI answer engines actually parse.
 *
 * Only put verifiable facts in this file. Anything here can end up quoted in a
 * search result or an AI answer, where a wrong number is expensive.
 */

export const BRAND = {
  /** Product name. Parallel to "ADH Image Compressor". */
  name: 'ADH Background Remover',
  shortName: 'ADH Background Remover',
  /** Used where space is tight, e.g. the nav lockup. */
  wordmark: 'ADH',
  tagline: 'Remove image backgrounds in seconds',
  /** One sentence, reused as the meta description base. */
  description:
    'Remove the background from any image and download a transparent PNG at the full resolution you uploaded — free, with no account and no watermark.',
} as const;

export const ORGANISATION = {
  name: 'American Design Hub',
  legalName: 'American Design Hub',
  url: 'https://americandesignhub.com',
  logo: 'https://americandesignhub.com/logo.png',
  description:
    'American Design Hub is a full-service design and development agency in Atlanta, Georgia, offering branding, web design, digital marketing, mobile app development and animation.',
  founded: 'Atlanta, Georgia',
  address: {
    street: '1372 Peachtree St NE',
    locality: 'Atlanta',
    region: 'GA',
    postalCode: '30309',
    country: 'US',
  },
  telephone: '+1-888-251-7552',
  email: 'info@americandesignhub.com',
  /** Sibling tools in the same family. */
  siblings: [
    {
      name: 'ADH Image Compressor',
      url: 'https://compress.americandesignhub.com',
      description:
        'Compress, convert and resize JPG, PNG, WebP, AVIF, HEIC, PDF, BMP, TIFF and GIF.',
    },
  ],
} as const;

/**
 * Facts about this tool that we are willing to be quoted on.
 *
 * Each one is checked by the test suite or is a configured limit, not marketing
 * copy. `maxOutputMegapixels` matches MAX_IMAGE_MEGAPIXELS; `maxUploadMb`
 * matches MAX_UPLOAD_SIZE_MB.
 */
export const PRODUCT_FACTS = {
  maxUploadMb: 25,
  maxOutputMegapixels: 50,
  freeImagesPerMonth: 30,
  maxBatchSize: 20,
  typicalSeconds: '2–4',
  inputFormats: ['JPG', 'PNG', 'WEBP', 'AVIF', 'HEIC'],
  outputFormat: 'PNG (RGBA, transparent)',
  watermark: false,
  accountRequired: false,
  storesImages: false,
} as const;

/**
 * Competitor comparison.
 *
 * House rule, inherited from ADH Image Compressor: every competitor cell is
 * taken from that product's OWN documentation, with the source URL recorded, and
 * the table carries the date it was checked. No third-party blog round-ups — a
 * table people cite has to be defensible line by line.
 *
 * Only remove.bg is listed because it is the only competitor whose limits were
 * confirmed first-hand. Canva blocks automated access and Adobe Express did not
 * respond; publishing unverified numbers for them would undermine the rest.
 */
export const COMPARISON_VERIFIED_ON = 'August 2026';

export interface ComparisonRow {
  feature: string;
  ours: string;
  theirs: string;
  /** True when our column is the meaningfully better one. */
  advantage: boolean;
}

export const COMPETITOR = {
  name: 'remove.bg',
  sources: [
    'https://www.remove.bg/help/a/is-remove-bg-free-',
    'https://www.remove.bg/help/a/what-are-image-credits',
  ],
} as const;

export const COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: 'Free output resolution',
    ours: 'Full original resolution, up to 50 MP',
    theirs: 'Up to 0.25 MP (about 625 × 400)',
    advantage: true,
  },
  {
    feature: 'Full resolution on the free tier',
    ours: 'Included',
    theirs: 'Needs 1 credit per image',
    advantage: true,
  },
  {
    feature: 'Account required to download',
    ours: 'No',
    theirs: 'Yes, for credits and high resolution',
    advantage: true,
  },
  {
    feature: 'Watermark',
    ours: 'Never',
    theirs: 'None on the free low-resolution download',
    advantage: false,
  },
  {
    feature: 'Maximum supported resolution',
    ours: '50 MP',
    theirs: '50 MP on paid plans',
    advantage: false,
  },
  {
    feature: 'Where images are processed',
    ours: 'In memory, discarded when the response is sent',
    theirs: 'Uploaded to their service',
    advantage: true,
  },
  {
    feature: 'Self-hostable',
    ours: 'Yes — the model runs locally with no API key',
    theirs: 'No',
    advantage: true,
  },
];
