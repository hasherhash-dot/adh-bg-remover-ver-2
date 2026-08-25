import type { MetadataRoute } from 'next';
import { publicConfig } from '@/lib/config/public';

export default function robots(): MetadataRoute.Robots {
  const base = publicConfig.appUrl.replace(/\/$/, '');
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Nothing under these paths is useful to a crawler, and /api routes
        // would waste crawl budget on 405s.
        disallow: ['/api/', '/dashboard'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
