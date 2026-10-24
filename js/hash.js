// md5sum and sha256sum need an answer right away, in the middle of a pipe, and crypto.subtle only answers later:
// so these two are written out here. Bytes in, hex out
const hex = words => words.map(w => (w >>> 0).toString(16).padStart(8, '0')).join('');

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];
// the message, padded to whole 64-byte blocks with its length in bits at the end (big- or little-endian)
function pad(bytes, bigEndian) {
  const n = Math.ceil((bytes.length + 9) / 64) * 64, out = new Uint8Array(n), view = new DataView(out.buffer);
  out.set(bytes); out[bytes.length] = 0x80;
  const bits = bytes.length * 8;
  if (bigEndian) { view.setUint32(n - 8, Math.floor(bits / 2 ** 32)); view.setUint32(n - 4, bits >>> 0); }
  else { view.setUint32(n - 8, bits >>> 0, true); view.setUint32(n - 4, Math.floor(bits / 2 ** 32), true); }
  return view;
}

export function sha256(bytes) {
  const v = pad(bytes, true), w = new Array(64);
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < v.byteLength; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = v.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, k] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, k].forEach((x, i) => { h[i] = (h[i] + x) | 0; });
  }
  return hex(h);
}

const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const KMD5 = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) | 0);
export function md5(bytes) {
  const v = pad(bytes, false), m = new Array(16);
  let h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let off = 0; off < v.byteLength; off += 64) {
    for (let i = 0; i < 16; i++) m[i] = v.getUint32(off + i * 4, true);
    let [a, b, c, d] = h;
    for (let i = 0; i < 64; i++) {
      const r = i >> 4;
      const f = r === 0 ? (b & c) | (~b & d) : r === 1 ? (d & b) | (~d & c) : r === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = r === 0 ? i : r === 1 ? (5 * i + 1) % 16 : r === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const sum = (a + f + KMD5[i] + m[g]) | 0, s = S[r * 4 + (i % 4)];
      a = d; d = c; c = b; b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0;
    }
    h = [(h[0] + a) | 0, (h[1] + b) | 0, (h[2] + c) | 0, (h[3] + d) | 0];
  }
  // md5 writes its words little-endian
  return h.map(x => [0, 8, 16, 24].map(s => ((x >>> s) & 255).toString(16).padStart(2, '0')).join('')).join('');
}

export const utf8 = s => new TextEncoder().encode(s);
export const toBase64 = bytes => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
// null when it is not base64
export function fromBase64(s) {
  try { return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(atob(s.replace(/\s+/g, '')), c => c.charCodeAt(0))); } catch { return null; }
}
