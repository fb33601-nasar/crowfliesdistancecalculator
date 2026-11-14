import type { APIRoute } from 'astro';
import { SITE } from '../lib/site';
import pairs from '../data/pairs.json';
import pairRoutes from '../data/pair-routes.json';
import { RADIUS_MILES, RADIUS_KM, RADIUS_HOURS, RADIUS_MINUTES, RADIUS_DATE, radiusSlug, kmSlug, hourSlug, minuteSlug, MINUTE_MILES, minutesSlug, WALK_MILES, walkSlug } from '../data/radius-pages';

/**
 * One plain sitemap at /sitemap.xml. Every indexable page registers here with
 * the date its content last changed. Add new pages to this list as they ship.
 */
const pages = import.meta.glob<{ frontmatter: { slug: string; dateModified: string } }>(
  '../content/**/*.mdx',
  { eager: true },
);

export const GET: APIRoute = () => {
  const entries = Object.values(pages)
    .map((p) => p.frontmatter)
    .filter((f) => f?.slug)
    .concat(
      [...RADIUS_MILES.map(radiusSlug), ...RADIUS_KM.map(kmSlug), ...RADIUS_HOURS.map(hourSlug), ...RADIUS_MINUTES.map(minuteSlug), ...MINUTE_MILES.map(minutesSlug), ...WALK_MILES.map(walkSlug)].map((slug) => ({
        slug,
        dateModified: RADIUS_DATE,
      })),
    )
    .concat([{ slug: '/distance/', dateModified: RADIUS_DATE }])
    .concat(pairs.map((p) => ({ slug: `/distance/${p.slug}/`, dateModified: (pairRoutes as Record<string, { fetched?: string }>)[p.slug]?.fetched ?? RADIUS_DATE })))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const urls = entries
    .map((f) => {
      const loc = new URL(f.slug, SITE.url).toString();
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${f.dateModified}</lastmod>\n  </url>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
