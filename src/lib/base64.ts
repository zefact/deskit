/** Base64 のエンコード・デコード (文字列は UTF-8 として扱う) */

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  // 一度に渡すと引数の数の上限を超えるので区切る
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** 空白・改行を無視し、URLセーフ形式やパディング省略も受け付ける */
export function base64ToBytes(input: string): Uint8Array {
  let s = input.replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (s.startsWith("data:")) {
    const comma = s.indexOf(",");
    if (comma >= 0) s = s.slice(comma + 1);
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
    throw new Error("Base64 に使えない文字が含まれています");
  }
  s = s.replace(/=+$/, "");
  if (s.length % 4 === 1) throw new Error("Base64 の長さが正しくありません");
  s += "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export interface EncodeOptions {
  urlSafe?: boolean;
  /** 76文字ごとに改行する (MIME 形式) */
  wrap?: boolean;
}

export function encodeBase64Text(text: string, opts: EncodeOptions = {}): string {
  let s = bytesToBase64(new TextEncoder().encode(text));
  if (opts.urlSafe) s = s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (opts.wrap) s = s.replace(/(.{76})(?=.)/g, "$1\n");
  return s;
}

/** デコードして UTF-8 の文字列にする。文字列として読めないときは例外 */
export function decodeBase64Text(input: string): string {
  const bytes = base64ToBytes(input);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      `デコードした ${bytes.length} バイトは UTF-8 の文字列として読めません (画像などのバイナリの可能性があります)`,
    );
  }
}
