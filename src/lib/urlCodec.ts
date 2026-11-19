/** URL エンコード・デコードと、URLの分解 */

export type UrlEncodeMode = "component" | "uri" | "form";

export function encodeUrl(text: string, mode: UrlEncodeMode): string {
  if (mode === "uri") return encodeURI(text);
  const s = encodeURIComponent(text);
  // フォーム形式 (application/x-www-form-urlencoded) は空白を + にする
  return mode === "form" ? s.replace(/%20/g, "+") : s;
}

export function decodeUrl(text: string, plusAsSpace: boolean): string {
  const s = plusAsSpace ? text.replace(/\+/g, " ") : text;
  try {
    return decodeURIComponent(s);
  } catch {
    throw new Error("正しくない % エスケープ (または UTF-8 として読めないバイト列) が含まれています");
  }
}

export interface UrlParts {
  protocol: string;
  username: string;
  host: string;
  port: string;
  pathname: string;
  hash: string;
  params: [string, string][];
}

/** URLとして読めるときだけ分解する (読めなければ null) */
export function parseUrlParts(text: string): UrlParts | null {
  const s = text.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  return {
    protocol: u.protocol.replace(/:$/, ""),
    username: u.username,
    host: u.hostname,
    port: u.port,
    pathname: safeDecode(u.pathname),
    hash: safeDecode(u.hash.replace(/^#/, "")),
    params: [...u.searchParams.entries()],
  };
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
