/// <reference types="node" />
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeBase64Text, encodeBase64Text } from "./base64";
import { CASE_STYLES, convertLines, splitWords } from "./caseConvert";
import {
  contrastRatio,
  parseColor,
  toCmyk,
  toHex,
  toHslString,
  toOklch,
  oklchToRgb,
  toRgbString,
} from "./color";
import { digest, hmac, md5, toHex as bytesToHex } from "./hash";
import { encodeHtml } from "./htmlEntity";
import { formatJson, JsonError, parseJson } from "./json";
import { decodeJwt, jwtStatus, timeClaims } from "./jwt";
import { bitLength, formatInBase, parseInBase } from "./numberBase";
import {
  charGroups,
  DEFAULT_PASSWORD_OPTIONS,
  entropyBits,
  generatePassword,
  isPasswordOptions,
  normalizeSymbols,
  optionProblem,
} from "./password";
import { buildRegex, findMatches } from "./regex";
import { scoreTool, searchTools } from "./search";
import { textStats } from "./textStats";
import {
  formatRelative,
  formatWareki,
  guessUnit,
  isoWithOffset,
  parseTimeInput,
} from "./timestamp";
import { decodeUrl, encodeUrl, parseUrlParts } from "./urlCodec";
import { formatUuid, uuidV4, uuidV7Batch, uuidV7Time } from "./uuid";
import { hiraToKata, kataToHira, toHankaku, toZenkaku } from "./zenhan";

const enc = (s: string) => new TextEncoder().encode(s);

describe("json", () => {
  it("整形してキーの順番と大きな数値を保つ", () => {
    const src = '{"b":1,"a":[1,2,{"x":12345678901234567890}],"c":"あ\\n"}';
    expect(formatJson(src, { indent: "2" })).toBe(
      '{\n  "b": 1,\n  "a": [\n    1,\n    2,\n    {\n      "x": 12345678901234567890\n    }\n  ],\n  "c": "あ\\n"\n}',
    );
  });

  it("圧縮・キーの並べ替え・非ASCIIのエスケープ", () => {
    expect(formatJson('{ "b": 1, "a": [ ] , "c":{}}', { indent: "minify", sortKeys: true })).toBe(
      '{"a":[],"b":1,"c":{}}',
    );
    expect(formatJson('"日本"', { indent: "2", escapeUnicode: true })).toBe('"\\u65e5\\u672c"');
  });

  it("間違いの行と列を示す", () => {
    try {
      parseJson('{\n  "a": 1,\n  "b": tru\n}');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(JsonError);
      const je = e as JsonError;
      expect(je.line).toBe(3);
      expect(je.column).toBe(8);
    }
    expect(() => parseJson("[1,2,]")).toThrow(/最後の要素/);
    expect(() => parseJson("{'a':1}")).toThrow(/キー/);
    expect(() => parseJson("1 2")).toThrow(/余分/);
    expect(() => parseJson("")).toThrow(/空/);
  });

  it("JSON.parse と同じ値になる", () => {
    const src = '{"s":"\\u00e9\\t\\"q\\"","n":-1.5e3,"t":true,"f":false,"z":null}';
    expect(JSON.parse(formatJson(src, { indent: "4" }))).toEqual(JSON.parse(src));
  });
});

describe("hash", () => {
  it("MD5 の既知の値", () => {
    expect(bytesToHex(md5(enc("")))).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(bytesToHex(md5(enc("abc")))).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(bytesToHex(md5(enc("The quick brown fox jumps over the lazy dog")))).toBe(
      "9e107d9d372bb6826bd81d3542a419d6",
    );
  });

  it("MD5 は境界の長さでも Node の実装と一致する", () => {
    for (const len of [55, 56, 57, 63, 64, 65, 119, 120, 1000]) {
      const s = "あa".repeat(len).slice(0, len);
      expect(bytesToHex(md5(enc(s)))).toBe(createHash("md5").update(s).digest("hex"));
    }
  });

  it("HMAC は Node の実装と一致する (鍵がブロックより長い場合も)", async () => {
    const { createHmac } = await import("node:crypto");
    for (const algo of ["MD5", "SHA-1", "SHA-256", "SHA-384", "SHA-512"] as const) {
      for (const key of ["key", "k".repeat(200)]) {
        const nodeAlgo = algo.toLowerCase().replace("-", "");
        expect(bytesToHex(await hmac(algo, enc(key), enc("日本語のメッセージ")))).toBe(
          createHmac(nodeAlgo, key).update("日本語のメッセージ").digest("hex"),
        );
      }
    }
  });

  it("SHA 系", async () => {
    expect(bytesToHex(await digest("SHA-256", enc("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(bytesToHex(await digest("SHA-1", enc("日本語")), true)).toBe(
      createHash("sha1").update("日本語").digest("hex").toUpperCase(),
    );
  });
});

describe("base64", () => {
  it("UTF-8 で往復できる", () => {
    const s = "こんにちは 🌸 Hello";
    expect(decodeBase64Text(encodeBase64Text(s))).toBe(s);
    expect(encodeBase64Text("日本")).toBe("5pel5pys");
  });

  it("URLセーフ・パディング省略・改行入りを読む", () => {
    expect(encodeBase64Text("??>", { urlSafe: true })).toBe("Pz8-");
    expect(decodeBase64Text("Pz8-")).toBe("??>");
    expect(decodeBase64Text("5pel\n5pys")).toBe("日本");
    expect(decodeBase64Text("YQ")).toBe("a");
  });

  it("読めない入力", () => {
    expect(() => decodeBase64Text("あ")).toThrow(/使えない文字/);
    expect(() => decodeBase64Text("/w==")).toThrow(/UTF-8/);
  });
});

describe("url", () => {
  it("エンコード・デコード", () => {
    expect(encodeUrl("a b&c=日本", "component")).toBe("a%20b%26c%3D%E6%97%A5%E6%9C%AC");
    expect(encodeUrl("a b", "form")).toBe("a+b");
    expect(encodeUrl("https://x.jp/a b?q=1", "uri")).toBe("https://x.jp/a%20b?q=1");
    expect(decodeUrl("a+b%20c", true)).toBe("a b c");
    expect(decodeUrl("a+b", false)).toBe("a+b");
    expect(() => decodeUrl("%E6%97", false)).toThrow();
  });

  it("URLを分解する", () => {
    const p = parseUrlParts("https://user@example.com:8080/a/%E6%97%A5?q=1&q=2&x=%20#top")!;
    expect(p.host).toBe("example.com");
    expect(p.port).toBe("8080");
    expect(p.pathname).toBe("/a/日");
    expect(p.params).toEqual([
      ["q", "1"],
      ["q", "2"],
      ["x", " "],
    ]);
    expect(p.hash).toBe("top");
    expect(parseUrlParts("not a url")).toBeNull();
  });
});

describe("html", () => {
  it("エンコード", () => {
    expect(encodeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(encodeHtml("é日", { nonAscii: true })).toBe("&#xE9;&#x65E5;");
  });
});

describe("jwt", () => {
  // jwt.io のサンプル
  const token =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  it("中身を読む", () => {
    const d = decodeJwt(`Bearer ${token}`);
    expect(d.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(d.payload).toMatchObject({ sub: "1234567890", name: "John Doe" });
    expect(timeClaims(d.payload).map((c) => c.key)).toEqual(["iat"]);
    expect(jwtStatus(d.payload)).toBe("unknown");
  });

  it("有効期限の状態", () => {
    expect(jwtStatus({ exp: 100 }, 200_000)).toBe("expired");
    expect(jwtStatus({ exp: 300 }, 200_000)).toBe("valid");
    expect(jwtStatus({ nbf: 300, exp: 400 }, 200_000)).toBe("notYet");
  });

  it("形が違う", () => {
    expect(() => decodeJwt("abc")).toThrow(/3つ/);
    expect(() => decodeJwt("a.b.c.d.e")).toThrow(/JWE/);
    expect(() => decodeJwt("e30.bm90IGpzb24.x")).toThrow(/ペイロード/);
  });
});

describe("uuid", () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("v4 の形", () => {
    for (let i = 0; i < 50; i++) expect(uuidV4()).toMatch(V4);
  });

  it("v7 は時刻を持ち、作った順に並ぶ", () => {
    const now = Date.UTC(2026, 10, 12, 1, 2, 3, 456);
    const list = uuidV7Batch(1000, now);
    expect(list).toHaveLength(1000);
    for (const u of list) expect(u).toMatch(V7);
    expect([...list].sort()).toEqual(list);
    expect(uuidV7Time(list[0])!.getTime()).toBe(now);
    expect(uuidV7Time(uuidV4())).toBeNull();
  });

  it("書式", () => {
    const u = "0190a6b2-1c3d-7e4f-8a9b-0c1d2e3f4a5b";
    expect(formatUuid(u, { upper: true, hyphens: false, braces: true })).toBe(
      "{0190A6B21C3D7E4F8A9B0C1D2E3F4A5B}",
    );
  });
});

describe("password", () => {
  // 条件ごとの確かめやすさのため、初期設定から「続けない」「見間違えやすい英数字を除く」を外しておく
  const base = { ...DEFAULT_PASSWORD_OPTIONS, length: 16, symbols: false, noRepeat: false, excludeAmbiguous: false };
  const many = <T,>(n: number, f: () => T) => Array.from({ length: n }, f);

  it("選んだ種類を必ず含む", () => {
    for (const p of many(200, () => generatePassword({ ...base, length: 4, symbols: true }))) {
      expect(p).toHaveLength(4);
      expect(p).toMatch(/[a-z]/);
      expect(p).toMatch(/[A-Z]/);
      expect(p).toMatch(/\d/);
      expect(p).toMatch(/[^a-zA-Z0-9]/);
    }
  });

  it("見間違えやすい英数字を除く (選んだ記号はそのまま)", () => {
    const groups = charGroups({ ...base, symbols: true, symbolSet: "|.,()", excludeAmbiguous: true });
    const chars = groups.map((g) => g.chars).join("");
    for (const c of "0Oo1lI") expect(chars).not.toContain(c);
    expect(groups.find((g) => g.kind === "symbols")?.chars).toBe("(),.|");
    for (const p of many(50, () => generatePassword({ ...base, excludeAmbiguous: true }))) {
      expect(p).not.toMatch(/[0Oo1lI]/);
    }
  });

  it("選んだ記号だけを使う", () => {
    const opts = { ...base, symbols: true, symbolSet: "-_", length: 30 };
    for (const p of many(100, () => generatePassword(opts))) {
      expect(p).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(p).toMatch(/[_-]/);
    }
    expect(normalizeSymbols("*&!x!")).toBe("!&*");
  });

  it("先頭の文字を英字・英数字にする", () => {
    for (const p of many(300, () => generatePassword({ ...base, symbols: true, first: "letter" }))) {
      expect(p).toMatch(/^[a-zA-Z]/);
    }
    for (const p of many(300, () => generatePassword({ ...base, symbols: true, first: "alnum" }))) {
      expect(p).toMatch(/^[a-zA-Z0-9]/);
    }
  });

  it("同じ文字を続けない", () => {
    // 数字だけで長くすると、ふつうはほぼ必ずどこかで続く
    const opts = { ...base, lower: false, upper: false, length: 128, noRepeat: true };
    for (const p of many(50, () => generatePassword(opts))) {
      expect(p).toHaveLength(128);
      expect(p).not.toMatch(/(.)\1/);
    }
  });

  it("使わない文字を除く", () => {
    const opts = { ...base, symbols: true, exclude: "aeiouAEIOU!" };
    for (const p of many(100, () => generatePassword(opts))) expect(p).not.toMatch(/[aeiouAEIOU!]/);
  });

  it("作れない条件は理由を返す", () => {
    expect(optionProblem(base)).toBeNull();
    expect(optionProblem({ ...base, lower: false, upper: false, digits: false })).toMatch("種類を1つ以上");
    expect(optionProblem({ ...base, symbols: true, symbolSet: "" })).toMatch("記号を1つ以上");
    expect(optionProblem({ ...base, digits: true, exclude: "0123456789" })).toMatch("数字に使える文字");
    expect(optionProblem({ ...base, lower: false, upper: false, first: "letter" })).toMatch("先頭を英字");
    expect(optionProblem({ ...base, lower: false, upper: false, first: "alnum" })).toBeNull();
    expect(optionProblem({ ...base, symbols: true, length: 3 })).toMatch("長さ (3文字) より多く");
    expect(generatePassword({ ...base, lower: false, upper: false, digits: false })).toBe("");
    // 使える文字が1つだけでは、続けずに並べられない
    const one = { ...base, lower: false, upper: false, digits: false, symbols: true, symbolSet: "-", noRepeat: true };
    expect(optionProblem(one)).toMatch("2つ以上");
    expect(generatePassword(one)).toBe("");
  });

  it("エントロピー", () => {
    expect(entropyBits({ ...base, upper: false, digits: false, length: 10 })).toBeCloseTo(10 * Math.log2(26));
    // 先頭が英字 (52通り)、残りは数字も含めた 62通り
    expect(entropyBits({ ...base, length: 10, first: "letter" })).toBeCloseTo(Math.log2(52) + 9 * Math.log2(62));
    expect(entropyBits({ ...base, lower: false, upper: false, digits: false })).toBe(0);
  });

  it("初期設定: すべての種類・よく使われる8種の記号・続けない・見間違えやすい英数字を除く", () => {
    const d = DEFAULT_PASSWORD_OPTIONS;
    expect([d.lower, d.upper, d.digits, d.symbols, d.noRepeat, d.excludeAmbiguous]).toEqual([true, true, true, true, true, true]);
    expect(d.symbolSet).toBe(normalizeSymbols("!@#$%^&*"));
    expect(d.first).toBe("any");
    for (const p of many(100, () => generatePassword(d))) {
      expect(p).toMatch(/^[a-zA-Z0-9!@#$%^&*]+$/);
      expect(p).not.toMatch(/[0Oo1lI]/);
      expect(p).not.toMatch(/(.)\1/);
    }
  });

  it("保存した設定を読める", () => {
    expect(isPasswordOptions(DEFAULT_PASSWORD_OPTIONS)).toBe(true);
    expect(isPasswordOptions({ ...DEFAULT_PASSWORD_OPTIONS, first: "x" })).toBe(false);
    expect(isPasswordOptions({ length: 20, lower: true })).toBe(false);
  });
});

describe("case", () => {
  it("単語に分ける", () => {
    expect(splitWords("XMLHttpRequest")).toEqual(["XML", "Http", "Request"]);
    expect(splitWords("user_id-value name")).toEqual(["user", "id", "value", "name"]);
    expect(splitWords("getHTTP2Response")).toEqual(["get", "HTTP2", "Response"]);
  });

  it("各スタイル", () => {
    const get = (id: string) => CASE_STYLES.find((s) => s.id === id)!;
    expect(get("camel").convert("hello world API")).toBe("helloWorldApi");
    expect(get("pascal").convert("hello_world")).toBe("HelloWorld");
    expect(get("snake").convert("helloWorld")).toBe("hello_world");
    expect(get("constant").convert("helloWorld")).toBe("HELLO_WORLD");
    expect(get("kebab").convert("Hello World")).toBe("hello-world");
    expect(get("sentence").convert("HELLO_WORLD")).toBe("Hello world");
    expect(convertLines("fooBar\n\nbaz_qux", get("kebab"))).toBe("foo-bar\n\nbaz-qux");
  });
});

describe("zenhan", () => {
  const all = { alnum: true, symbol: true, space: true, kana: true };

  it("全角 → 半角", () => {
    expect(toHankaku("ＡＢＣ１２３！　ガパヴ。「テスト」", all)).toBe("ABC123! ｶﾞﾊﾟｳﾞ｡｢ﾃｽﾄ｣");
    expect(toHankaku("ＡＢＣ！", { ...all, symbol: false })).toBe("ABC！");
    expect(toHankaku("カナＡ", { ...all, kana: false })).toBe("カナA");
  });

  it("半角 → 全角 (濁点をまとめる)", () => {
    expect(toZenkaku("ABC123! ｶﾞﾊﾟｳﾞﾃｽﾄ", all)).toBe("ＡＢＣ１２３！　ガパヴテスト");
    expect(toZenkaku("ｱﾞ", all)).toBe("ア゛");
    expect(toZenkaku("abc ｶﾅ", { ...all, alnum: false, space: false })).toBe("abc カナ");
  });

  it("ひらがな ⇔ カタカナ", () => {
    expect(hiraToKata("ひらがな と ゔ")).toBe("ヒラガナ ト ヴ");
    expect(kataToHira("カタカナ ヶ月")).toBe("かたかな ヶ月");
  });
});

describe("textStats", () => {
  it("数える", () => {
    // 家族の絵文字・半角の濁点つきはそれぞれ1文字、改行も1文字
    const s = textStats("あいう abc\n👨‍👩‍👧\n\nｶﾞ");
    expect(s.chars).toBe(12);
    expect(s.charsNoSpace).toBe(8);
    expect(s.lines).toBe(4);
    expect(s.blankLines).toBe(1);
    expect(s.utf8Bytes).toBe(new TextEncoder().encode("あいう abc\n👨‍👩‍👧\n\nｶﾞ").length);
    expect(s.halfWidth).toBe(6);
    expect(textStats("").lines).toBe(0);
    expect(textStats("").manuscriptPages).toBe(0);
  });

  it("原稿用紙の枚数", () => {
    expect(textStats("あ".repeat(400)).manuscriptPages).toBe(1);
    expect(textStats("あ".repeat(401)).manuscriptPages).toBe(2);
    expect(textStats("あ\n".repeat(21).trimEnd()).manuscriptPages).toBe(2);
  });
});

describe("timestamp", () => {
  it("桁数で単位を推測", () => {
    expect(guessUnit(10)).toBe("s");
    expect(guessUnit(13)).toBe("ms");
    expect(guessUnit(16)).toBe("us");
    expect(guessUnit(19)).toBe("ns");
  });

  it("数値を読む", () => {
    expect(parseTimeInput("1700000000", "auto").date.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(parseTimeInput("1700000000123", "auto")).toMatchObject({ detected: "ms" });
    expect(parseTimeInput("1,700,000,000", "auto").date.getTime()).toBe(1700000000000);
    expect(parseTimeInput("1700000000", "ms").date.getTime()).toBe(1700000000);
  });

  it("日時の文字列を読む", () => {
    expect(parseTimeInput("2026-11-12 10:00:00+09:00", "auto").date.toISOString()).toBe(
      "2026-11-12T01:00:00.000Z",
    );
    expect(parseTimeInput("2026/11/12 10:00:00Z", "auto").date.toISOString()).toBe(
      "2026-11-12T10:00:00.000Z",
    );
    expect(parseTimeInput("2026年11月12日 10時05分", "auto").date.getMinutes()).toBe(5);
    expect(parseTimeInput("Thu, 12 Nov 2026 01:00:00 GMT", "auto").date.toISOString()).toBe(
      "2026-11-12T01:00:00.000Z",
    );
    expect(() => parseTimeInput("hello", "auto")).toThrow();
  });

  it("書式", () => {
    const d = new Date("2026-11-12T01:00:00.250Z");
    expect(isoWithOffset(d, "Asia/Tokyo")).toBe("2026-11-12T10:00:00.250+09:00");
    expect(isoWithOffset(d, "UTC")).toBe("2026-11-12T01:00:00.250+00:00");
    expect(isoWithOffset(d, "America/New_York")).toBe("2026-11-11T20:00:00.250-05:00");
    expect(formatWareki(d, "Asia/Tokyo")).toBe("令和8年11月12日");
    expect(formatRelative(new Date(0), 3 * 3600 * 1000)).toBe("3 時間前");
  });
});

describe("numberBase", () => {
  it("読み取りと書き出し", () => {
    expect(parseInBase("0xff", 16)).toBe(255n);
    expect(parseInBase("1111_0000", 2)).toBe(240n);
    expect(parseInBase("-1,234", 10)).toBe(-1234n);
    expect(parseInBase("18446744073709551616", 10)).toBe(2n ** 64n);
    expect(() => parseInBase("12", 2)).toThrow(/2進数/);
    expect(formatInBase(255n, 2, { group: true })).toBe("1111 1111");
    expect(formatInBase(5n, 2, { group: true })).toBe("0101");
    expect(formatInBase(1234567n, 10, { group: true })).toBe("1,234,567");
    expect(formatInBase(0xabcden, 16, { group: true, upper: true })).toBe("000A BCDE");
    expect(formatInBase(-255n, 16)).toBe("-ff");
    expect(bitLength(255n)).toBe(8);
  });
});

describe("color", () => {
  it("いろいろな書き方を読む", () => {
    expect(parseColor("#f80")).toEqual({ r: 255, g: 136, b: 0, a: 1 });
    expect(parseColor("#ff880080")!.a).toBeCloseTo(0.502, 2);
    expect(parseColor("rgb(255 136 0 / 50%)")).toEqual({ r: 255, g: 136, b: 0, a: 0.5 });
    expect(toHex(parseColor("hsl(32, 100%, 50%)")!)).toBe("#ff8800");
    expect(toHex(parseColor("orange")!)).toBe("#ffa500");
    expect(toHex(parseColor("255, 0, 128")!)).toBe("#ff0080");
    expect(parseColor("nope")).toBeNull();
  });

  it("変換", () => {
    const c = parseColor("#3366cc")!;
    expect(toRgbString(c)).toBe("rgb(51, 102, 204)");
    expect(toHslString(c)).toBe("hsl(220, 60%, 50%)");
    expect(toCmyk(c).k).toBeCloseTo(20);
    expect(toCmyk(c).c).toBeCloseTo(75);
    const { l, c: ch, h } = toOklch(c);
    const back = oklchToRgb(l, ch, h);
    expect(Math.round(back.r)).toBe(51);
    expect(Math.round(back.b)).toBe(204);
  });

  it("コントラスト比", () => {
    expect(contrastRatio(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21);
    expect(contrastRatio(parseColor("#777")!, parseColor("#fff")!)).toBeCloseTo(4.48, 1);
  });
});

describe("regex", () => {
  it("一致を探す", () => {
    const re = buildRegex("(?<y>\\d{4})-(\\d{2})", "g");
    const { matches } = findMatches(re, "2026-11 と 2027-01");
    expect(matches.map((m) => m.text)).toEqual(["2026-11", "2027-01"]);
    expect(matches[0].groups).toEqual([
      { name: "$1", value: "2026" },
      { name: "$2", value: "11" },
      { name: "<y>", value: "2026" },
    ]);
  });

  it("長さ0の一致で止まらない", () => {
    expect(findMatches(buildRegex("", "gu"), "a😀b").matches).toHaveLength(4);
    expect(findMatches(buildRegex("x*", "g"), "abc", 2).truncated).toBe(true);
  });

  it("g が無ければ最初だけ", () => {
    expect(findMatches(buildRegex("a", ""), "aaa").matches).toHaveLength(1);
    expect(() => buildRegex("(", "")).toThrow();
  });
});

describe("search", () => {
  const tools = [
    { name: "JSON整形", en: "JSON Formatter", keywords: ["pretty", "minify"], description: "" },
    { name: "JSON ⇔ YAML", en: "JSON YAML Converter", keywords: ["yml"], description: "" },
    { name: "ハッシュ生成", en: "Hash Generator", keywords: ["md5", "sha256"], description: "" },
  ];

  it("名前・英語名・キーワード・全角で探せる", () => {
    expect(searchTools(tools, "yaml")[0].en).toBe("JSON YAML Converter");
    expect(searchTools(tools, "ＭＤ５")[0].name).toBe("ハッシュ生成");
    expect(searchTools(tools, "はっしゅ")[0].name).toBe("ハッシュ生成");
    expect(searchTools(tools, "json minify")).toHaveLength(1);
    expect(scoreTool(tools[0], "nothing")).toBe(0);
    expect(searchTools(tools, " ")).toHaveLength(3);
  });
});
