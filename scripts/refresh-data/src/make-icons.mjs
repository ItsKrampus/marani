// Generates extension icons (qvevri mark on wine background) as raw PNGs — no deps.
// Run: node scripts/refresh-data/src/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '../../../apps/extension/public/icon');

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// Brand palette from the Claude Design project
const WINE = [0x7a, 0x15, 0x33];
const WINE_DEEP = [0x2a, 0x0d, 0x1b];
const GOLD = [0xe0, 0xa4, 0x58];
const BG = [0x14, 0x09, 0x0e];

function drawBase(size) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const r = size * 0.47;
  const bodyCy = size * 0.62;
  const bodyR = size * 0.30;
  const neckHalf = size * 0.16;
  const neckTop = size * 0.16;
  const rimTop = size * 0.13;
  const rimBottom = size * 0.185;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = x - cx;
      const dyc = y - size / 2;
      const inDisc = dx * dx + dyc * dyc <= r * r;
      if (!inDisc) continue; // transparent corners
      let c = BG;
      // amphora body (circle) + neck (trapezoid) in wine red
      const dyb = y - bodyCy;
      const inBody = dx * dx + dyb * dyb <= bodyR * bodyR;
      const inNeck = y >= neckTop && y < bodyCy && Math.abs(dx) <= neckHalf * (0.72 + (0.28 * (y - neckTop)) / (bodyCy - neckTop));
      if (inBody || inNeck) c = WINE;
      // inner shading on lower body
      if (inBody && dyb > bodyR * 0.35) c = WINE_DEEP;
      // gold rim at the mouth
      if (y >= rimTop && y < rimBottom && Math.abs(dx) <= neckHalf * 0.82) c = GOLD;
      // gold side handles (from the brand mark)
      if (
        Math.abs(y - size * 0.55) <= Math.max(1, size * 0.018) &&
        (Math.abs(dx) > bodyR * 1.08 && Math.abs(dx) < r * 0.92)
      )
        c = GOLD;
      // gold ring border of the disc
      const dist = Math.sqrt(dx * dx + dyc * dyc);
      if (dist >= r - Math.max(1.5, size * 0.02)) c = GOLD;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  return px;
}

function downscale(src, srcSize, dstSize) {
  const dst = Buffer.alloc(dstSize * dstSize * 4);
  const f = srcSize / dstSize;
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      // box sample
      let rs = 0, gs = 0, bs = 0, as = 0, n = 0;
      for (let sy = Math.floor(y * f); sy < Math.min(srcSize, (y + 1) * f); sy++) {
        for (let sx = Math.floor(x * f); sx < Math.min(srcSize, (x + 1) * f); sx++) {
          const si = (sy * srcSize + sx) * 4;
          rs += src[si]; gs += src[si + 1]; bs += src[si + 2]; as += src[si + 3];
          n++;
        }
      }
      const di = (y * dstSize + x) * 4;
      dst[di] = rs / n; dst[di + 1] = gs / n; dst[di + 2] = bs / n; dst[di + 3] = as / n;
    }
  }
  return dst;
}

mkdirSync(OUT_DIR, { recursive: true });
const base = drawBase(128);
for (const size of [128, 48, 32, 16]) {
  const px = size === 128 ? base : downscale(base, 128, size);
  writeFileSync(join(OUT_DIR, `${size}.png`), encodePng(size, size, px));
  console.log(`icon ${size}.png`);
}
