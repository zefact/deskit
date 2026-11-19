import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  //    (ほかの Tauri アプリでよく使う 1420・1430 と重ならないよう 1440 にしている。
  //     変えるときは tauri.conf.json の devUrl / devCsp と .claude/launch.json も合わせる)
  server: {
    port: 1440,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1441,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // 画面はアプリに同梱して手元から読むので、ファイルの大きさの警告は緩める
  // (CodeMirror と各言語の定義で 600KB 程度になる)
  build: {
    chunkSizeWarningLimit: 1500,
  },

  // テスト (vitest)。
  // 対象は「画面に依存しない純関数」だけなので、DOMの用意は要らない
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
}));
