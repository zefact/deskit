/** 2進・8進・10進・16進の相互変換 (BigInt で桁数の制限なし) */

export type Base = 2 | 8 | 10 | 16;

const PREFIX: Record<Base, RegExp> = {
  2: /^0b/i,
  8: /^0o/i,
  10: /^$/,
  16: /^0x/i,
};

const DIGITS: Record<Base, RegExp> = {
  2: /^[01]+$/,
  8: /^[0-7]+$/,
  10: /^\d+$/,
  16: /^[0-9a-f]+$/i,
};

const BASE_NAME: Record<Base, string> = { 2: "2進数", 8: "8進数", 10: "10進数", 16: "16進数" };

/** 入力を読む。空白・_ ・(10進の) カンマ・0x などの接頭辞は無視する */
export function parseInBase(input: string, base: Base): bigint {
  let s = input.trim().replace(/[\s_]/g, "");
  if (base === 10) s = s.replace(/,/g, "");
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (base !== 10) s = s.replace(PREFIX[base], "");
  if (s === "") throw new Error("値を入力してください");
  if (!DIGITS[base].test(s)) throw new Error(`${BASE_NAME[base]}に使えない文字が含まれています`);
  const prefix = base === 2 ? "0b" : base === 8 ? "0o" : base === 16 ? "0x" : "";
  const v = BigInt(prefix + s);
  return negative ? -v : v;
}

const GROUP: Record<Base, { size: number; sep: string }> = {
  2: { size: 4, sep: " " },
  8: { size: 3, sep: " " },
  10: { size: 3, sep: "," },
  16: { size: 4, sep: " " },
};

export function formatInBase(n: bigint, base: Base, opts: { group?: boolean; upper?: boolean } = {}) {
  const negative = n < 0n;
  let s = (negative ? -n : n).toString(base);
  if (opts.upper) s = s.toUpperCase();
  if (opts.group) {
    const { size, sep } = GROUP[base];
    // 2進・16進は桁をそろえるため、左を0で埋めてから区切る
    if (base === 2 || base === 16) s = s.padStart(Math.ceil(s.length / size) * size, "0");
    const parts: string[] = [];
    for (let end = s.length; end > 0; end -= size) parts.unshift(s.slice(Math.max(0, end - size), end));
    s = parts.join(sep);
  }
  return (negative ? "-" : "") + s;
}

/** 表すのに必要なビット数 (符号なし) */
export function bitLength(n: bigint): number {
  const v = n < 0n ? -n : n;
  return v === 0n ? 0 : v.toString(2).length;
}
