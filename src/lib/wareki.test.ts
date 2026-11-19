import { describe, expect, it } from "vitest";
import {
  ageOn,
  elementaryEntryYear,
  eraChangeNote,
  eto,
  formatWareki,
  formatWarekiMonth,
  formatWarekiShort,
  formatWarekiYear,
  gradeOn,
  isEarlyBorn,
  kazoe,
  nextBirthday,
  parseDate,
  parseInput,
  schoolTerms,
  weekday,
} from "./wareki";

const ymd = (y: number, m: number, d: number) => ({ y, m, d });

describe("parseInput", () => {
  it("西暦の書き方", () => {
    for (const s of ["1990/4/5", "1990-04-05", "1990.4.5", "1990年4月5日", "19900405", "１９９０／４／５", " 1990 / 4 / 5 ", "1990年4月5日生まれ"]) {
      expect(parseInput(s)).toEqual({ kind: "date", date: ymd(1990, 4, 5), notes: [] });
    }
    expect(parseInput("1990")).toEqual({ kind: "year", year: 1990, notes: [] });
    expect(parseInput("1990年")).toEqual({ kind: "year", year: 1990, notes: [] });
  });

  it("和暦の書き方", () => {
    for (const s of ["平成2年4月5日", "H2.4.5", "h2/4/5", "H02.04.05", "H020405", "平2.4.5", "平成二年四月五日", "Ｈ２．４．５"]) {
      const p = parseInput(s);
      expect(p.kind === "date" && p.date).toEqual(ymd(1990, 4, 5));
    }
    expect(parseInput("令和元年5月1日")).toMatchObject({ kind: "date", date: ymd(2019, 5, 1), notes: [] });
    expect(parseInput("R1")).toMatchObject({ kind: "year", year: 2019 });
    expect(parseInput("S60")).toMatchObject({ kind: "year", year: 1985 });
    expect(parseInput("昭和六十四年")).toMatchObject({ kind: "year", year: 1989 });
    expect(parseInput("明治45年")).toMatchObject({ kind: "year", year: 1912, notes: [] });
    expect(parseInput("大正元年")).toMatchObject({ kind: "year", year: 1912 });
  });

  it("元号の範囲の外は、変換したうえで知らせる", () => {
    const p = parseInput("平成31年5月1日");
    expect(p).toMatchObject({ kind: "date", date: ymd(2019, 5, 1) });
    expect(p.kind === "date" && p.notes[0]).toContain("令和元年5月1日");
    const q = parseInput("令和元年4月30日");
    expect(q.kind === "date" && q.notes[0]).toContain("平成31年4月30日");
    const r = parseInput("平成40年");
    expect(r).toMatchObject({ kind: "year", year: 2028 });
    expect(r.kind === "year" && r.notes[0]).toContain("令和10年");
  });

  it("年齢", () => {
    expect(parseInput("36歳")).toEqual({ kind: "age", age: 36 });
    expect(parseInput("三十六才")).toEqual({ kind: "age", age: 36 });
  });

  it("読めないもの", () => {
    expect(() => parseInput("")).toThrow();
    expect(() => parseInput("90/4/5")).toThrow("4けた");
    expect(() => parseInput("1990/2/30")).toThrow("ありません");
    expect(() => parseInput("1990/4")).toThrow();
    expect(() => parseInput("H0")).toThrow();
    expect(() => parseInput("abc")).toThrow();
    expect(() => parseDate("1990")).toThrow("年月日");
  });
});

describe("和暦の表示", () => {
  it("年月日", () => {
    expect(formatWareki(ymd(1989, 1, 7))).toBe("昭和64年1月7日");
    expect(formatWareki(ymd(1989, 1, 8))).toBe("平成元年1月8日");
    expect(formatWareki(ymd(2019, 4, 30))).toBe("平成31年4月30日");
    expect(formatWareki(ymd(2019, 5, 1))).toBe("令和元年5月1日");
    expect(formatWareki(ymd(1912, 7, 30))).toBe("大正元年7月30日");
    expect(formatWareki(ymd(1926, 12, 25))).toBe("昭和元年12月25日");
    expect(formatWareki(ymd(1850, 1, 1))).toBe("");
    expect(formatWarekiShort(ymd(1990, 4, 5))).toBe("H2.4.5");
  });

  it("年と年月", () => {
    expect(formatWarekiYear(1990)).toBe("平成2年");
    expect(formatWarekiYear(2019)).toBe("平成31年 / 令和元年");
    expect(formatWarekiYear(1989)).toBe("昭和64年 / 平成元年");
    expect(eraChangeNote(2019)).toBe("4月30日までは平成、5月1日からは令和");
    expect(eraChangeNote(2020)).toBeNull();
    expect(formatWarekiMonth(2019, 4)).toBe("平成31年4月");
    expect(formatWarekiMonth(2019, 5)).toBe("令和元年5月");
  });

  it("曜日と干支", () => {
    expect(weekday(ymd(1990, 4, 5))).toBe("木");
    expect(eto(1990)).toEqual({ kanji: "庚午", kana: "かのえうま", animal: "午年" });
    expect(eto(2024).kanji).toBe("甲辰");
    expect(eto(1984).kanji).toBe("甲子");
  });
});

describe("年齢", () => {
  it("満年齢と数え年", () => {
    expect(ageOn(ymd(1990, 4, 5), ymd(2026, 4, 4))).toBe(35);
    expect(ageOn(ymd(1990, 4, 5), ymd(2026, 4, 5))).toBe(36);
    expect(kazoe(1990, ymd(2026, 1, 1))).toBe(37);
  });

  it("2月29日生まれは、うるう年でない年は3月1日に年をとる", () => {
    expect(ageOn(ymd(2000, 2, 29), ymd(2025, 2, 28))).toBe(24);
    expect(ageOn(ymd(2000, 2, 29), ymd(2025, 3, 1))).toBe(25);
    expect(nextBirthday(ymd(2000, 2, 29), ymd(2025, 1, 10))).toEqual({ date: ymd(2025, 3, 1), age: 25, days: 50 });
    expect(nextBirthday(ymd(2000, 2, 29), ymd(2028, 1, 10)).date).toEqual(ymd(2028, 2, 29));
  });

  it("次の誕生日", () => {
    expect(nextBirthday(ymd(1990, 4, 5), ymd(2026, 4, 5))).toEqual({ date: ymd(2026, 4, 5), age: 36, days: 0 });
    expect(nextBirthday(ymd(1990, 4, 5), ymd(2026, 11, 17))).toEqual({ date: ymd(2027, 4, 5), age: 37, days: 139 });
    // 生まれる前の日から見たときは、1歳の誕生日
    expect(nextBirthday(ymd(2026, 4, 5), ymd(2026, 1, 1)).age).toBe(1);
  });
});

describe("学校", () => {
  it("早生まれは4月1日生まれまで", () => {
    expect(isEarlyBorn({ m: 4, d: 1 })).toBe(true);
    expect(isEarlyBorn({ m: 4, d: 2 })).toBe(false);
    expect(isEarlyBorn({ m: 1, d: 1 })).toBe(true);
    expect(isEarlyBorn({ m: 12, d: 31 })).toBe(false);
  });

  it("入学と卒業の年", () => {
    // 1990年4月5日生まれ → 1997年4月に小学校へ入学
    expect(elementaryEntryYear(1990, false)).toBe(1997);
    expect(elementaryEntryYear(1991, true)).toBe(1997);
    expect(schoolTerms(1997).map((t) => [t.stage.short, t.entry, t.graduate])).toEqual([
      ["小学", 1997, 2003],
      ["中学", 2003, 2006],
      ["高校", 2006, 2009],
      ["大学", 2009, 2013],
    ]);
  });

  it("その日の学年", () => {
    expect(gradeOn(2020, ymd(2020, 3, 31))).toBe("小学校に入る前");
    expect(gradeOn(2020, ymd(2020, 4, 1))).toBe("小学1年");
    expect(gradeOn(2020, ymd(2026, 3, 31))).toBe("小学6年");
    expect(gradeOn(2020, ymd(2026, 4, 1))).toBe("中学1年");
    expect(gradeOn(2020, ymd(2035, 3, 31))).toBe("大学3年");
    expect(gradeOn(2020, ymd(2036, 4, 1))).toBe("大学 (4年制) を卒業した後");
  });
});
