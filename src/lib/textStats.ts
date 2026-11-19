/** 文字数・バイト数などの数え上げ */

export interface TextStats {
  /** 見た目の文字数 (絵文字の組み合わせ・濁点つきなども1文字) */
  chars: number;
  /** 空白・改行を除いた文字数 */
  charsNoSpace: number;
  /** コードポイント数 */
  codePoints: number;
  /** UTF-16 の単位数 (JavaScript の length / Excel の LEN と同じ) */
  utf16: number;
  utf8Bytes: number;
  /** Shift_JIS にしたときのバイト数 (表せない文字は2バイトとして数える概算) */
  sjisBytes: number;
  /** 全角文字の数 */
  fullWidth: number;
  /** 半角文字の数 (ASCII と半角カナ) */
  halfWidth: number;
  lines: number;
  blankLines: number;
  words: number;
  /** 400字詰め原稿用紙の枚数 (改行で次の行へ送る) */
  manuscriptPages: number;
}

const graphemeSeg = new Intl.Segmenter("ja", { granularity: "grapheme" });
const wordSeg = new Intl.Segmenter("ja", { granularity: "word" });

function countGraphemes(s: string) {
  let n = 0;
  for (const _ of graphemeSeg.segment(s)) n++;
  return n;
}

function isHalfWidth(cp: number) {
  return cp < 0x80 || (cp >= 0xff61 && cp <= 0xff9f);
}

export function textStats(text: string): TextStats {
  let codePoints = 0;
  let sjisBytes = 0;
  let halfWidth = 0;
  let fullWidth = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    codePoints++;
    if (cp === 10 || cp === 13) continue;
    if (isHalfWidth(cp)) {
      sjisBytes += 1;
      halfWidth++;
    } else {
      sjisBytes += 2;
      fullWidth++;
    }
  }
  // 改行も Shift_JIS ではバイトを使う (CRLF なら2)
  sjisBytes += (text.match(/\r|\n/g) ?? []).length;

  let chars = 0;
  let charsNoSpace = 0;
  for (const { segment } of graphemeSeg.segment(text)) {
    chars++;
    if (!/^\s+$/u.test(segment)) charsNoSpace++;
  }

  const lineList = text === "" ? [] : text.split(/\r\n|\r|\n/);
  let words = 0;
  for (const s of wordSeg.segment(text)) if (s.isWordLike) words++;

  // 原稿用紙: 1行20字、改行で次の行へ。20行で1枚
  let rows = 0;
  for (const line of lineList) rows += Math.max(1, Math.ceil(countGraphemes(line) / 20));

  return {
    chars,
    charsNoSpace,
    codePoints,
    utf16: text.length,
    utf8Bytes: new TextEncoder().encode(text).length,
    sjisBytes,
    fullWidth,
    halfWidth,
    lines: lineList.length,
    blankLines: lineList.filter((l) => l.trim() === "").length,
    words,
    manuscriptPages: rows === 0 ? 0 : Math.ceil(rows / 20),
  };
}
