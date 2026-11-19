import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { inTauri, isMac } from "./platform";
import { editorFontSizeStore } from "./store";
import { initTheme } from "./theme";

initTheme();

// macOSではタイトルバーをアプリに統合(Overlay)するため、
// 信号機ボタンぶんの余白をCSSで確保できるようクラスを付ける
if (isMac) document.documentElement.classList.add("macos");

// フルスクリーン中は信号機ボタンが出ないので、その余白を詰められるよう印を付ける
if (isMac && inTauri) {
  const win = getCurrentWindow();
  const sync = () =>
    win
      .isFullscreen()
      .then((full) => document.documentElement.classList.toggle("is-fullscreen", full))
      .catch(() => {});
  sync();
  win.onResized(sync).catch(() => {});
}

// エディタの文字サイズ (設定で変わったらすぐ反映する)
const applyFontSize = () =>
  document.documentElement.style.setProperty("--editor-font-size", `${editorFontSizeStore.get()}px`);
applyFontSize();
editorFontSizeStore.subscribe(applyFontSize);

/*
 * 再読み込み (⌘R / Ctrl+R / F5) と印刷・保存のショートカットを止める。
 * 再読み込みされると、各ツールに入力した内容が消えてしまうため
 */
window.addEventListener(
  "keydown",
  (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (e.key === "F5" || (mod && (k === "r" || k === "p" || k === "s"))) e.preventDefault();
  },
  true,
);

// 右クリックでWebView標準メニュー(Reload等)を出さない。
// 入力欄とエディタはコピー/ペーストのメニューが要るので除外する
window.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest("input, textarea, [contenteditable], .cm-editor")) return;
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
