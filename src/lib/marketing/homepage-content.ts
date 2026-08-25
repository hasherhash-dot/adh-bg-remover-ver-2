import { PRODUCT_FACTS } from './brand';

/**
 * Homepage copy, kept as data.
 *
 * It lives outside the component because the FAQ and the how-to steps are also
 * emitted as JSON-LD, and structured data that disagrees with the visible page
 * is worse than none. Both read this file, so they cannot drift.
 *
 * Editorial rules:
 *  - Every number is a real configured limit or a measured result.
 *  - Say a benefit once. Repeating it in three sections is padding, not
 *    authority.
 *  - "AI" appears only where it explains something. The reader cares about the
 *    cutout, not the architecture.
 *  - Limitations are stated plainly.
 */

export const HOW_IT_WORKS = [
  {
    name: 'Upload your image',
    text: `Drag a file in, paste from your clipboard, or pick one from your device. JPG, PNG, WEBP, AVIF and HEIC are accepted, up to ${PRODUCT_FACTS.maxUploadMb}MB.`,
  },
  {
    name: 'The background is removed',
    text: 'The subject is detected automatically and separated from everything behind it, including soft edges like hair.',
  },
  {
    name: 'Download your PNG',
    text: `A transparent PNG at the size you uploaded — no watermark, no account. Most images finish in ${PRODUCT_FACTS.typicalSeconds} seconds.`,
  },
];

/**
 * What the user gets back. Three claims, each one checkable.
 *
 * The homepage renders these next to a real before/after result rather than as
 * a text grid, so the wording only has to carry the detail the picture cannot.
 */
export const RESULT_QUALITY = [
  {
    heading: 'Original dimensions kept',
    body: 'A 24-megapixel photo returns a 24-megapixel cut-out.',
  },
  {
    heading: 'Soft edges, not a hard cut',
    body: 'Hair and fur keep partial transparency, so nothing looks stamped out.',
  },
  {
    heading: 'A genuine transparent PNG',
    body: 'RGBA with a real alpha channel, ready for any design tool.',
  },
];

/**
 * FAQ — seven questions people genuinely ask.
 *
 * Trimmed from twelve. Questions that existed to add schema volume, or that
 * repeated an answer already given on the page, were removed.
 */
export const FAQ = [
  {
    question: 'Is this background remover free?',
    answer: `Yes. You can remove ${PRODUCT_FACTS.freeImagesPerMonth} image backgrounds a month at full resolution, with no account and no watermark.`,
  },
  {
    question: 'Do I get the full resolution for free?',
    answer:
      'Yes. Your download is the same size as the file you uploaded, up to 50 megapixels. This is the main way this tool differs from most free background removers, which return a low-resolution preview and charge for the full-size version.',
  },
  {
    question: 'Do you store my images?',
    answer:
      'No. Your image is held in memory for the length of the request and discarded once the result is sent. Nothing is written to disk on the server, and your history is stored in your own browser.',
  },
  {
    question: 'Which file formats can I upload?',
    answer:
      'JPG, PNG, WEBP, AVIF and HEIC, up to 25MB per file. HEIC photos straight from an iPhone work without converting them first. Results come back as PNG, because it is the common format that can carry transparency.',
  },
  {
    question: 'How well does it handle hair and fine edges?',
    answer:
      'Edges keep partial transparency rather than being cut hard, so individual strands blend into a new background. Glass, chrome and other see-through or highly reflective subjects are the hard case for any automatic tool — worth checking at full zoom before you publish.',
  },
  {
    question: 'Can I change the background instead of making it transparent?',
    answer:
      'Yes. After processing you can choose transparent, white, black or a custom colour, and the preview updates immediately. The editor also lets you crop, scale, rotate, reposition the subject and drop in your own background image.',
  },
  {
    question: 'Why is my PNG larger than the JPEG I uploaded?',
    answer:
      'PNG compression is lossless, so it cannot match JPEG on photographic data. Nothing was thrown away to make your image transparent — that is the trade. Images with a large removed background often come out smaller instead.',
  },
];
