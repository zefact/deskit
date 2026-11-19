/**
 * アプリ内アップデート。
 *
 * GitHub Releases の最新版 (latest.json) を見て、新しいバージョンがあれば
 * ダウンロード → 署名を確かめて入れ替え → 再起動する。
 * 確かめる先は src-tauri/tauri.conf.json の plugins.updater に書いてある
 */

import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { inTauri } from "./platform";

/** ダウンロードの進み具合 (0〜100。全体の大きさが分からないときは null) */
export type ProgressHandler = (percent: number | null) => void;

export interface AvailableUpdate {
  /** 新しいバージョン (先頭に v は付かない) */
  version: string;
  /** ダウンロードして入れ替え、再起動する */
  install: (onProgress: ProgressHandler) => Promise<void>;
}

/** 新しいバージョンがあるか確かめる (無ければ null) */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!inTauri) {
    // ブラウザで画面だけ確かめるときは、URL に ?mock-update を付けると通知を出せる
    return import.meta.env.DEV && new URLSearchParams(location.search).has("mock-update") ? mockUpdate() : null;
  }
  // npm run tauri dev のときは確かめない (開発中のアプリを入れ替えてしまわないように)
  if (import.meta.env.DEV) return null;

  const update = await check();
  if (!update) return null;
  return {
    version: update.version,
    install: async (onProgress) => {
      let total: number | null = null;
      let downloaded = 0;
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? null;
            onProgress(total ? 0 : null);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            onProgress(total ? Math.min(100, Math.round((downloaded / total) * 100)) : null);
            break;
          case "Finished":
            onProgress(100);
            break;
        }
      });
      await relaunch();
    },
  };
}

/** 画面の確認用 (開発中のブラウザだけ)。進み具合を出すだけで、実際には入れ替えない */
function mockUpdate(): AvailableUpdate {
  return {
    version: "9.9.9",
    install: (onProgress) =>
      new Promise((resolve) => {
        let p = 0;
        const id = window.setInterval(() => {
          p += 20;
          onProgress(Math.min(p, 100));
          if (p >= 100) {
            window.clearInterval(id);
            resolve();
          }
        }, 300);
      }),
  };
}
