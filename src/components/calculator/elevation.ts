import type { LatLon } from '../../lib/geo';

// Elevation from the Terrain Tiles open dataset on AWS (Mapzen "terrarium" encoding),
// built from SRTM, 3DEP (USGS), GMTED, ETOPO1 and other public sources.
const TILE = (z: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const ZOOM = 14;
const SIZE = 256;
const tiles = new Map<string, Promise<Uint8ClampedArray>>();

function loadTile(z: number, x: number, y: number): Promise<Uint8ClampedArray> {
  const key = `${z}/${x}/${y}`;
  let p = tiles.get(key);
  if (!p) {
    p = new Promise<Uint8ClampedArray>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = SIZE;
        c.height = SIZE;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject(new Error('canvas'));
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, SIZE, SIZE).data);
      };
      img.onerror = () => reject(new Error('tile'));
      img.src = TILE(z, x, y);
    });
    p.catch(() => tiles.delete(key));
    tiles.set(key, p);
  }
  return p;
}

const decode = (d: Uint8ClampedArray, px: number, py: number) => {
  const i = (py * SIZE + px) * 4;
  return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
};

/** Elevation in metres above mean sea level at a point, bilinearly interpolated. */
export async function elevationAt(p: LatLon, z = ZOOM): Promise<number> {
  const n = 2 ** z;
  const latR = (Math.max(-85.0511, Math.min(85.0511, p.lat)) * Math.PI) / 180;
  const fx = ((p.lon + 180) / 360) * n * SIZE;
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n * SIZE;
  const x0 = Math.floor(fx - 0.5);
  const y0 = Math.floor(fy - 0.5);
  const tx = fx - 0.5 - x0;
  const ty = fy - 0.5 - y0;
  const sample = async (gx: number, gy: number) => {
    const wrapX = ((gx % (n * SIZE)) + n * SIZE) % (n * SIZE);
    const cy = Math.max(0, Math.min(n * SIZE - 1, gy));
    const data = await loadTile(z, Math.floor(wrapX / SIZE), Math.floor(cy / SIZE));
    return decode(data, wrapX % SIZE, cy % SIZE);
  };
  const [a, b, c, d] = await Promise.all([sample(x0, y0), sample(x0 + 1, y0), sample(x0, y0 + 1), sample(x0 + 1, y0 + 1)]);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

/** Elevations along a line of points, sampled in order. Zoom drops for long lines to limit downloads. */
export async function elevationProfile(points: LatLon[], lengthM: number): Promise<number[]> {
  const z = lengthM > 300_000 ? 10 : lengthM > 80_000 ? 11 : lengthM > 20_000 ? 12 : lengthM > 5_000 ? 13 : 14;
  return Promise.all(points.map((p) => elevationAt(p, z)));
}
