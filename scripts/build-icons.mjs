// Renders the favicon set and the social sharing image from SVG. Run when the logo changes.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
const pub = (f) => new URL(`../public/${f}`, import.meta.url);
const logo = readFileSync(pub('favicon.svg'));
const square = logo.toString().replace('rx="9"', 'rx="0"');

const png = (svg, size) => sharp(Buffer.from(svg), { density: 600 }).resize(size, size).png().toBuffer();
writeFileSync(pub('favicon-96.png'), await png(logo, 96));
writeFileSync(pub('icon-192.png'), await png(square, 192));
writeFileSync(pub('icon-512.png'), await png(square, 512));
writeFileSync(pub('apple-touch-icon.png'), await png(square, 180));

// favicon.ico holding one 32px PNG
const p32 = await png(logo, 32);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6); head.writeUInt8(32, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
head.writeUInt32LE(p32.length, 14); head.writeUInt32LE(22, 18);
writeFileSync(pub('favicon.ico'), Buffer.concat([head, p32]));

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#131736"/>
  <circle cx="930" cy="330" r="250" fill="#1a2050" stroke="#2c3368" stroke-width="2"/>
  <ellipse cx="930" cy="330" rx="250" ry="90" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>
  <ellipse cx="930" cy="330" rx="100" ry="250" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>
  <ellipse cx="930" cy="330" rx="190" ry="250" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>
  <path d="M760 420 Q900 250 1100 250" fill="none" stroke="#ff5fb4" stroke-width="9" stroke-linecap="round"/>
  <circle cx="760" cy="420" r="20" fill="#fff" stroke="#c4157a" stroke-width="8"/>
  <circle cx="1100" cy="250" r="20" fill="#fff" stroke="#c4157a" stroke-width="8"/>
  <g transform="translate(80 84) scale(1.9)"><rect width="40" height="40" rx="9" fill="#fff"/><path d="M8.5 19.5Q14 9.5 20 16.5 26 9.5 31.5 19.5" fill="none" stroke="#161b3d" stroke-width="3.4" stroke-linecap="round"/><path d="M10 28.5H30" stroke="#c4157a" stroke-width="2.8" stroke-linecap="round"/><circle cx="10" cy="28.5" r="3.1" fill="#c4157a"/><circle cx="30" cy="28.5" r="3.1" fill="#c4157a"/></g>
  <g font-family="Archivo, Arial, Helvetica, sans-serif" fill="#fff" font-weight="800">
    <text x="80" y="290" font-size="76" letter-spacing="-2.5">As the Crow Flies</text>
    <text x="80" y="376" font-size="76" letter-spacing="-2.5">Distance Calculator</text>
    <text x="80" y="450" font-size="32" font-weight="500" fill="#aab0dc">Straight line distance between any two places</text>
    <text x="80" y="548" font-size="26" font-weight="600" fill="#ff8fca">crowfliesdistancecalculator.com</text>
  </g>
</svg>`;
writeFileSync(pub('og-image.png'), await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());
console.log('icons written');
