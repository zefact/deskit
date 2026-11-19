# サードパーティライセンス / Third-Party Notices

Deskit は以下のオープンソースソフトウェアを利用しています。
各ライブラリの著作権は、それぞれの著作権者に帰属します。

Deskit uses the following open-source software. Each library is
copyrighted by its respective authors and distributed under its own license.

## フロントエンド (npm)

| ライブラリ | ライセンス | URL |
|---|---|---|
| React / React DOM | MIT | https://github.com/facebook/react |
| CodeMirror 6 (@codemirror/*) | MIT | https://github.com/codemirror/dev |
| @lezer/highlight | MIT | https://github.com/lezer-parser/highlight |
| sql-formatter | MIT | https://github.com/sql-formatter-org/sql-formatter |
| yaml | ISC | https://github.com/eemeli/yaml |
| lucide-react | ISC | https://github.com/lucide-icons/lucide |
| @tauri-apps/api | MIT / Apache-2.0 | https://github.com/tauri-apps/tauri |
| @tauri-apps/plugin-dialog, plugin-opener, plugin-clipboard-manager, plugin-updater, plugin-process | MIT / Apache-2.0 | https://github.com/tauri-apps/plugins-workspace |
| Vite / @vitejs/plugin-react (開発時) | MIT | https://github.com/vitejs/vite |
| Vitest (開発時) | MIT | https://github.com/vitest-dev/vitest |
| ESLint / typescript-eslint (開発時) | MIT | https://github.com/eslint/eslint |
| TypeScript (開発時) | Apache-2.0 | https://github.com/microsoft/TypeScript |

## バックエンド (Rust crates)

| クレート | ライセンス | URL |
|---|---|---|
| Tauri (tauri, tauri-build, plugins) | MIT / Apache-2.0 | https://github.com/tauri-apps/tauri |
| tokio | MIT | https://github.com/tokio-rs/tokio |
| serde / serde_json | MIT / Apache-2.0 | https://github.com/serde-rs/serde |
| md-5 / sha1 / sha2 | MIT / Apache-2.0 | https://github.com/RustCrypto/hashes |
| base64 | MIT / Apache-2.0 | https://github.com/marshallpierce/rust-base64 |
| dirs | MIT / Apache-2.0 | https://github.com/dirs-dev/dirs-rs |
| chrono | MIT / Apache-2.0 | https://github.com/chronotope/chrono |
| WebView (wry / tao) | MIT / Apache-2.0 | https://github.com/tauri-apps/wry |
| reqwest (アップデートの確認・ダウンロード) | MIT / Apache-2.0 | https://github.com/seanmonstar/reqwest |
| rustls | MIT / Apache-2.0 / ISC | https://github.com/rustls/rustls |
| ring | Apache-2.0 AND ISC | https://github.com/briansmith/ring |
| minisign-verify (アップデートの署名の確認) | MIT | https://github.com/jedisct1/rust-minisign-verify |
| zip (Windows のアップデート) | MIT | https://github.com/zip-rs/zip2 |

上記の直接依存のほか、それぞれが依存するライブラリ (推移的依存) も
MIT / Apache-2.0 / BSD / ISC / Zlib / Unicode-3.0 などの寛容なライセンスで配布されています。
一部にファイル単位のコピーレフトである MPL-2.0 のライブラリ
(cssparser / selectors / dtoa-short / option-ext) と、
Boost Software License 1.0 のライブラリ (clipboard-win / error-code。Windows のみ)、
証明書データを含む CDLA-Permissive-2.0 のライブラリ (webpki-root-certs) が含まれますが、
いずれも改変せずそのまま利用しており、本ソフトウェアのライセンス (MIT) には影響しません。
各ライセンスの全文は上記URLのリポジトリに含まれています。

なお Deskit のアカウント系のツールは、利用者の環境にインストールされた
`git` / `ssh` / `ssh-keyscan` / `aws` コマンドを呼び出して実行します (同梱はしていません)。
