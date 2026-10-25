// SHA-256 in plain JS: crypto.subtle only exists on https/localhost, and the dashboard may be opened over the LAN.

const frac = (x: number) => ((x - Math.floor(x)) * 4294967296) | 0;
const H0: number[] = [];
const K: number[] = [];
for (let n = 2; K.length < 64; n++) {
  let prime = true;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) prime = false;
  if (!prime) continue;
  if (H0.length < 8) H0.push(frac(Math.sqrt(n)));
  K.push(frac(Math.cbrt(n)));
}

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

export function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const total = ((bytes.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const dv = new DataView(buf.buffer);
  const bits = bytes.length * 8;
  dv.setUint32(total - 8, Math.floor(bits / 4294967296));
  dv.setUint32(total - 4, bits >>> 0);

  const h = H0.slice();
  const w = new Int32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getInt32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15], y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] + v) | 0));
  }
  return h.map((x) => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
