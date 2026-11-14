// Fetches driving routes for every pair in src/data/pairs.json from the FOSSGIS OSRM server
// (OpenStreetMap data) and writes src/data/pair-routes.json. Runs in GitHub Actions, one request
// a second to respect the server's usage policy. Existing results are kept unless --refresh is given.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const pairs = JSON.parse(readFileSync(new URL('../src/data/pairs.json', import.meta.url), 'utf8'));
const outFile = new URL('../src/data/pair-routes.json', import.meta.url);
const refresh = process.argv.includes('--refresh');
const routes = existsSync(outFile) && !refresh ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'crowfliesdistancecalculator.com route sampler (contact@crowfliesdistancecalculator.com)';

let fetched = 0;
for (const p of pairs) {
  if (routes[p.slug]) continue;
  const url = `https://routing.openstreetmap.de/routed-car/route/v1/driving/${p.a.lon},${p.a.lat};${p.b.lon},${p.b.lat}?overview=false&steps=true&alternatives=false`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const json = await res.json();
    const r = json.routes?.[0];
    if (json.code === 'Ok' && r) {
      routes[p.slug] = {
        distance: Math.round(r.distance),
        duration: Math.round(r.duration),
        via: (r.legs?.[0]?.summary ?? '').slice(0, 80),
        fetched: new Date().toISOString().slice(0, 10),
      };
    } else {
      routes[p.slug] = { distance: null, duration: null, via: '', fetched: new Date().toISOString().slice(0, 10), code: json.code ?? String(res.status) };
    }
    fetched++;
    console.log(p.slug, routes[p.slug].distance, routes[p.slug].duration, routes[p.slug].via);
  } catch (e) {
    console.warn('failed', p.slug, String(e));
  }
  await sleep(1100);
}
writeFileSync(outFile, JSON.stringify(routes, null, 1) + '\n');
console.log(`done, fetched ${fetched}, total ${Object.keys(routes).length}`);
