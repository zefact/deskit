/** 色の表記の読み取りと変換 (HEX / RGB / HSL / HSV / OKLCH / CMYK) */

export interface RGBA {
  /** 0〜255 */
  r: number;
  g: number;
  b: number;
  /** 0〜1 */
  a: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  lime: "#00ff00",
  green: "#008000",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  gray: "#808080",
  grey: "#808080",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
  navy: "#000080",
  teal: "#008080",
  silver: "#c0c0c0",
  maroon: "#800000",
  olive: "#808000",
  transparent: "#00000000",
};

function parseHex(s: string): RGBA | null {
  const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length <= 4) h = [...h].map((c) => c + c).join("");
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? round(n(6) / 255, 3) : 1 };
}

/** 関数形式の引数 (カンマ区切り・空白区切り・スラッシュのアルファ) を分ける */
function args(body: string): string[] {
  return body
    .replace(/\s*\/\s*/g, " ")
    .split(/[\s,]+/)
    .filter(Boolean);
}

function num(v: string, percentOf: number): number {
  if (v.endsWith("%")) return (parseFloat(v) / 100) * percentOf;
  return parseFloat(v);
}

function alpha(v: string | undefined): number {
  if (v === undefined) return 1;
  return clamp(v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v), 0, 1);
}

export function parseColor(input: string): RGBA | null {
  const s = input.trim().toLowerCase().replace(/;$/, "");
  if (s === "") return null;
  if (NAMED[s]) return parseHex(NAMED[s]);
  const hex = parseHex(s);
  if (hex) return hex;

  const fn = /^([a-z]+)\((.*)\)$/.exec(s);
  if (fn) {
    const [, name, body] = fn;
    const a = args(body);
    if (a.length < 3 || a.slice(0, 3).some((v) => Number.isNaN(parseFloat(v)))) return null;
    if (name === "rgb" || name === "rgba") {
      return {
        r: clamp(num(a[0], 255), 0, 255),
        g: clamp(num(a[1], 255), 0, 255),
        b: clamp(num(a[2], 255), 0, 255),
        a: alpha(a[3]),
      };
    }
    if (name === "hsl" || name === "hsla") {
      const rgb = hslToRgb(parseFloat(a[0]), num(a[1].replace("%", "") + "%", 100), num(a[2].replace("%", "") + "%", 100));
      return { ...rgb, a: alpha(a[3]) };
    }
    if (name === "hsv" || name === "hsb") {
      const rgb = hsvToRgb(parseFloat(a[0]), parseFloat(a[1]), parseFloat(a[2]));
      return { ...rgb, a: alpha(a[3]) };
    }
    if (name === "oklch") {
      const l = a[0].endsWith("%") ? parseFloat(a[0]) / 100 : parseFloat(a[0]);
      const rgb = oklchToRgb(l, parseFloat(a[1]), parseFloat(a[2]));
      return { ...rgb, a: alpha(a[3]) };
    }
    return null;
  }

  // 「255, 128, 0」のような数字だけの並びは RGB とみなす
  const bare = /^(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})$/.exec(s);
  if (bare) {
    const [r, g, b] = bare.slice(1).map(Number);
    if ([r, g, b].every((v) => v <= 255)) return { r, g, b, a: 1 };
  }
  return null;
}

export function hslToRgb(h: number, s: number, l: number) {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp(s, 0, 100) / 100;
  const ll = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  const [r, g, b] =
    hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hsvToRgb(h: number, s: number, v: number) {
  const ss = clamp(s, 0, 100) / 100;
  const vv = clamp(v, 0, 100) / 100;
  const l = vv * (1 - ss / 2);
  const sl = l === 0 || l === 1 ? 0 : (vv - l) / Math.min(l, 1 - l);
  return hslToRgb(h, sl * 100, l * 100);
}

export function toHex(c: RGBA, opts: { upper?: boolean; alpha?: boolean } = {}): string {
  const h = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
  let s = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  if (opts.alpha && c.a < 1) s += h(c.a * 255);
  return opts.upper ? s.toUpperCase() : s;
}

export function toRgbString(c: RGBA): string {
  const [r, g, b] = [c.r, c.g, c.b].map((v) => Math.round(v));
  return c.a < 1 ? `rgb(${r} ${g} ${b} / ${round(c.a, 3)})` : `rgb(${r}, ${g}, ${b})`;
}

export function toHsl(c: RGBA) {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: s * 100, l: l * 100 };
}

export function toHslString(c: RGBA): string {
  const { h, s, l } = toHsl(c);
  const body = `${round(h)}, ${round(s)}%, ${round(l)}%`;
  return c.a < 1 ? `hsl(${round(h)} ${round(s)}% ${round(l)}% / ${round(c.a, 3)})` : `hsl(${body})`;
}

export function toHsv(c: RGBA) {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const { h } = toHsl(c);
  return { h, s: max === 0 ? 0 : ((max - min) / max) * 100, v: max * 100 };
}

const toLinear = (v: number) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const x = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return clamp(x * 255, 0, 255);
};

/** sRGB → OKLCH (L: 0〜1, C: 0〜0.4程度, H: 0〜360) */
export function toOklch(c: RGBA) {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L, c: C, h: C < 1e-4 ? 0 : H };
}

export function oklchToRgb(L: number, C: number, H: number) {
  const hr = (H * Math.PI) / 180;
  const A = C * Math.cos(hr);
  const B = C * Math.sin(hr);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

export function toOklchString(c: RGBA): string {
  const { l, c: ch, h } = toOklch(c);
  const a = c.a < 1 ? ` / ${round(c.a, 3)}` : "";
  return `oklch(${round(l * 100, 1)}% ${round(ch, 3)} ${round(h, 1)}${a})`;
}

export function toCmyk(c: RGBA) {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: ((1 - r - k) / (1 - k)) * 100,
    m: ((1 - g - k) / (1 - k)) * 100,
    y: ((1 - b - k) / (1 - k)) * 100,
    k: k * 100,
  };
}

/** WCAG の相対輝度 */
export function luminance(c: RGBA): number {
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** WCAG のコントラスト比 (1〜21) */
export function contrastRatio(a: RGBA, b: RGBA): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** 2色を混ぜる (t=0 で a、t=1 で b) */
export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  };
}

export { round as roundTo };
