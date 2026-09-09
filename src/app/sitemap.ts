import type { MetadataRoute } from 'next';
import { publicConfig } from '@/lib/config/public';
import { LANDING_SLUGS } from '@/lib/marketing/landing-content';

/** Public routes only — the dashboard is noindex and excluded deliberately. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = publicConfig.appUrl.replace(/\/$/, '');
  const lastModified = new Date();

  const staticRoutes = [
    { path: '', priority: 1 },
    { path: '/remove-background', priority: 0.9 },
    { path: '/tools', priority: 0.7 },
    { path: '/pricing', priority: 0.7 },
    { path: '/api', priority: 0.6 },
    { path: '/resources', priority: 0.6 },
    { path: '/privacy-policy', priority: 0.3 },
    { path: '/terms', priority: 0.3 },
  ];

  return [
    ...staticRoutes.map((route) => ({
      url: `${base}${route.path}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: route.priority,
    })),
    ...LANDING_SLUGS.map((slug) => ({
      url: `${base}/${slug}`,
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
  ];
}
