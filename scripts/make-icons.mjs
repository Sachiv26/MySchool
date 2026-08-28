// Generates simple-branded PNG app icons with no external dependencies.
// Run: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'icons');
mkdirSync(OUT, { recursive: true });

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

// Solid rounded-feel square with a simple "book" glyph approximated by rows.
function makeIcon(size, bg = [15, 118, 110], fg = [255, 255, 255], brand = [15, 118, 110]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  // Draw a filled rounded square bg + a white horizontal "book/spark" accent bar.
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const inBar =
        y > size * 0.42 && y < size * 0.58 && x > size * 0.22 && x < size * 0.78;
      const inDot1 = Math.abs(x - size * 0.36) < size * 0.07 && Math.abs(y - size * 0.3) < size * 0.07;
      const inDot2 = Math.abs(x - size * 0.64) < size * 0.07 && Math.abs(y - size * 0.3) < size * 0.07;
      if (inBar || inDot1 || inDot2) {
        raw[p++] = fg[0];
        raw[p++] = fg[1];
        raw[p++] = fg[2];
        raw[p++] = 255;
      } else {
        raw[p++] = brand[0];
        raw[p++] = brand[1];
        raw[p++] = brand[2];
        raw[p++] = 255;
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(OUT, 'icon-192.png'), makeIcon(192));
writeFileSync(join(OUT, 'icon-512.png'), makeIcon(512));
// Maskable: keep the glyph within the safe zone, lighter background.
writeFileSync(join(OUT, 'maskable-512.png'), makeIcon(512, [15, 118, 110], [255, 255, 255]));

console.log('Wrote PWA icons to', OUT);