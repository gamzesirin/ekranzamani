// Bağımlılıksız ikon üretici — bar-chart glifi.
// assets/icon.png (256x256) ve çok boyutlu assets/icon.ico üretir.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const accent = [249, 115, 22];
const amber = [255, 176, 32];
const white = [255, 255, 255];

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Normalize edilmiş (0..1) koordinatlarla, herhangi bir boyutta çizim
function makePng(size) {
  // yuvarlak kare kenarları (0..1)
  const m = 0.06;      // kenar boşluğu
  const rad = 0.22;    // köşe yarıçapı
  const x0 = m, y0 = m, x1 = 1 - m, y1 = 1 - m, r = rad;
  // barlar: [x başlangıç, x bitiş, üst] — alt hep 0.80
  const barBottom = 0.80;
  const bars = [
    [0.22, 0.37, 0.62],
    [0.42, 0.57, 0.40],
    [0.62, 0.77, 0.22],
  ];

  function inRounded(u, v) {
    if (u < x0 || u > x1 || v < y0 || v > y1) return false;
    const cx = Math.min(Math.max(u, x0 + r), x1 - r);
    const cy = Math.min(Math.max(v, y0 + r), y1 - r);
    const dx = u - cx, dy = v - cy;
    return dx * dx + dy * dy <= r * r;
  }

  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      let r8 = 0, g8 = 0, b8 = 0, a8 = 0;
      if (inRounded(u, v)) {
        const col = mix(accent, amber, (u + v) / 2);
        r8 = col[0]; g8 = col[1]; b8 = col[2]; a8 = 255;
        for (const bar of bars) {
          if (u >= bar[0] && u <= bar[1] && v >= bar[2] && v <= barBottom) {
            r8 = white[0]; g8 = white[1]; b8 = white[2]; a8 = 255;
          }
        }
      }
      raw[p++] = r8; raw[p++] = g8; raw[p++] = b8; raw[p++] = a8;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// PNG'lerden çok boyutlu ICO üret (Vista+ PNG-içeren ICO)
function makeIco(sizes) {
  const pngs = sizes.map((s) => ({ size: s, data: makePng(s) }));
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type: icon
  header.writeUInt16LE(count, 4);  // count

  const entries = [];
  let offset = 6 + count * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;  // width (0 = 256)
    e[1] = size >= 256 ? 0 : size;  // height
    e[2] = 0;                       // palette
    e[3] = 0;                       // reserved
    e.writeUInt16LE(1, 4);          // color planes
    e.writeUInt16LE(32, 6);         // bit count
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const outDir = path.join(__dirname, 'assets');
fs.mkdirSync(outDir, { recursive: true });

const png256 = makePng(256);
fs.writeFileSync(path.join(outDir, 'icon.png'), png256);

const ico = makeIco([16, 24, 32, 48, 64, 128, 256]);
fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);

console.log('assets/icon.png (256px, ' + png256.length + ' B) ve assets/icon.ico (' + ico.length + ' B) üretildi');
