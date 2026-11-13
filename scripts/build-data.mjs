// Builds public/data/cities.json: a compact list of well-known cities used for
// instant place suggestions. Source: GeoNames via the all-the-cities package.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const all = require('all-the-cities');

const floor = { US: 100000, GB: 80000, CA: 120000, AU: 120000, IE: 50000, NZ: 80000 };
const byPop = [...all].sort((a, b) => b.population - a.population);
const keep = new Map();
for (const c of byPop.slice(0, 1400)) keep.set(c.cityId, c);
for (const c of byPop) if (floor[c.country] && c.population >= floor[c.country]) keep.set(c.cityId, c);

const rows = [...keep.values()]
  .sort((a, b) => b.population - a.population)
  .map((c) => [
    c.name === 'New York City' ? 'New York' : c.name,
    c.country === 'US' ? c.adminCode : '',
    c.country,
    +c.loc.coordinates[1].toFixed(4),
    +c.loc.coordinates[0].toFixed(4),
  ]);
mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/data/cities.json', import.meta.url), JSON.stringify(rows));
console.log(`cities.json: ${rows.length} cities`);
