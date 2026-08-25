import { BRAND, ORGANISATION, PRODUCT_FACTS } from '@/lib/marketing/brand';
import { publicConfig } from '@/lib/config/public';

/**
 * JSON-LD builders.
 *
 * Two audiences read this and neither reads the visible page the way a person
 * does: search engines deciding whether to show a rich result, and AI answer
 * engines deciding whether they can safely quote you. Both reward explicit
 * entity relationships — this tool is *published by* a real company at a real
 * address — and specific, checkable claims.
 *
 * Every value comes from `brand.ts` so the markup cannot contradict the copy.
 */

const base = () => publicConfig.appUrl.replace(/\/$/, '');

/** Stable @id values let the graph reference one entity from several places. */
const ids = {
  organisation: () => `${ORGANISATION.url}/#organization`,
  website: () => `${base()}/#website`,
  application: () => `${base()}/#application`,
};

export function organisationSchema() {
  return {
    '@type': 'Organization',
    '@id': ids.organisation(),
    name: ORGANISATION.name,
    legalName: ORGANISATION.legalName,
    url: ORGANISATION.url,
    logo: ORGANISATION.logo,
    description: ORGANISATION.description,
    address: {
      '@type': 'PostalAddress',
      streetAddress: ORGANISATION.address.street,
      addressLocality: ORGANISATION.address.locality,
      addressRegion: ORGANISATION.address.region,
      postalCode: ORGANISATION.address.postalCode,
      addressCountry: ORGANISATION.address.country,
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: ORGANISATION.telephone,
      email: ORGANISATION.email,
      contactType: 'customer support',
      areaServed: 'US',
      availableLanguage: 'English',
    },
  };
}

/**
 * The tool itself. `WebApplication` rather than `SoftwareApplication` because
 * it runs in the browser with nothing to install, and the offer is stated
 * explicitly so "is it free?" has a machine-readable answer.
 */
export function applicationSchema() {
  return {
    '@type': 'WebApplication',
    '@id': ids.application(),
    name: BRAND.name,
    url: base(),
    applicationCategory: 'MultimediaApplication',
    applicationSubCategory: 'Image editing',
    operatingSystem: 'Any modern web browser',
    browserRequirements: 'Requires JavaScript',
    description: BRAND.description,
    publisher: { '@id': ids.organisation() },
    provider: { '@id': ids.organisation() },
    isAccessibleForFree: true,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
      description: `${PRODUCT_FACTS.freeImagesPerMonth} images per month at full resolution, no account required`,
    },
    // Describes what a visitor can actually do on this page. The HTTP API and
    // the browser extension are implemented but not reachable as a normal user
    // journey yet, so listing them here would overstate the product.
    featureList: [
      'Automatic background removal',
      'Transparent PNG output at the original resolution',
      'Background replacement with a solid colour',
      'Crop, scale, rotate and reposition the subject',
      'Batch processing with ZIP download',
      'Before and after comparison with zoom',
    ],
    fileFormat: PRODUCT_FACTS.inputFormats.map((f) => `image/${f.toLowerCase()}`),
  };
}

export function websiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': ids.website(),
    url: base(),
    name: BRAND.name,
    description: BRAND.description,
    publisher: { '@id': ids.organisation() },
    inLanguage: 'en-US',
  };
}

export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * FAQPage.
 *
 * Answers must be plain text and must match what a visitor sees on the page —
 * marking up an answer the page does not contain is a manual-action risk, and
 * an AI engine that quotes markup contradicting the page is worse than one that
 * quotes nothing.
 */
export function faqSchema(entries: FaqEntry[]) {
  return {
    '@type': 'FAQPage',
    mainEntity: entries.map((entry) => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  };
}

export interface HowToStep {
  name: string;
  text: string;
}

export function howToSchema(steps: HowToStep[]) {
  return {
    '@type': 'HowTo',
    name: 'How to remove the background from an image',
    description:
      'Upload an image, let the segmentation model separate the subject, then download a transparent PNG at the original resolution.',
    totalTime: 'PT10S',
    tool: { '@type': 'HowToTool', name: BRAND.name },
    supply: { '@type': 'HowToSupply', name: 'A JPG, PNG, WEBP, AVIF or HEIC image' },
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      url: `${base()}/#step-${index + 1}`,
    })),
  };
}

export function breadcrumbSchema(trail: Array<{ name: string; url: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Wraps nodes in a single @graph.
 *
 * One graph beats several loose script tags: entities can reference each other
 * by @id, so the tool, the site and the company are understood as one connected
 * thing rather than three unrelated blobs.
 */
export function buildGraph(nodes: object[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': nodes,
  };
}

/**
 * Serialises JSON-LD for embedding.
 *
 * `<` is escaped so a value can never terminate the surrounding script element,
 * which is the one XSS route a JSON-LD block has.
 */
export function serialiseJsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
