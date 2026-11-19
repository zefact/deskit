/**
 * JSONの読み取りと整形。
 *
 * JSON.parse を使わずに自前で読むのは次の理由から:
 * - 間違いの場所 (行・列) を示したい (WKWebView の JSON.parse は位置を返さない)
 * - 大きな整数や小数の桁を落とさずにそのまま書き戻したい
 *   (12345678901234567890 が 12345678901234567000 にならない)
 * - キーの並び (重複も含む) を入力どおりに保ちたい
 */

export type JsonNode =
  | { kind: "object"; entries: [string, JsonNode][] }
  | { kind: "array"; items: JsonNode[] }
  | { kind: "string"; value: string }
  /** 数値は書かれた文字のまま持つ (桁落ちさせないため) */
  | { kind: "number"; raw: string }
  | { kind: "bool"; value: boolean }
  | { kind: "null" };

export class JsonError extends Error {
  constructor(
    message: string,
    readonly offset: number,
    readonly line: number,
    readonly column: number,
  ) {
    super(message);
  }
}

/** 文字位置から行・列 (どちらも1始まり) を求める */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, column: offset - last };
}

export function parseJson(text: string): JsonNode {
  let pos = 0;

  const fail = (message: string, at = pos): never => {
    const { line, column } = lineColumn(text, at);
    throw new JsonError(message, at, line, column);
  };

  const describe = (at: number) => {
    if (at >= text.length) return "入力の終わり";
    return `「${text[at]}」`;
  };

  const skipWs = () => {
    while (pos < text.length) {
      const c = text.charCodeAt(pos);
      // 空白・タブ・改行・CR、先頭のBOM
      if (c === 32 || c === 9 || c === 10 || c === 13 || c === 0xfeff) pos++;
      else break;
    }
  };

  const expect = (ch: string) => {
    if (text[pos] !== ch) fail(`${describe(pos)} の位置に「${ch}」が必要です`);
    pos++;
  };

  const readString = (): string => {
    const start = pos;
    expect('"');
    let out = "";
    let chunkStart = pos;
    while (true) {
      if (pos >= text.length) fail("文字列が閉じられていません", start);
      const c = text.charCodeAt(pos);
      if (c === 34) {
        out += text.slice(chunkStart, pos);
        pos++;
        return out;
      }
      if (c === 92) {
        out += text.slice(chunkStart, pos);
        const esc = text[pos + 1];
        switch (esc) {
          case '"':
          case "\\":
          case "/":
            out += esc;
            pos += 2;
            break;
          case "b":
            out += "\b";
            pos += 2;
            break;
          case "f":
            out += "\f";
            pos += 2;
            break;
          case "n":
            out += "\n";
            pos += 2;
            break;
          case "r":
            out += "\r";
            pos += 2;
            break;
          case "t":
            out += "\t";
            pos += 2;
            break;
          case "u": {
            const hex = text.slice(pos + 2, pos + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("\\u のあとには16進数4桁が必要です");
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 6;
            break;
          }
          default:
            fail(`使えないエスケープ「\\${esc ?? ""}」です`);
        }
        chunkStart = pos;
        continue;
      }
      if (c < 0x20) fail("文字列の中に改行や制御文字は直接書けません");
      pos++;
    }
  };

  const readNumber = (): string => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(pos, pos + 400));
    if (!m || m[0] === "-") fail(`${describe(pos)} は値として読めません`);
    pos += m![0].length;
    return m![0];
  };

  const readWord = (word: string) => {
    if (text.startsWith(word, pos)) {
      pos += word.length;
      return true;
    }
    return false;
  };

  const readValue = (depth: number): JsonNode => {
    if (depth > 512) fail("入れ子が深すぎます");
    skipWs();
    const c = text[pos];
    if (c === "{") {
      pos++;
      const entries: [string, JsonNode][] = [];
      skipWs();
      if (text[pos] === "}") {
        pos++;
        return { kind: "object", entries };
      }
      while (true) {
        skipWs();
        if (text[pos] !== '"') {
          fail(
            text[pos] === "}"
              ? "最後の要素のあとに「,」は書けません"
              : `${describe(pos)} の位置にキー (ダブルクォートで囲んだ文字列) が必要です`,
          );
        }
        const key = readString();
        skipWs();
        expect(":");
        const value = readValue(depth + 1);
        entries.push([key, value]);
        skipWs();
        if (text[pos] === ",") {
          pos++;
          continue;
        }
        if (text[pos] === "}") {
          pos++;
          return { kind: "object", entries };
        }
        fail(`${describe(pos)} の位置に「,」か「}」が必要です`);
      }
    }
    if (c === "[") {
      pos++;
      const items: JsonNode[] = [];
      skipWs();
      if (text[pos] === "]") {
        pos++;
        return { kind: "array", items };
      }
      while (true) {
        skipWs();
        if (text[pos] === "]") fail("最後の要素のあとに「,」は書けません");
        items.push(readValue(depth + 1));
        skipWs();
        if (text[pos] === ",") {
          pos++;
          continue;
        }
        if (text[pos] === "]") {
          pos++;
          return { kind: "array", items };
        }
        fail(`${describe(pos)} の位置に「,」か「]」が必要です`);
      }
    }
    if (c === '"') return { kind: "string", value: readString() };
    if (c === "-" || (c !== undefined && c >= "0" && c <= "9")) {
      return { kind: "number", raw: readNumber() };
    }
    if (readWord("true")) return { kind: "bool", value: true };
    if (readWord("false")) return { kind: "bool", value: false };
    if (readWord("null")) return { kind: "null" };
    if (c === "'") return fail("文字列はダブルクォート (\") で囲みます");
    return fail(`${describe(pos)} は値として読めません`);
  };

  skipWs();
  if (pos >= text.length) fail("JSONが空です");
  const node = readValue(0);
  skipWs();
  if (pos < text.length) fail(`値のあとに余分な ${describe(pos)} があります`);
  return node;
}

export type Indent = "2" | "4" | "tab" | "minify";

export interface FormatOptions {
  indent: Indent;
  sortKeys?: boolean;
  /** 非ASCII文字を \uXXXX にする */
  escapeUnicode?: boolean;
}

export function quoteJsonString(s: string, escapeUnicode = false): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const ch = s[i];
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (c === 10) out += "\\n";
    else if (c === 13) out += "\\r";
    else if (c === 9) out += "\\t";
    else if (c === 8) out += "\\b";
    else if (c === 12) out += "\\f";
    else if (c < 0x20 || (escapeUnicode && c > 0x7e)) {
      out += "\\u" + c.toString(16).padStart(4, "0");
    } else out += ch;
  }
  return out + '"';
}

export function stringifyJson(node: JsonNode, opts: FormatOptions): string {
  const unit = opts.indent === "tab" ? "\t" : opts.indent === "4" ? "    " : "  ";
  const pretty = opts.indent !== "minify";
  const q = (s: string) => quoteJsonString(s, opts.escapeUnicode);

  const write = (n: JsonNode, depth: number): string => {
    switch (n.kind) {
      case "null":
        return "null";
      case "bool":
        return n.value ? "true" : "false";
      case "number":
        return n.raw;
      case "string":
        return q(n.value);
      case "array": {
        if (n.items.length === 0) return "[]";
        if (!pretty) return "[" + n.items.map((v) => write(v, depth + 1)).join(",") + "]";
        const pad = unit.repeat(depth + 1);
        return (
          "[\n" +
          n.items.map((v) => pad + write(v, depth + 1)).join(",\n") +
          "\n" +
          unit.repeat(depth) +
          "]"
        );
      }
      case "object": {
        if (n.entries.length === 0) return "{}";
        const entries = opts.sortKeys
          ? [...n.entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          : n.entries;
        if (!pretty) {
          return "{" + entries.map(([k, v]) => q(k) + ":" + write(v, depth + 1)).join(",") + "}";
        }
        const pad = unit.repeat(depth + 1);
        return (
          "{\n" +
          entries.map(([k, v]) => pad + q(k) + ": " + write(v, depth + 1)).join(",\n") +
          "\n" +
          unit.repeat(depth) +
          "}"
        );
      }
    }
  };

  return write(node, 0);
}

/** 整形する。失敗したときは JsonError を投げる */
export function formatJson(text: string, opts: FormatOptions): string {
  return stringifyJson(parseJson(text), opts);
}

/**
 * JSのふつうの値にする (YAMLへの変換などで使う)。
 * 数値は Number になるので、極端に大きな整数は桁が落ちる
 */
export function toPlainValue(node: JsonNode): unknown {
  switch (node.kind) {
    case "null":
      return null;
    case "bool":
      return node.value;
    case "number":
      return Number(node.raw);
    case "string":
      return node.value;
    case "array":
      return node.items.map(toPlainValue);
    case "object": {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of node.entries) obj[k] = toPlainValue(v);
      return obj;
    }
  }
}
