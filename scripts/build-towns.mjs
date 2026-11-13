// Builds public/data/towns.json: towns for radius lookups ("what is inside this circle").
// US, UK, Canada, Australia, Ireland and New Zealand down to small towns; elsewhere 25,000+.
// Source: GeoNames via the all-the-cities package. Row: [name, US state, country, lat, lon, population / 100].
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const all = require('all-the-cities');
const floor = { US: 5000, GB: 5000, CA: 5000, AU: 5000, IE: 3000, NZ: 3000 };
const rows = all
  .filter((c) => c.population >= (floor[c.country] ?? 25000))
  .sort((a, b) => b.population - a.population)
  .map((c) => [
    c.name === 'New York City' ? 'New York' : c.name,
    c.country === 'US' ? c.adminCode : '',
    c.country,
    +c.loc.coordinates[1].toFixed(3),
    +c.loc.coordinates[0].toFixed(3),
    Math.round(c.population / 100),
  ]);
writeFileSync(new URL('../public/data/towns.json', import.meta.url), JSON.stringify(rows));
console.log(`towns.json: ${rows.length} towns`);
