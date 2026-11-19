/** 全角・半角の変換と、ひらがな・カタカナの変換 */

export interface ZenhanTargets {
  /** 英字と数字 */
  alnum: boolean;
  /** 記号 (! # $ % など) */
  symbol: boolean;
  /** 空白 */
  space: boolean;
  /** カタカナ (と、句読点などのカナ記号) */
  kana: boolean;
}

const HALF_KANA = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ｡｢｣､･";
const FULL_KANA = "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン。「」、・";

const HALF_TO_FULL_KANA = new Map<string, string>();
const FULL_TO_HALF_KANA = new Map<string, string>();
for (let i = 0; i < HALF_KANA.length; i++) {
  HALF_TO_FULL_KANA.set(HALF_KANA[i], FULL_KANA[i]);
  FULL_TO_HALF_KANA.set(FULL_KANA[i], HALF_KANA[i]);
}

const HALF_DAKUTEN = "ﾞ";
const HALF_HANDAKUTEN = "ﾟ";

function isAlnum(c: number) {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/** 全角 → 半角 */
export function toHankaku(text: string, t: ZenhanTargets): string {
  let out = "";
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    // 全角英数・記号 (U+FF01〜U+FF5E) は半角とちょうど 0xFEE0 ずれている
    if (c >= 0xff01 && c <= 0xff5e) {
      const half = c - 0xfee0;
      if (isAlnum(half) ? t.alnum : t.symbol) {
        out += String.fromCharCode(half);
        continue;
      }
    }
    if (c === 0x3000 && t.space) {
      out += " ";
      continue;
    }
    if (t.kana) {
      const direct = FULL_TO_HALF_KANA.get(ch);
      if (direct) {
        out += direct;
        continue;
      }
      // 濁点・半濁点つき (ガ・パ・ヴ など) は、元の字と濁点に分けて置き換える
      const nfd = ch.normalize("NFD");
      if (nfd.length === 2) {
        const base = FULL_TO_HALF_KANA.get(nfd[0]);
        if (base && nfd[1] === "゙") {
          out += base + HALF_DAKUTEN;
          continue;
        }
        if (base && nfd[1] === "゚") {
          out += base + HALF_HANDAKUTEN;
          continue;
        }
      }
      if (ch === "゛" || ch === "゙") {
        out += HALF_DAKUTEN;
        continue;
      }
      if (ch === "゜" || ch === "゚") {
        out += HALF_HANDAKUTEN;
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** 半角 → 全角 */
export function toZenkaku(text: string, t: ZenhanTargets): string {
  const chars = [...text];
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const c = ch.codePointAt(0)!;
    if (c >= 0x21 && c <= 0x7e) {
      if (isAlnum(c) ? t.alnum : t.symbol) {
        out += String.fromCharCode(c + 0xfee0);
        continue;
      }
    }
    if (c === 0x20 && t.space) {
      out += "　";
      continue;
    }
    if (t.kana) {
      const full = HALF_TO_FULL_KANA.get(ch);
      if (full) {
        const next = chars[i + 1];
        if (next === HALF_DAKUTEN || next === HALF_HANDAKUTEN) {
          const mark = next === HALF_DAKUTEN ? "゙" : "゚";
          const composed = (full + mark).normalize("NFC");
          if (composed.length === 1) {
            out += composed;
            i++;
            continue;
          }
        }
        out += full;
        continue;
      }
      if (ch === HALF_DAKUTEN) {
        out += "゛";
        continue;
      }
      if (ch === HALF_HANDAKUTEN) {
        out += "゜";
        continue;
      }
    }
    out += ch;
  }
  return out;
}

/** ひらがな → カタカナ */
export function hiraToKata(text: string): string {
  return text.replace(/[ぁ-ゖゝゞ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

/** カタカナ → ひらがな (ヷ〜ヺ・ヵヶ以外) */
export function kataToHira(text: string): string {
  return text.replace(/[ァ-ヶヽヾ]/g, (ch) => {
    // ヵ・ヶ は ゕ・ゖ にせず、そのまま残すのが一般的
    if (ch === "ヵ" || ch === "ヶ") return ch;
    return String.fromCharCode(ch.charCodeAt(0) - 0x60);
  });
}
