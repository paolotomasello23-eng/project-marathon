/* Genera le icone dell'app: la linea blu del percorso su fondo asfalto, con il punto di partenza e la bandierina.
   Uso: npm run icons */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const ROAD = '#18212C', LANE = '#232F3D', BLUE = '#2F8CFF', INK = '#F3F6F9';

/** Disegno in un riquadro 512×512. scale < 1 lo rimpicciolisce attorno al centro (zona sicura delle icone "maskable"). */
function art(scale = 1) {
  const t = `translate(256 256) scale(${scale}) translate(-256 -256)`;
  const line = 'M118 384 C 214 384, 196 262, 262 250 S 322 142, 394 138';
  return `<g transform="${t}" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="${line}" stroke="${LANE}" stroke-width="66"/>
    <path d="${line}" stroke="${BLUE}" stroke-width="26"/>
    <circle cx="118" cy="384" r="30" fill="${BLUE}" stroke="${ROAD}" stroke-width="10"/>
    <path d="M394 142 V58" stroke="${INK}" stroke-width="13"/>
    <path d="M394 62 h66 l-17 25 17 25 h-66 z" fill="${INK}" stroke="${INK}" stroke-width="9"/>
  </g>`;
}
const svg = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${bg}${inner}</svg>`;
const rounded = svg(art(0.9), `<rect width="512" height="512" rx="112" fill="${ROAD}"/>`);
const full = svg(art(0.9), `<rect width="512" height="512" fill="${ROAD}"/>`);
const maskable = svg(art(0.66), `<rect width="512" height="512" fill="${ROAD}"/>`);

mkdirSync('public', { recursive: true });
writeFileSync('public/favicon.svg', rounded + '\n');
const png = (src, size, file) => sharp(Buffer.from(src), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile('public/' + file);
await Promise.all([
  png(rounded, 192, 'icon-192.png'), png(rounded, 512, 'icon-512.png'),
  png(maskable, 192, 'maskable-192.png'), png(maskable, 512, 'maskable-512.png'),
  png(full, 180, 'apple-touch-icon.png')
]);
console.log('icone scritte in public/');
