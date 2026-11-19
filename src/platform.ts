import { isTauri } from "@tauri-apps/api/core";

/** macOSで動いているか (キー表記の切り替えに使う) */
export const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

/** 修飾キーの表記 (macは記号、それ以外は英字) */
export const KEY_MOD = isMac ? "⌘" : "Ctrl";

/**
 * Tauri のウィンドウの中で動いているか。
 * `npm run dev` をブラウザで開いたとき (画面だけの確認) は false になる
 */
export const inTauri = isTauri();
