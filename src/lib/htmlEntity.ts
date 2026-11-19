/** HTMLの文字参照 (エンティティ) への変換 */

const BASIC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function encodeHtml(text: string, opts: { nonAscii?: boolean } = {}): string {
  let out = "";
  for (const ch of text) {
    const basic = BASIC[ch];
    if (basic) out += basic;
    else if (opts.nonAscii && ch.codePointAt(0)! > 0x7e) {
      out += `&#x${ch.codePointAt(0)!.toString(16).toUpperCase()};`;
    } else out += ch;
  }
  return out;
}

/**
 * 文字参照を元の文字に戻す。
 *
 * 名前付きの参照 (&copy; など) は数が多いので、ブラウザのHTMLパーサーに任せる。
 * DOMParser で作った文書ではスクリプトは動かない
 */
export function decodeHtml(text: string, parser: DOMParser = new DOMParser()): string {
  const doc = parser.parseFromString(`<!doctype html><textarea>${text.replace(/<\/textarea/gi, "&lt;/textarea")}</textarea>`, "text/html");
  return doc.querySelector("textarea")?.value ?? "";
}
