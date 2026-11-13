# crowfliesdistancecalculator.com

As the crow flies distance calculator. Astro + React islands + TypeScript, built to static files and served by Cloudflare Workers (static assets).

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Local dev server at http://localhost:4321 |
| `npm run build` | Build the site into `dist/` |
| `npm run data` | Rebuild `public/data/cities.json` (place suggestions) |
| `npm run icons` | Rebuild favicons and the social sharing image |

The sitemap (`/sitemap.xml`) is built from the `slug` and `dateModified` frontmatter of each file in `src/content/`.

## Deploying on Cloudflare Workers

1. Cloudflare dashboard → Workers & Pages → Create → Import a repository → pick this repo.
2. Build command: `npm run build`. Deploy command: `npx wrangler deploy` (reads `wrangler.jsonc`).
3. After the first deploy: the Worker → Settings → Domains & Routes → add `crowfliesdistancecalculator.com` and `www.crowfliesdistancecalculator.com` as custom domains (the domain's DNS must be on Cloudflare).
4. Every push to `main` rebuilds and redeploys.

## Layout

- `src/components/calculator/` the calculator (React): place search, globe, street map
- `src/lib/geo.ts` distance maths (Vincenty on WGS 84, haversine, bearings, midpoint)
- `src/content/` page content (MDX) and FAQ data, which also feeds the FAQ schema
- `src/components/figures/` diagrams and infographics, drawn at build time
- `src/data/routes.ts` city pairs used in the distance tables

## Services the calculator calls from the browser

- Place search: Photon (photon.komoot.io), OpenStreetMap data, no key
- Street map: OpenFreeMap tiles, no key. Falls back to built-in coastlines if unreachable.
