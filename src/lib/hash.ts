/**
 * テキストのハッシュ値。
 *
 * SHA系は Web Crypto (crypto.subtle) で求める。
 * MD5 は Web Crypto に無いので自前で実装している (チェックサム用途のみ。安全性の用途には使わない)
 */

export const HASH_ALGOS = ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const;
export type HashAlgo = (typeof HASH_ALGOS)[number];

// MD5 の各ラウンドの回転量
const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
// MD5 の定数 (sin から作る表)
const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

export function md5(bytes: Uint8Array): Uint8Array {
  const len = bytes.length;
  // 末尾に 0x80 と長さ (8バイト) を足して、64バイトの倍数にする
  const total = (((len + 8) >>> 6) + 1) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, (len * 8) >>> 0, true);
  dv.setUint32(total - 4, Math.floor(len / 0x20000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const M = new Uint32Array(16);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << S[i]) | (F >>> (32 - S[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return out;
}

export async function digest(algo: HashAlgo, bytes: Uint8Array): Promise<Uint8Array> {
  if (algo === "MD5") return md5(bytes);
  const buf = await crypto.subtle.digest(algo, bytes as Uint8Array<ArrayBuffer>);
  return new Uint8Array(buf);
}

/** HMAC (RFC 2104)。MD5 でも使えるよう、ハッシュ関数を組み合わせて自前で計算する */
export async function hmac(algo: HashAlgo, key: Uint8Array, bytes: Uint8Array): Promise<Uint8Array> {
  const block = algo === "SHA-384" || algo === "SHA-512" ? 128 : 64;
  let k = key.length > block ? await digest(algo, key) : key;
  const padded = new Uint8Array(block);
  padded.set(k);
  k = padded;
  const inner = new Uint8Array(block + bytes.length);
  const outerKey = new Uint8Array(block);
  for (let i = 0; i < block; i++) {
    inner[i] = k[i] ^ 0x36;
    outerKey[i] = k[i] ^ 0x5c;
  }
  inner.set(bytes, block);
  const innerHash = await digest(algo, inner);
  const outer = new Uint8Array(block + innerHash.length);
  outer.set(outerKey);
  outer.set(innerHash, block);
  return digest(algo, outer);
}

export function toHex(bytes: Uint8Array, upper = false): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return upper ? s.toUpperCase() : s;
}
