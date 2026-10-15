// Génère les icônes PNG de la PWA (cœur rouge et tracé ECG sur fond sombre),
// sans dépendance externe. Usage : npm run icons

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../icons/', import.meta.url));

const BG = [17, 17, 17];
const HEART = [208, 16, 32];
const LINE = [255, 255, 255];

// Tracé ECG, en unités du cœur (centre 0,0 ; y vers le haut).
const ECG = [[-1.3, 0], [-0.55, 0], [-0.38, 0.28], [-0.18, -0.5], [0.08, 0.75], [0.3, -0.18], [0.45, 0], [1.3, 0]];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
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

function encodePng(size, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profondeur
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0;
    rgb.copy(raw, row + 1, y * size * 3, (y + 1) * size * 3);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inHeart(u, v) {
  const a = u * u + v * v - 1;
  return a * a * a - u * u * v * v * v <= 0;
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function onEcg(u, v, width) {
  for (let i = 0; i < ECG.length - 1; i++) {
    if (distToSegment(u, v, ECG[i], ECG[i + 1]) <= width) return true;
  }
  return false;
}

function render(size, heartScale) {
  const SS = 4; // suréchantillonnage pour l'anticrénelage
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          const u = (nx - 0.5) / heartScale;
          const v = -(ny - 0.53) / heartScale;
          let color = BG;
          if (inHeart(u, v)) color = onEcg(u, v, 0.075) ? LINE : HEART;
          acc[0] += color[0]; acc[1] += color[1]; acc[2] += color[2];
        }
      }
      const i = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) rgb[i + c] = Math.round(acc[c] / (SS * SS));
    }
  }
  return encodePng(size, rgb);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}icon-192.png`, render(192, 0.32));
writeFileSync(`${OUT}icon-512.png`, render(512, 0.32));
writeFileSync(`${OUT}icon-maskable-512.png`, render(512, 0.25)); // marge de sécurité « maskable »
console.log('Icônes générées dans icons/');
