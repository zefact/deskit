/** 識別子・文のケース (camelCase / snake_case など) の変換 */

/**
 * 単語に分ける。
 * camelCase の境目、連続する大文字 (XMLHttp → XML Http)、記号・空白で区切る
 */
export function splitWords(s: string): string[] {
  return s
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

export interface CaseStyle {
  id: string;
  label: string;
  convert: (line: string) => string;
}

const words = (line: string) => splitWords(line);

export const CASE_STYLES: CaseStyle[] = [
  {
    id: "camel",
    label: "camelCase",
    convert: (l) =>
      words(l)
        .map((w, i) => (i === 0 ? w.toLowerCase() : cap(w)))
        .join(""),
  },
  { id: "pascal", label: "PascalCase", convert: (l) => words(l).map(cap).join("") },
  {
    id: "snake",
    label: "snake_case",
    convert: (l) =>
      words(l)
        .map((w) => w.toLowerCase())
        .join("_"),
  },
  {
    id: "constant",
    label: "CONSTANT_CASE",
    convert: (l) =>
      words(l)
        .map((w) => w.toUpperCase())
        .join("_"),
  },
  {
    id: "kebab",
    label: "kebab-case",
    convert: (l) =>
      words(l)
        .map((w) => w.toLowerCase())
        .join("-"),
  },
  { id: "train", label: "Train-Case", convert: (l) => words(l).map(cap).join("-") },
  {
    id: "dot",
    label: "dot.case",
    convert: (l) =>
      words(l)
        .map((w) => w.toLowerCase())
        .join("."),
  },
  {
    id: "path",
    label: "path/case",
    convert: (l) =>
      words(l)
        .map((w) => w.toLowerCase())
        .join("/"),
  },
  { id: "title", label: "Title Case", convert: (l) => words(l).map(cap).join(" ") },
  {
    id: "sentence",
    label: "Sentence case",
    convert: (l) => {
      const s = words(l)
        .map((w) => w.toLowerCase())
        .join(" ");
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
  },
  { id: "lower", label: "lower case", convert: (l) => l.toLowerCase() },
  { id: "upper", label: "UPPER CASE", convert: (l) => l.toUpperCase() },
];

/** 行ごとに変換する (空行はそのまま残す) */
export function convertLines(text: string, style: CaseStyle): string {
  return text
    .split(/\r?\n/)
    .map((line) => (line.trim() === "" ? line : style.convert(line)))
    .join("\n");
}
