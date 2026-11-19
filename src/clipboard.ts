/**
 * クリップボードの読み書き。
 *
 * WKWebView (macOS) は navigator.clipboard の読み取りで確認の吹き出しを出すため、
 * アプリの中では Tauri のプラグイン (Rust側) を使う。
 * ブラウザで画面だけ確かめるときは navigator.clipboard に任せる
 */

import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { inTauri } from "./platform";

export async function copyText(text: string): Promise<void> {
  if (inTauri) await writeText(text);
  else await navigator.clipboard.writeText(text);
}

export async function pasteText(): Promise<string> {
  if (inTauri) return (await readText()) ?? "";
  return navigator.clipboard.readText();
}
