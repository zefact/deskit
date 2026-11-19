# Deskit

開発に使う小さな道具をひとまとめにした、macOS / Windows 向けのデスクトップアプリです。
入力した内容はすべて手元で処理され、外部へ送られることはありません。

紹介ページ: https://zefact.github.io/deskit/

Tauri 2 + React + TypeScript + Rust で作っています。

## ツール一覧 (22)

| カテゴリ | ツール |
|---|---|
| アカウント | Gitアカウント (コミットの作者と接続のしかた (SSHの別名・HTTPSのユーザー名) を組にして、リポジトリごとに切り替え、接続確認。パソコン全体の既定の作者 (名前・メール) の編集) / SSH接続 (~/.ssh/config の接続先 (別名・接続先・ユーザー・鍵) の一覧・追加・編集・削除) / AWSプロファイル (一覧・接続確認・追加・編集・ターミナルで使うプロファイルの切り替え) |
| 変換 | JSON ⇔ YAML / 日時・Unix時間 (タイムゾーン・和暦) / 西暦・和暦・年齢 (干支・入学と卒業の年・早見表) / 基数変換 (2・8・10・16進) / カラー変換 (HEX・RGB・HSL・OKLCH・CMYK・コントラスト比) |
| エンコード / デコード | Base64 / URLエンコード (URLの分解つき) / HTMLエンティティ / JWTデコーダー |
| 整形 | JSON整形 (エラー位置表示・大きな数値も桁落ちしない) / SQL整形 (MySQL・PostgreSQL ほか) |
| 生成 | UUID (v4・v7) / ハッシュ (MD5・SHA-1/256/384/512・HMAC・ファイルのチェックサム) / パスワード (使う記号・先頭の文字・同じ文字を続けないなどを指定) |
| テキスト | ケース変換 / 全角・半角変換 / 文字数カウント (Shift_JISバイト数・原稿用紙換算) / 正規表現テスター / テキスト比較 |

## インストール

[Releases](../../releases) から最新版をダウンロードしてください。

| OS | ファイル | 手順 |
|---|---|---|
| macOS | `Deskit_<ver>_aarch64.dmg` | dmgを開いて `Deskit.app` をApplicationsへドラッグ |
| Windows | `Deskit_<ver>_x64-setup.exe` | 実行してウィザードに従う |

macOS は Apple Silicon 向けです。Windowsで初回実行時にSmartScreenの警告が出た場合は「詳細情報」→「実行」を選択してください。

一度インストールすれば、新しいバージョンが公開されたときにアプリの右下に知らせが出て、そのまま更新できます
(設定 → アップデート からも確かめられます)。

## 通信について

入力した内容を外部へ送ることはありません。Deskit が外と通信するのは、次のときだけです。

- 起動したとき (と、設定で「確かめる」を押したとき): GitHub Releases に新しいバージョンがあるかを確かめます
- アカウント系のツールで接続確認などをしたとき: お使いの `git` / `ssh` / `ssh-keyscan` / `aws` コマンドが、GitHub や AWS などの接続先につなぎます

## 使い方のポイント

- `⌘K` (Windows は `Ctrl+K`) でツールを検索。英語名・キーワード (`md5`, `epoch`, `yml` など) でも探せます
- ツールの ☆ でお気に入りに追加すると、サイドバーの上に並びます
- 一度開いたツールは、ほかのツールへ移っても入力内容が残ります
- `⌘,` で設定 (テーマ・エディタの文字サイズ)

## アカウント系のツールについて

この3つだけは、手元の設定ファイルを読み書きし、`git` / `ssh` / `aws` コマンドを実行します。

| ツール | 読むもの | 書き換えるもの |
|---|---|---|
| Gitアカウント | `~/.gitconfig`、`~/.ssh/config`、`~/.ssh/known_hosts`、`~/.ssh` の公開鍵 (.pub)、選んだリポジトリの `.git/config` | `~/.gitconfig` の user.name / user.email、リポジトリの user.name / user.email とリモートURL、アカウントの追加の画面で「新しい別名」を作ったときだけ `~/.ssh/config`、「ホストの鍵を登録」したときだけ `~/.ssh/known_hosts` |
| SSH接続 | `~/.ssh/config` (Include で読み込むファイルも)、`~/.ssh` の公開鍵 (.pub) | `~/.ssh/config` (接続先を追加・編集・削除したときだけ) |
| AWSプロファイル | `~/.aws/config`、`~/.aws/credentials` | 上の2つ、`~/.aws/deskit_profile` (選んだプロファイル名)、ターミナル連携を設定したときだけ `~/.zshrc` |

- 書き換える前に、元のファイルをアプリのデータフォルダの `backups/` に控えます (種類ごとに新しい30件)
- シークレットアクセスキーとセッショントークンは画面に表示しません
- `~/.ssh/config` は、本体に `Host 別名` と1つだけ書かれた節だけを書き換えます。ほかの行やコメントはそのまま残し、Include で読み込んだファイルは読むだけです。秘密鍵の中身は読みません
- Gitアカウントの一覧 (表示名と、名前・メール・別名かユーザー名の組) はアプリの中に保存します
- HTTPS のアカウントは、リモートURLにユーザー名を入れるだけです。トークンは Deskit では扱わず、git の認証情報の保存先 (キーチェーン・Git Credential Manager など) が管理します
- AWS の「ターミナル連携」は `~/.zshrc` に数行を足し、新しく開いたターミナルで `AWS_PROFILE` を設定します。
  すでに開いているターミナルには反映されないので、`export AWS_PROFILE=...` のコピーを使ってください
- `npm run dev` でブラウザから開いたときは、実際のファイルではなく `src/devMock.ts` の見本の値を表示します

## 開発

必要なもの: Node.js 20 以上、Rust (stable)、各OSの Tauri の前提ソフト

```bash
npm install
npm run tauri dev     # アプリとして起動
npm run dev           # 画面だけブラウザで確認 (http://localhost:1440)
npm test              # 処理ロジックのテスト (vitest)
npm run lint
cd src-tauri && cargo test   # Rust 側のテスト
```

配布用のビルド:

```bash
npm run tauri build
```

`v*` のタグを push すると GitHub Actions (`.github/workflows/release.yml`) が
macOS (Apple Silicon) と Windows 向けにビルドし、Releases にドラフトを作ります。

## 構成

```
src/
  App.tsx              画面の骨組み (サイドバー + 右側)
  components/          共通の部品 (エディタ・ボタン・枠・設定・更新の知らせなど)
  tools/registry.ts    ツールの一覧 (名前・説明・アイコン・検索キーワード)
  tools/*.tsx          各ツールの画面
  lib/*.ts             各ツールの処理 (画面に依存しない純関数。*.test.ts でテスト)
  styles/              CSS (theme.css に色・角丸などの決まりごと)
  updater.ts           アプリ内アップデート
  devMock.ts           ブラウザで画面だけ確かめるときの見本の値 (配布用のビルドには含まれない)
src-tauri/
  src/lib.rs           Tauri の起動・macOS メニュー・コマンドの登録
  src/hash.rs          ファイルのハッシュ計算 (大きなファイルを少しずつ読む)
  src/cmd.rs           外部コマンド (git / ssh / aws) の実行と、設定ファイルの安全な書き込み
  src/git_accounts.rs  Gitアカウントの確認と切り替え
  src/host_keys.rs     SSH のホスト鍵の確認と known_hosts への登録
  src/ssh_config.rs    ~/.ssh/config の接続先を読む
  src/ssh_edit.rs      ~/.ssh/config の接続先の追加・編集・削除
  src/aws_profiles.rs  AWS CLI のプロファイルの確認・編集・切り替え
  src/ini.rs           ~/.aws の INI ファイルを、元の書き方を崩さずに書き換える
docs/                  紹介ページ (GitHub Pages で公開)
design/deskit_icon.svg アイコンの元データ (npx tauri icon で各サイズを生成)
```

## ツールの追加のしかた

1. 処理を `src/lib/xxx.ts` に純関数として書き、`src/lib/xxx.test.ts` (または `lib.test.ts`) にテストを足す
2. 画面を `src/tools/Xxx.tsx` に書く (`InputPane` / `OutputPane` / `OptBar` などの共通部品を使う)
3. `src/tools/registry.ts` の `TOOLS` に1件追加する (カテゴリ・アイコン・検索キーワード)

重い処理やOSの機能が必要なもの (ファイル読み込みなど) は、`src-tauri/src` にコマンドを足して
`invoke()` で呼び出します (例: `hash.rs` の `hash_file`)。

## 不具合の報告・要望

[Issues](../../issues) にお寄せください。

## ライセンス

[MIT License](./LICENSE) © 2026 ZEFACT Co., Ltd.
利用しているオープンソースソフトウェアは [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) にまとめています。
リリースの手順は [readme_dev.md](./readme_dev.md) を参照してください。
