import type { ToolLandingProps } from '@/components/marketing/tool-landing';

/**
 * Copy for the format- and use-case-specific landing pages.
 *
 * Kept as data so each route file stays a three-line wrapper, and so the
 * sitemap can enumerate these pages from a single source of truth.
 */

export interface LandingPage extends ToolLandingProps {
  slug: string;
  metaTitle: string;
  metaDescription: string;
}

export const LANDING_PAGES: Record<string, LandingPage> = {
  'remove-background-from-jpg': {
    slug: 'remove-background-from-jpg',
    metaTitle: 'Remove background from a JPG',
    metaDescription:
      'Upload a JPG and download a transparent PNG. JPEG cannot store transparency, so results are converted to PNG at full resolution.',
    eyebrow: 'JPG',
    title: 'Remove the background from a JPG',
    intro:
      'Drop in a .jpg or .jpeg photo and get a cut-out with a transparent background. Because JPEG has no alpha channel, the result comes back as a PNG.',
    points: [
      {
        title: 'Why the output is a PNG',
        body: 'The JPEG format has no alpha channel — it physically cannot store transparency. Saving a cut-out as JPEG would fill the removed area with white. PNG keeps the transparency intact, so that is what you get back.',
      },
      {
        title: 'JPEG artefacts and edges',
        body: 'Heavily compressed JPEGs carry blocky artefacts around high-contrast edges, which can soften a cut-out. Uploading the highest-quality version you have gives the model cleaner edges to work with.',
      },
      {
        title: 'Your resolution is preserved',
        body: 'A 6000 by 4000 JPEG comes back as a 6000 by 4000 PNG. Segmentation runs on a smaller copy for speed, then the mask is scaled back onto your original file.',
      },
      {
        title: 'Need a white background instead?',
        body: 'Open the editor after processing and pick a solid colour. White backgrounds are what most marketplaces ask for, and you can export straight from there.',
      },
    ],
    faq: [
      {
        question: 'Can I get a JPG back instead of a PNG?',
        answer:
          'Yes, but only with a background applied. Choose a solid colour in the editor and export. A JPEG with transparency is not possible, since the format has no alpha channel.',
      },
      {
        question: 'Does converting to PNG reduce quality?',
        answer:
          'No. PNG is lossless, so no further quality is lost. The file will usually be larger than the original JPEG, because lossless compression cannot match JPEG on photographic data.',
      },
      {
        question: 'What is the largest JPG I can upload?',
        answer: 'Up to 25MB per file, and up to 50 megapixels.',
      },
    ],
    related: [
      { href: '/remove-background-from-png', label: 'Remove background from PNG' },
      { href: '/product-photos', label: 'Product photos' },
    ],
  },

  'remove-background-from-png': {
    slug: 'remove-background-from-png',
    metaTitle: 'Remove background from a PNG',
    metaDescription:
      'Upload a PNG and get a clean transparent cut-out. Existing transparency is respected and the original resolution is preserved.',
    eyebrow: 'PNG',
    title: 'Remove the background from a PNG',
    intro:
      'Upload a .png file and get back a cut-out with a clean alpha channel — useful when a PNG has a solid or busy background baked in.',
    points: [
      {
        title: 'Already partly transparent?',
        body: 'That is fine. The image is flattened onto its own composite before segmentation, and the model decides the final alpha for every pixel, so a partially transparent source will not confuse the result.',
      },
      {
        title: 'No generation loss',
        body: 'PNG is lossless in and lossless out. The subject pixels in your download are the pixels you uploaded; only the alpha channel changes.',
      },
      {
        title: 'Soft edges are preserved',
        body: 'The mask is not binary. Hair, fur and motion blur come back with partial alpha values, so the cut-out composites naturally onto a new background instead of showing a hard fringe.',
      },
      {
        title: 'Large PNGs are handled',
        body: 'Screenshots and design-tool exports are often very large. Files up to 25MB and 50 megapixels are accepted, and inference memory stays bounded regardless of input size.',
      },
    ],
    faq: [
      {
        question: 'Will the file size change?',
        answer:
          'Usually it shrinks, because large uniform areas become fully transparent and compress extremely well. Detailed subjects can occasionally end up larger.',
      },
      {
        question: 'Does it work on logos and graphics?',
        answer:
          'It works best on photographs with a clear subject. Flat vector-style graphics with no obvious focal object can confuse a saliency model. For those, a manual selection in a vector tool is usually better.',
      },
      {
        question: 'Is transparency really preserved on download?',
        answer:
          'Yes. Downloads are RGBA PNGs. You can confirm it by dropping the file onto a coloured background in any editor.',
      },
    ],
    related: [
      { href: '/remove-background-from-jpg', label: 'Remove background from JPG' },
      { href: '/profile-pictures', label: 'Profile pictures' },
    ],
  },

  'product-photos': {
    slug: 'product-photos',
    metaTitle: 'Remove background from product photos',
    metaDescription:
      'Turn product shots into clean cut-outs on transparent or white backgrounds, in batches, ready for marketplace listings.',
    eyebrow: 'E-commerce',
    title: 'Clean cut-outs for product photos',
    intro:
      'Upload a whole shoot at once and get consistent cut-outs — transparent for your own layouts, or on the plain white most marketplaces require.',
    points: [
      {
        title: 'Batch a full shoot',
        body: 'Drop in up to twenty images at a time. Each one processes independently with its own progress and its own download, and you can take the whole set as a single ZIP.',
      },
      {
        title: 'Marketplace-ready white',
        body: 'Most catalogues expect a pure white background. Pick white in the editor and export. The subject keeps its soft edges rather than being crudely keyed out.',
      },
      {
        title: 'Consistent framing',
        body: 'The editor can scale, centre and pad the subject, and crop to a fixed ratio. Applying the same padding and 1:1 crop across a set makes a grid of listings look deliberate.',
      },
      {
        title: 'Reflective and transparent goods',
        body: 'Glassware, jewellery and chrome are the hard cases for any automatic tool. Check those at full zoom in the comparison view before publishing — the slider makes fringing easy to spot.',
      },
    ],
    faq: [
      {
        question: 'Can I process an entire catalogue?',
        answer:
          'The web app handles twenty per batch. For a continuous pipeline, call the API endpoint directly — it accepts the same files and returns a ZIP.',
      },
      {
        question: 'Will shadows be removed?',
        answer:
          'Cast shadows on the background are treated as background and removed. A contact shadow directly under the product is often kept, since the model reads it as part of the subject.',
      },
      {
        question: 'What resolution should I upload?',
        answer:
          'The highest you have. Output matches input resolution, and detail in the source gives the model more to work with along the edges.',
      },
    ],
    related: [
      { href: '/remove-background-from-jpg', label: 'Remove background from JPG' },
      { href: '/api', label: 'Automate with the API' },
    ],
  },

  'profile-pictures': {
    slug: 'profile-pictures',
    metaTitle: 'Remove background from a profile picture',
    metaDescription:
      'Cut yourself out of a photo and drop in a clean colour or a new background. Crop to a square and download a transparent PNG.',
    eyebrow: 'Portraits',
    title: 'A profile picture that stands out',
    intro:
      'Upload a photo of yourself, cut away whatever is behind you, and swap in a solid colour or a background of your choosing.',
    points: [
      {
        title: 'Hair is the hard part',
        body: 'The mask uses partial transparency rather than a hard cut, so flyaway strands blend into the new background instead of ending in a jagged outline.',
      },
      {
        title: 'Crop square in one step',
        body: 'Most platforms crop to a circle or a square. Use the 1:1 preset in the editor, position yourself with a drag, and export at the right shape the first time.',
      },
      {
        title: 'Pick a colour that works',
        body: 'A muted background makes a portrait read more clearly at small sizes than a busy photo. The editor has a colour picker, so you can match a brand colour exactly.',
      },
      {
        title: 'Your photo stays yours',
        body: 'Images are processed in memory and discarded when the response is sent. Nothing is written to disk on the server, and your history is kept only in this browser.',
      },
    ],
    faq: [
      {
        question: 'Does it work with more than one person in frame?',
        answer:
          'Usually yes — the model keeps the salient foreground, which is typically everyone in the group. If it keeps someone you wanted removed, crop them out before uploading.',
      },
      {
        question: 'Can I use my own background image?',
        answer:
          'Yes. Open the editor, upload a background image, then scale and position yourself over it before exporting.',
      },
      {
        question: 'Will glasses or headphones confuse it?',
        answer:
          'Generally not. Worn accessories are treated as part of the subject. Reflections in lenses can be imperfect, so it is worth a look at full zoom.',
      },
    ],
    related: [
      { href: '/remove-background-from-png', label: 'Remove background from PNG' },
      { href: '/remove-background-online', label: 'Remove background online' },
    ],
  },

  'remove-background-online': {
    slug: 'remove-background-online',
    metaTitle: 'Remove background online — free, no signup',
    metaDescription:
      'Remove an image background in your browser. No account, no watermark, no software to install. Download a transparent PNG.',
    eyebrow: 'Online tool',
    title: 'Remove a background online',
    intro:
      'Nothing to install and no account to create. Upload an image, wait a few seconds, and download the transparent PNG.',
    points: [
      {
        title: 'No watermark, no signup',
        body: 'The download is the finished image at full resolution. There is no watermark, no reduced-quality preview and no account wall in front of the result.',
      },
      {
        title: 'Works on your phone',
        body: 'The upload area accepts photos straight from the camera roll, and the comparison slider is built for touch — drag it with a finger.',
      },
      {
        title: 'Handles HEIC from iPhone',
        body: 'Photos taken on an iPhone are usually HEIC. They are decoded server-side and returned as PNG, so there is no conversion step to do first.',
      },
      {
        title: 'Or work offline in bulk',
        body: 'The same engine runs locally through the API. Self-host it and no image ever leaves your own machine.',
      },
    ],
    faq: [
      {
        question: 'Is it actually free?',
        answer:
          'The free tier covers 30 images a month with no card required. Because the model runs on this server rather than a paid third-party API, there is no per-image cost to pass on.',
      },
      {
        question: 'How long does it take?',
        answer:
          'Typically two to four seconds per image, plus upload time. Large files on a slow connection spend most of that time uploading.',
      },
      {
        question: 'Do you keep my images?',
        answer:
          'No. Uploads are held in memory for the duration of the request and discarded once the response is sent. The server stores only metadata such as dimensions and processing time.',
      },
    ],
    related: [
      { href: '/remove-background', label: 'Open the background remover' },
      { href: '/pricing', label: 'See pricing' },
    ],
  },
};

export const LANDING_SLUGS = Object.keys(LANDING_PAGES);
