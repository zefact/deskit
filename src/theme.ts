/**
 * カラーモード (ライト/ダーク/システム連動)。
 *
 * 画面の色に加えて、ウィンドウ自体 (Windowsのタイトルバー・macOSの信号機まわり) の
 * 明暗もそろえる。アプリだけライトにしてもタイトルバーが黒いまま、とならないように
 */

import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri } from "./platform";
import { createStore } from "./store";

export type ColorMode = "light" | "dark" | "system";

export const colorModeStore = createStore<ColorMode>(
  "color-mode",
  "system",
  (v): v is ColorMode => v === "light" || v === "dark" || v === "system",
);

const media = window.matchMedia("(prefers-color-scheme: light)");

function resolve(mode: ColorMode): "light" | "dark" {
  if (mode === "system") return media.matches ? "light" : "dark";
  return mode;
}

function apply() {
  const mode = colorModeStore.get();
  document.documentElement.dataset.theme = resolve(mode);
  if (inTauri) {
    getCurrentWindow()
      .setTheme(mode === "system" ? null : mode)
      .catch(() => {});
  }
}

/** 起動時に呼ぶ。OS設定の変化にも追従する */
export function initTheme() {
  apply();
  media.addEventListener("change", apply);
  colorModeStore.subscribe(apply);
}
