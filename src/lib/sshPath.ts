/**
 * ファイルを選ぶ画面で選んだ鍵のパスを、~/.ssh/config に書く形にする
 */

/** Windows のパス (C:\… や \\server\…) か */
const isWindowsPath = (p: string) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");

/**
 * ホームのフォルダの中なら `~/…` で書く (ほかのパソコンに設定を持っていっても使える)。
 * Windows のパスは区切りを / にする (ssh は / でも読め、\ を書くと読み違えることがある)
 */
export function toConfigPath(abs: string, home: string): string {
  const win = isWindowsPath(abs);
  const p = win ? abs.replace(/\\/g, "/") : abs;
  const h = (win ? home.replace(/\\/g, "/") : home).replace(/\/+$/, "");
  // macOS と Windows は、ふつう大文字と小文字を区別しない
  if (h && p.toLowerCase().startsWith(`${h.toLowerCase()}/`)) return `~/${p.slice(h.length + 1)}`;
  return p;
}

/** 公開鍵 (.pub) を選んだときは、組になっている秘密鍵のパスにする */
export function privateKeyPath(path: string): { path: string; wasPublic: boolean } {
  return /\.pub$/i.test(path) ? { path: path.slice(0, -4), wasPublic: true } : { path, wasPublic: false };
}
