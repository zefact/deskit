/** Unix時間と日時の変換 */

export type TsUnit = "auto" | "s" | "ms" | "us" | "ns";
export type Detected = Exclude<TsUnit, "auto"> | "text";

export interface ParsedTime {
  date: Date;
  detected: Detected;
}

const UNIT_DIV: Record<Exclude<TsUnit, "auto">, number> = {
  s: 1 / 1000,
  ms: 1,
  us: 1000,
  ns: 1_000_000,
};

/** 桁数から単位を推測する (2001年〜2286年の範囲を前提にした目安) */
export function guessUnit(intDigits: number): Exclude<TsUnit, "auto"> {
  if (intDigits <= 11) return "s";
  if (intDigits <= 14) return "ms";
  if (intDigits <= 17) return "us";
  return "ns";
}

const LOCAL_LIKE =
  /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[ T]+(\d{1,2})[:時](\d{1,2})(?:[:分](\d{1,2})(?:\.(\d{1,9}))?秒?|分)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * 数値 (Unix時間) か、日時の文字列を読む。
 * 「2026-11-12 10:00:00」のような空白区切りは Safari の Date.parse が読めないので自前で読む
 */
export function parseTimeInput(input: string, unit: TsUnit): ParsedTime {
  const s = input.trim();
  if (s === "") throw new Error("値を入力してください");

  const num = s.replace(/[,_\s]/g, "");
  if (/^-?\d+(\.\d+)?$/.test(num)) {
    const intDigits = num.replace(/^-/, "").split(".")[0].length;
    const u = unit === "auto" ? guessUnit(intDigits) : unit;
    const ms = Number(num) / UNIT_DIV[u];
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) throw new Error("日時として扱える範囲を超えています");
    return { date, detected: u };
  }

  const m = LOCAL_LIKE.exec(s);
  if (m) {
    const [, y, mo, d, h = "0", mi = "0", sec = "0", frac = "", tz] = m;
    const ms = Number((frac + "000").slice(0, 3));
    const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec), ms] as const;
    let date: Date;
    if (tz) {
      const utc = Date.UTC(...parts);
      date = new Date(utc - tzOffsetMinutes(tz) * 60_000);
    } else {
      date = new Date(...parts);
    }
    if (Number.isNaN(date.getTime()) || Number(mo) > 12 || Number(d) > 31) {
      throw new Error("日時として読めません");
    }
    return { date, detected: "text" };
  }

  const t = Date.parse(s);
  if (Number.isNaN(t)) throw new Error("Unix時間 (数値) か日時 (例: 2026-11-12 10:00:00) を入力してください");
  return { date: new Date(t), detected: "text" };
}

function tzOffsetMinutes(tz: string): number {
  if (tz.toUpperCase() === "Z") return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(tz)!;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -v : v;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

/** 指定したタイムゾーンで見た年月日・時分秒 (timeZone 省略時はこのPCの設定) */
export function zonedParts(date: Date, timeZone?: string): ZonedParts {
  const key = timeZone ?? "";
  let fmt = partsCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("ja-JP", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    partsCache.set(key, fmt);
  }
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    second: Number(p.second),
    weekday: p.weekday,
  };
}

/** そのタイムゾーンのUTCからのずれ (分) */
export function offsetMinutes(date: Date, timeZone?: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const whole = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - whole) / 60_000);
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

function formatOffset(min: number) {
  const sign = min >= 0 ? "+" : "-";
  return `${sign}${pad(Math.floor(Math.abs(min) / 60))}:${pad(Math.abs(min) % 60)}`;
}

/** 2026-11-12T10:00:00.000+09:00 の形 */
export function isoWithOffset(date: Date, timeZone?: string): string {
  const p = zonedParts(date, timeZone);
  const ms = ((date.getTime() % 1000) + 1000) % 1000;
  const off = offsetMinutes(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}.${pad(ms, 3)}${formatOffset(off)}`;
}

/** 2026/11/12 (木) 10:00:00 の形 */
export function formatJa(date: Date, timeZone?: string): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}/${pad(p.month)}/${pad(p.day)} (${p.weekday}) ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** 令和8年11月12日 の形 */
export function formatWareki(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("ja-JP-u-ca-japanese", {
    timeZone,
    era: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

const rtf = new Intl.RelativeTimeFormat("ja", { numeric: "auto" });

/** 「3時間前」「2日後」の形 */
export function formatRelative(date: Date, now = Date.now()): string {
  const diffSec = (date.getTime() - now) / 1000;
  for (const [unit, sec] of RELATIVE_UNITS) {
    if (Math.abs(diffSec) >= sec || unit === "second") {
      return rtf.format(Math.round(diffSec / sec), unit);
    }
  }
  return "";
}

export const TIME_ZONES: { id: string; label: string }[] = [
  { id: "UTC", label: "UTC" },
  { id: "Asia/Tokyo", label: "東京 (Asia/Tokyo)" },
  { id: "Asia/Seoul", label: "ソウル (Asia/Seoul)" },
  { id: "Asia/Shanghai", label: "上海 (Asia/Shanghai)" },
  { id: "Asia/Singapore", label: "シンガポール (Asia/Singapore)" },
  { id: "Asia/Kolkata", label: "インド (Asia/Kolkata)" },
  { id: "Europe/London", label: "ロンドン (Europe/London)" },
  { id: "Europe/Paris", label: "パリ (Europe/Paris)" },
  { id: "America/New_York", label: "ニューヨーク (America/New_York)" },
  { id: "America/Chicago", label: "シカゴ (America/Chicago)" },
  { id: "America/Los_Angeles", label: "ロサンゼルス (America/Los_Angeles)" },
  { id: "Australia/Sydney", label: "シドニー (Australia/Sydney)" },
];
