/** UUID の生成 (v4: ランダム / v7: 時刻順に並ぶ) */

export type RandomFill = (buf: Uint8Array<ArrayBuffer>) => void;

const secureFill: RandomFill = (buf) => {
  crypto.getRandomValues(buf);
};

function toUuidString(b: Uint8Array): string {
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function uuidV4(fill: RandomFill = secureFill): string {
  const b = new Uint8Array(16);
  fill(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return toUuidString(b);
}

/**
 * UUID v7 をまとめて作る。
 *
 * 同じミリ秒の中でも作った順に並ぶよう、rand_a (12ビット) を連番にする
 * (RFC 9562 6.2 の方法1)。1回に作る数は rand_a に収まる範囲に限る
 */
export function uuidV7Batch(count: number, now = Date.now(), fill: RandomFill = secureFill): string[] {
  const n = Math.max(0, Math.min(count, 2000));
  const seed = new Uint8Array(2);
  fill(seed);
  // 連番が12ビットを溢れないよう、開始値は 0〜2047 にする
  let counter = ((seed[0] << 8) | seed[1]) & 0x7ff;
  const out: string[] = [];
  for (let i = 0; i < n; i++, counter++) {
    const b = new Uint8Array(16);
    fill(b);
    let ts = now;
    for (let j = 5; j >= 0; j--) {
      b[j] = ts % 256;
      ts = Math.floor(ts / 256);
    }
    b[6] = 0x70 | ((counter >> 8) & 0x0f);
    b[7] = counter & 0xff;
    b[8] = (b[8] & 0x3f) | 0x80;
    out.push(toUuidString(b));
  }
  return out;
}

export interface UuidFormat {
  upper?: boolean;
  hyphens?: boolean;
  braces?: boolean;
}

export function formatUuid(u: string, f: UuidFormat): string {
  let s = f.hyphens === false ? u.replace(/-/g, "") : u;
  if (f.upper) s = s.toUpperCase();
  if (f.braces) s = `{${s}}`;
  return s;
}

/** UUID v7 に埋め込まれた作成日時を読む (v7 でなければ null) */
export function uuidV7Time(u: string): Date | null {
  const h = u.replace(/[{}-]/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(h) || h[12] !== "7") return null;
  return new Date(parseInt(h.slice(0, 12), 16));
}
