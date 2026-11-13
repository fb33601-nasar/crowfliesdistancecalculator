// Builds public/data/airports.json from OurAirports (public domain):
// airports with scheduled passenger service and an IATA code, plus their time zone.
// Row: [IATA, ICAO, name, city, country, lat, lon, size (3 large, 2 medium, 1 small), time zone]
// Usage: node scripts/build-airports.mjs [path/to/airports.csv]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const tzlookup = require('tz-lookup');
const SRC = 'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/airports.csv';

function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const text = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await (await fetch(SRC)).text();
const [head, ...rows] = parseCSV(text);
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const SIZE = { large_airport: 3, medium_airport: 2, small_airport: 1 };
const out = [];
const seen = new Set();
for (const r of rows) {
  const size = SIZE[r[col.type]];
  const iata = r[col.iata_code];
  if (!size || r[col.scheduled_service] !== 'yes' || !/^[A-Z]{3}$/.test(iata) || seen.has(iata)) continue;
  seen.add(iata);
  const lat = +(+r[col.latitude_deg]).toFixed(4);
  const lon = +(+r[col.longitude_deg]).toFixed(4);
  let tz = '';
  try { tz = tzlookup(lat, lon); } catch {}
  out.push([iata, r[col.icao_code] || r[col.gps_code] || '', r[col.name], r[col.municipality], r[col.iso_country], lat, lon, size, tz]);
}
out.sort((a, b) => b[7] - a[7] || a[0].localeCompare(b[0]));
writeFileSync(new URL('../public/data/airports.json', import.meta.url), JSON.stringify(out));
console.log(`airports.json: ${out.length} airports`);
