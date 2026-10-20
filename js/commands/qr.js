// qr: a QR code for my pages or any text, to move from the screen to a phone.
// A small encoder of its own (byte mode, error correction level M, versions 1 to 10), after the ISO 18004 steps
import { print, span, esc } from '../core.js';
import { QR_PAGES } from '../content.js';

// ---- Reed-Solomon over GF(256) ----
const gfMul = (x, y) => {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
};
function rsDivisor(degree) {
  const result = Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { result[j] = gfMul(result[j], root); if (j + 1 < degree) result[j] ^= result[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return result;
}
function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result.shift();
    result.push(0);
    divisor.forEach((c, i) => { result[i] ^= gfMul(c, factor); });
  }
  return result;
}

// ---- level M, versions 1 to 10: error correction codewords per block, and the number of blocks ----
const ECC_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const rawModules = v => {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
  return r;
};
const dataCodewords = v => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * BLOCKS[v];
function alignment(v, size) {
  if (v === 1) return [];
  const n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1;
  while (v <= 10 && 4 + (v < 10 ? 8 : 16) + 8 * bytes.length > dataCodewords(v) * 8) v++;
  if (v > 10) return null;
  const size = v * 4 + 17;

  // data bits: mode 0100, the length, the bytes, a terminator, then pad bytes
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(4, 4); push(bytes.length, v < 10 ? 8 : 16); bytes.forEach(b => push(b, 8));
  const cap = dataCodewords(v) * 8;
  push(0, Math.min(4, cap - bits.length));
  push(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  // split into blocks, add error correction, interleave
  const nBlocks = BLOCKS[v], eccLen = ECC_PER_BLOCK[v], raw = Math.floor(rawModules(v) / 8);
  const short = nBlocks - raw % nBlocks, shortLen = Math.floor(raw / nBlocks), div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const len = shortLen - eccLen + (i < short ? 0 : 1);
    const dat = data.slice(k, k += len), ecc = rsRemainder(dat, div);
    if (i < short) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= short) codewords.push(b[i]); });

  // the function patterns
  const m = Array.from({ length: size }, () => Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fixed[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = alignment(v, size), last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = mask => {
    const d = (0 << 3) | mask; // level M is 00
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  format(0);
  if (v >= 7) {
    let rem = v;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (v << 12) | rem;
    for (let i = 0; i < 18; i++) { const dark = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, dark); set(c, a, dark); }
  }

  // the codewords in the zigzag
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (!fixed[y][x] && bit < codewords.length * 8) { m[y][x] = ((codewords[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1; bit++; }
    }
  }

  // try the eight masks, keep the one with the lowest penalty
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
  const applyMask = k => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[k](x, y)) m[y][x] = !m[y][x]; };
  const penalty = () => {
    let p = 0, dark = 0;
    const runs = line => { let n = 1; for (let i = 1; i <= line.length; i++) { if (i < line.length && line[i] === line[i - 1]) n++; else { if (n >= 5) p += n - 2; n = 1; } } };
    const finderLike = line => { const s = line.map(d => d ? 1 : 0).join(''); for (const f of ['10111010000', '00001011101']) for (let i = s.indexOf(f); i >= 0; i = s.indexOf(f, i + 1)) p += 40; };
    for (let y = 0; y < size; y++) { runs(m[y]); finderLike(m[y]); }
    for (let x = 0; x < size; x++) { const col = m.map(r => r[x]); runs(col); finderLike(col); }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
    m.forEach(r => r.forEach(d => { if (d) dark++; }));
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = 0, bestP = Infinity;
  for (let k = 0; k < 8; k++) { applyMask(k); format(k); const p = penalty(); if (p < bestP) { bestP = p; best = k; } applyMask(k); }
  applyMask(best); format(best);
  return m;
}

// dark modules on a light quiet zone, so every phone camera reads it. The colours come from the theme (css/style.css);
// the fill attributes are the black and white fallback when the svg is used outside the page
export function qrSvg(text, px = 200) {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length, q = 4, total = n + q * 2;
  let d = '';
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + q} ${y + q}h1v1h-1z`; }));
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="QR code for ${esc(text)}"><rect class="qr-light" width="${total}" height="${total}" fill="#fff"/><path class="qr-dark" d="${d}" fill="#000"/></svg>`;
}

export function qr(args, raw) {
  const pages = QR_PAGES();
  const what = args.length ? raw.replace(/^\s*qr\s+/, '').replace(/^(["'])(.*)\1$/s, '$2') : 'terminal';
  const text = pages[what.toLowerCase()] || what;
  const svg = qrSvg(text);
  if (!svg) return print(span('e', 'qr: that is too long for a small QR code, keep it under about 200 characters.'));
  print(svg);
  print(span('m', 'Scan it with your phone camera: ') + esc(text));
}
