/**
 * Rust 側のコマンドの呼び出し。
 *
 * `npm run dev` をブラウザで開いて画面だけ確かめるときは Rust が無いので、
 * 開発中に限って devMock.ts の見本の値を返す (配布用のビルドには含まれない)
 */

import { invoke } from "@tauri-apps/api/core";
import { homeDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { inTauri } from "./platform";

export async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (inTauri) return invoke<T>(cmd, args);
  if (import.meta.env.DEV) {
    const { mockInvoke } = await import("./devMock");
    return (await mockInvoke(cmd, args)) as T;
  }
  throw new Error("この機能はアプリ版でのみ使えます");
}

/** フォルダを選ぶ (選ばなかったら null) */
export async function pickFolder(): Promise<string | null> {
  if (inTauri) {
    const p = await open({ directory: true, multiple: false });
    return typeof p === "string" ? p : null;
  }
  if (import.meta.env.DEV) return "/Users/you/git/sample-app";
  return null;
}

/** ホームのフォルダ */
export async function homePath(): Promise<string> {
  if (inTauri) return homeDir();
  return "/Users/you";
}

/** ファイルを選ぶ (選ばなかったら null)。dir のフォルダを開いた状態で始める (~/ はホームのフォルダ) */
export async function pickFile(opts: { dir?: string; title?: string } = {}): Promise<string | null> {
  if (inTauri) {
    const defaultPath = opts.dir?.startsWith("~/") ? await join(await homeDir(), opts.dir.slice(2)) : opts.dir;
    const p = await open({ directory: false, multiple: false, defaultPath, title: opts.title });
    return typeof p === "string" ? p : null;
  }
  if (import.meta.env.DEV) return "/Users/you/.ssh/id_ed25519_server";
  return null;
}

/** ブラウザで開く (アプリの中では開かない) */
export async function openExternal(url: string): Promise<void> {
  if (inTauri) await openUrl(url);
  else window.open(url, "_blank", "noopener");
}
