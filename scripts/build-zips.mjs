// Builds public/data/zips.json from GeoNames US postal codes (CC BY 4.0), shipped in the zipcodes-us package.
// Row: [zip, place, state, county, lat, lon]
import { readFileSync, writeFileSync } from 'node:fs';
const file = new URL('../node_modules/zipcodes-us/data/US.txt', import.meta.url);
const rows = readFileSync(file, 'utf8')
  .split('\n')
  .map((l) => l.split('\t'))
  .filter((c) => c.length > 10 && /^\d{5}$/.test(c[1]) && c[9] && c[10])
  .map((c) => [c[1], c[2], c[4], c[5], +(+c[9]).toFixed(4), +(+c[10]).toFixed(4)])
  .sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(new URL('../public/data/zips.json', import.meta.url), JSON.stringify(rows));
console.log(`zips.json: ${rows.length} ZIP codes`);
