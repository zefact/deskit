/**
 * 西暦と和暦の変換、年齢・干支・学校の入学と卒業の年の計算。
 *
 * 日付は時刻やタイムゾーンを持たない年月日 (Ymd) で扱う
 */

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

export type EraName = "明治" | "大正" | "昭和" | "平成" | "令和";

export interface Era {
  name: EraName;
  abbr: "M" | "T" | "S" | "H" | "R";
  /** 始まった日 (明治は、さかのぼって当てはめた明治元年の初め) */
  start: Ymd;
}

export const ERAS: Era[] = [
  { name: "明治", abbr: "M", start: { y: 1868, m: 1, d: 1 } },
  { name: "大正", abbr: "T", start: { y: 1912, m: 7, d: 30 } },
  { name: "昭和", abbr: "S", start: { y: 1926, m: 12, d: 25 } },
  { name: "平成", abbr: "H", start: { y: 1989, m: 1, d: 8 } },
  { name: "令和", abbr: "R", start: { y: 2019, m: 5, d: 1 } },
];

/** 明治5年 (1872年) までは旧暦だったので、和暦の月日は西暦の月日と違う */
const SOLAR_START: Ymd = { y: 1873, m: 1, d: 1 };

// ---- 日付の計算 ----

export const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

export const daysInMonth = (y: number, m: number) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

export const cmpYmd = (a: Ymd, b: Ymd) => a.y - b.y || a.m - b.m || a.d - b.d;

const toDays = (a: Ymd) => Date.UTC(a.y, a.m - 1, a.d) / 86_400_000;

/** a − b の日数 */
export const diffDays = (a: Ymd, b: Ymd) => Math.round(toDays(a) - toDays(b));

function addDays(a: Ymd, n: number): Ymd {
  const t = new Date((toDays(a) + n) * 86_400_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

export const weekday = (a: Ymd) => "日月火水木金土"[new Date(toDays(a) * 86_400_000).getUTCDay()];

/** このパソコンの今日 */
export function todayYmd(now = new Date()): Ymd {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

// ---- 和暦 ----

const nextEra = (e: Era) => ERAS[ERAS.indexOf(e) + 1] as Era | undefined;

/** その日の元号 (明治より前は undefined) */
export function eraOfDate(a: Ymd): Era | undefined {
  return [...ERAS].reverse().find((e) => cmpYmd(a, e.start) >= 0);
}

/** その年にかかっている元号 (改元の年は2つ) */
export function erasOfYear(y: number): Era[] {
  return ERAS.filter((e) => {
    const next = nextEra(e);
    return e.start.y <= y && (!next || y <= next.start.y);
  });
}

export const eraYear = (e: Era, y: number) => y - e.start.y + 1;

/** 1年は「元年」と書く */
const eraYearText = (n: number) => (n === 1 ? "元" : String(n));

/** 令和8年 (改元の年は「昭和64年 / 平成元年」) */
export function formatWarekiYear(y: number): string {
  return erasOfYear(y)
    .map((e) => `${e.name}${eraYearText(eraYear(e, y))}年`)
    .join(" / ");
}

/** 令和8年11月17日 */
export function formatWareki(a: Ymd): string {
  const e = eraOfDate(a);
  return e ? `${e.name}${eraYearText(eraYear(e, a.y))}年${a.m}月${a.d}日` : "";
}

/** R8.11.17 */
export function formatWarekiShort(a: Ymd): string {
  const e = eraOfDate(a);
  return e ? `${e.abbr}${eraYear(e, a.y)}.${a.m}.${a.d}` : "";
}

/** 平成15年4月 (その月の1日の元号で書く) */
export function formatWarekiMonth(y: number, m: number): string {
  const e = eraOfDate({ y, m, d: 1 });
  return e ? `${e.name}${eraYearText(eraYear(e, y))}年${m}月` : "";
}

/** 2026年11月17日 (火) */
export const formatSeireki = (a: Ymd) => `${a.y}年${a.m}月${a.d}日 (${weekday(a)})`;

/** 2026/11/17 */
export const formatSlash = (a: Ymd) => `${a.y}/${String(a.m).padStart(2, "0")}/${String(a.d).padStart(2, "0")}`;

/** 改元の年に、元号がいつ切り替わったか (「1月7日までは昭和、1月8日からは平成」) */
export function eraChangeNote(y: number): string | null {
  const eras = erasOfYear(y);
  if (eras.length < 2) return null;
  const [before, after] = eras;
  const last = addDays(after.start, -1);
  return `${last.m}月${last.d}日までは${before.name}、${after.start.m}月${after.start.d}日からは${after.name}`;
}

/** 明治5年までの日付 (旧暦の時代) か */
export const isLunarEra = (a: Ymd) => cmpYmd(a, SOLAR_START) < 0 && a.y >= ERAS[0].start.y;

// ---- 干支 ----

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const STEMS_KANA = ["きのえ", "きのと", "ひのえ", "ひのと", "つちのえ", "つちのと", "かのえ", "かのと", "みずのえ", "みずのと"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const BRANCHES_KANA = ["ね", "うし", "とら", "う", "たつ", "み", "うま", "ひつじ", "さる", "とり", "いぬ", "い"];

export interface Eto {
  /** 庚午 */
  kanji: string;
  /** かのえうま */
  kana: string;
  /** 午年 */
  animal: string;
}

/** その年の干支 (年の区切りは元日とする) */
export function eto(y: number): Eto {
  const i = (((y - 4) % 60) + 60) % 60;
  const s = i % 10;
  const b = i % 12;
  return {
    kanji: STEMS[s] + BRANCHES[b],
    kana: STEMS_KANA[s] + BRANCHES_KANA[b],
    animal: `${BRANCHES[b]}年`,
  };
}

// ---- 年齢 ----

/** 満年齢 (誕生日に1つ増える。2月29日生まれは、うるう年でない年は3月1日に増える) */
export function ageOn(birth: Ymd, on: Ymd): number {
  const passed = on.m > birth.m || (on.m === birth.m && on.d >= birth.d);
  return on.y - birth.y - (passed ? 0 : 1);
}

/** 数え年 (生まれた年を1歳とし、元日ごとに1つ増える) */
export const kazoe = (birthYear: number, on: Ymd) => on.y - birthYear + 1;

/** その年に年齢が増える日 */
function birthdayIn(birth: Ymd, y: number): Ymd {
  if (birth.m === 2 && birth.d === 29 && !isLeap(y)) return { y, m: 3, d: 1 };
  return { y, m: birth.m, d: birth.d };
}

/** 次の誕生日 (on が誕生日なら、その日。days は on からの日数) */
export function nextBirthday(birth: Ymd, on: Ymd): { date: Ymd; age: number; days: number } {
  const start = Math.max(on.y, birth.y + 1);
  for (let y = start; ; y++) {
    const date = birthdayIn(birth, y);
    if (cmpYmd(date, on) >= 0) return { date, age: y - birth.y, days: diffDays(date, on) };
  }
}

// ---- 学校 ----

export interface SchoolStage {
  name: string;
  /** 「中学2年」の「中学」 */
  short: string;
  years: number;
}

export const SCHOOL_STAGES: SchoolStage[] = [
  { name: "小学校", short: "小学", years: 6 },
  { name: "中学校", short: "中学", years: 3 },
  { name: "高校", short: "高校", years: 3 },
  { name: "大学 (4年制)", short: "大学", years: 4 },
];

/**
 * 1月1日〜4月1日生まれ (早生まれ) か。
 * 4月1日生まれは、前の日 (3月31日) の終わりに年をとるので、早生まれの学年に入る
 */
export const isEarlyBorn = (birth: Pick<Ymd, "m" | "d">) => birth.m < 4 || (birth.m === 4 && birth.d === 1);

/** 小学校に入学する年 (その年の4月) */
export const elementaryEntryYear = (birthYear: number, early: boolean) => birthYear + (early ? 6 : 7);

export interface SchoolTerm {
  stage: SchoolStage;
  /** 入学する年 (4月) */
  entry: number;
  /** 卒業する年 (3月) */
  graduate: number;
}

/** 浪人・留年をしないときの、入学と卒業の年 */
export function schoolTerms(entryYear: number): SchoolTerm[] {
  let y = entryYear;
  return SCHOOL_STAGES.map((stage) => {
    const t = { stage, entry: y, graduate: y + stage.years };
    y += stage.years;
    return t;
  });
}

/** その日の学年 (「中学2年」)。入学前・卒業後はそのように返す */
export function gradeOn(entryYear: number, on: Ymd): string {
  const schoolYear = on.m >= 4 ? on.y : on.y - 1;
  let i = schoolYear - entryYear;
  if (i < 0) return "小学校に入る前";
  for (const s of SCHOOL_STAGES) {
    if (i < s.years) return `${s.short}${i + 1}年`;
    i -= s.years;
  }
  return "大学 (4年制) を卒業した後";
}

// ---- 入力を読む ----

export type Parsed =
  | { kind: "date"; date: Ymd; era?: Era; notes: string[] }
  | { kind: "year"; year: number; era?: Era; notes: string[] }
  | { kind: "age"; age: number };

const KANJI_DIGITS = "〇一二三四五六七八九";

/** 二十九 → 29、二〇二六 → 2026 */
function kanjiToInt(k: string): number {
  if (!/[十百千]/.test(k)) return Number([...k].map((c) => KANJI_DIGITS.indexOf(c)).join(""));
  let total = 0;
  let cur = 0;
  for (const c of k) {
    const n = KANJI_DIGITS.indexOf(c);
    if (n >= 0) {
      cur = n;
    } else {
      total += (cur || 1) * (c === "十" ? 10 : c === "百" ? 100 : 1000);
      cur = 0;
    }
  }
  return total + cur;
}

const ERA_RE = /^(明治|大正|昭和|平成|令和|[明大昭平令]|[MTSHR])/i;

function findEra(token: string): Era {
  const t = token.toUpperCase();
  return ERAS.find((e) => e.name === t || e.name[0] === t || e.abbr === t)!;
}

function checkDate(y: number, m: number, d: number): Ymd {
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error(`${y}年${m}月${d}日 という日はありません`);
  return { y, m, d };
}

const FORMAT_HELP = "1990/4/5・平成2年4月5日・H2.4.5・S60・36歳 のように入力してください";

/**
 * 生年月日・年・年齢を読む。
 * 西暦 (1990/4/5, 1990年4月5日, 19900405, 1990)、和暦 (平成2年4月5日, H2.4.5, H020405, 平成二年, 令和元年)、
 * 年齢 (36歳) を受け付ける。全角の数字や漢数字でもよい
 */
export function parseInput(input: string): Parsed {
  let s = input.normalize("NFKC").replace(/\s+/g, "");
  if (s === "") throw new Error(FORMAT_HELP);
  s = s.replace(/[〇一二三四五六七八九十百千]+/g, (k) => String(kanjiToInt(k))).replace(/(生まれ|生)$/, "");

  const age = /^(\d{1,3})[歳才]$/.exec(s);
  if (age) {
    const n = Number(age[1]);
    if (n > 150) throw new Error("年齢は 150 歳までで入力してください");
    return { kind: "age", age: n };
  }

  const em = ERA_RE.exec(s);
  if (em) {
    const era = findEra(em[1]);
    const rest = s.slice(em[1].length).replace(/^[.\-/]?元/, "1");
    const parts = /^\d{6}$/.test(rest) ? [rest.slice(0, 2), rest.slice(2, 4), rest.slice(4)] : rest.split(/[年月日.\-/]+/).filter(Boolean);
    if (!parts.every((p) => /^\d+$/.test(p)) || (parts.length !== 1 && parts.length !== 3)) {
      throw new Error(`和暦は 年だけ か 年月日 で入力してください (例: ${era.name}2年・${era.name}2年4月5日・${era.abbr}2.4.5)`);
    }
    const ey = Number(parts[0]);
    if (ey < 1) throw new Error("和暦の年は 1 (元年) から入力してください");
    const y = era.start.y + ey - 1;
    const next = nextEra(era);

    if (parts.length === 1) {
      const notes: string[] = [];
      if (next && y > next.start.y) {
        notes.push(
          `${era.name}は${eraYear(era, next.start.y)}年 (${next.start.y}年) までです。${era.name}${ey}年は ${y}年 (${formatWarekiYear(y)}) にあたります`,
        );
      }
      return { kind: "year", year: y, era, notes };
    }

    const date = checkDate(y, Number(parts[1]), Number(parts[2]));
    const notes: string[] = [];
    const actual = eraOfDate(date);
    if (actual !== era) {
      notes.push(
        cmpYmd(date, era.start) < 0
          ? `${era.name}は ${formatSeireki(era.start)} からです。この日は ${formatWareki(date)} にあたります`
          : `${era.name}は ${formatSeireki(addDays(next!.start, -1))} までです。この日は ${formatWareki(date)} にあたります`,
      );
    }
    if (isLunarEra(date)) notes.push(lunarNote);
    return { kind: "date", date, era, notes };
  }

  const parts = /^\d{8}$/.test(s) ? [s.slice(0, 4), s.slice(4, 6), s.slice(6)] : s.split(/[年月日.\-/]+/).filter(Boolean);
  if (!parts.every((p) => /^\d+$/.test(p))) throw new Error(FORMAT_HELP);
  if (!/^\d{4}$/.test(parts[0])) throw new Error("西暦は 4けた (例: 1990) で入力してください。和暦は 平成2年 や H2 のように元号をつけてください");
  if (parts.length !== 1 && parts.length !== 3) throw new Error("年だけ か 年月日 で入力してください (例: 1990・1990/4/5)");
  const y = Number(parts[0]);
  const notes: string[] = [];
  if (y < ERAS[0].start.y) notes.push("明治より前の元号には対応していないため、和暦は出せません");

  if (parts.length === 1) return { kind: "year", year: y, notes };
  const date = checkDate(y, Number(parts[1]), Number(parts[2]));
  if (isLunarEra(date)) notes.push(lunarNote);
  return { kind: "date", date, notes };
}

const lunarNote = "明治5年 (1872年) までは旧暦だったため、本当は和暦と西暦で月日がずれます。ここでは月日を同じとして計算しています";

/** 基準日の入力を読む (年月日まで必要) */
export function parseDate(input: string): Ymd {
  const p = parseInput(input);
  if (p.kind !== "date") throw new Error("基準日は年月日で入力してください (例: 2026/4/1・令和8年4月1日)");
  return p.date;
}
