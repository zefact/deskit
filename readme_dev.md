# Deskit 開発者向けドキュメント (リリース手順)

利用者向けの情報は [README.md](./README.md) を参照してください。
このドキュメントは、バージョンアップとリリース作業を行う開発者向けです。

## 事前準備 (初回のみ)

### アプリ内アップデートの署名鍵

アプリ内アップデートで配るファイルには署名を付け、アプリは公開鍵で確かめてから入れ替えます。
鍵は deskit のフォルダで次のコマンドを実行して作ります (パスワードを聞かれます)。
ほかのフォルダで実行すると、Tauri の CLI が見つからず
「could not determine executable to run」になります。

```bash
cd deskit   # このリポジトリのフォルダ
npx tauri signer generate -w ~/.tauri/deskit.key
```

- **公開鍵** (`~/.tauri/deskit.key.pub` の中身) を `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に入れる
- **秘密鍵** を GitHubリポジトリの Settings → Secrets and variables → Actions に登録する

| Secret名 | 内容 |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | 秘密鍵 (`~/.tauri/deskit.key` の中身全文) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 鍵を作ったときのパスワード |

> **重要**: 秘密鍵は絶対にリポジトリへコミットしないこと。
> 紛失すると、すでに配ったアプリへ更新を届けられなくなるため、
> 秘密鍵とパスワードはパスワードマネージャ等にも控えておくこと。

手元で `npm run tauri build` するときも、署名のために
`TAURI_SIGNING_PRIVATE_KEY` (と `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`) の環境変数が要ります。

### 紹介ページ (GitHub Pages)

GitHubリポジトリの Settings → Pages で、次のように設定します。

| 項目 | 値 |
|---|---|
| Source | Deploy from a branch |
| Branch | `main` / `/docs` |

数分後に https://zefact.github.io/deskit/ で `docs/index.html` が表示されます。
`docs/.nojekyll` は、GitHub Pages に Jekyll の変換をさせないためのファイルです (消さないこと)。

### macOS の署名・公証 (任意)

GitHubリポジトリの Settings → Secrets and variables → Actions に、
以下のSecretsを登録すると、macOS 版に Developer ID の署名と公証が付きます。

| Secret名 | 内容 |
|---|---|
| `APPLE_CERTIFICATE` | Developer ID Application 証明書 (.p12) を base64 にした文字列 |
| `APPLE_CERTIFICATE_PASSWORD` | .p12 のパスワード |
| `APPLE_SIGNING_IDENTITY` | 署名に使う名前 (例: `Developer ID Application: ZEFACT Co., Ltd. (XXXXXXXXXX)`) |
| `APPLE_ID` | 公証に使う Apple ID |
| `APPLE_PASSWORD` | その Apple ID のアプリ用パスワード |
| `APPLE_TEAM_ID` | チームID |

`APPLE_CERTIFICATE` は、次のようにして作ります。

1. 「キーチェーンアクセス」で「Developer ID Application」の証明書 (秘密鍵つき) を選び、
   「書き出す」で .p12 形式にして保存する (このときのパスワードが `APPLE_CERTIFICATE_PASSWORD`)
2. ターミナルで base64 にしてコピーし、Secrets に貼り付ける

```bash
base64 -i 証明書.p12 | pbcopy
```

`APPLE_CERTIFICATE` を登録しないと、macOS 版は署名なしでビルドされ、利用者が初めて開くときに
「開発元を確認できないため開けません」と出ます (ビルド自体は通ります)。

> Actions で `SecKeychainItemImport: Unable to decode the provided data` と出て止まったときは、
> `APPLE_CERTIFICATE` の中身が .p12 として読めていません。次を確かめてください。
> - base64 にする前のファイルが、秘密鍵つきで書き出した .p12 か (.cer では署名できない)
> - `APPLE_CERTIFICATE_PASSWORD` が、書き出したときのパスワードと同じか
> - OpenSSL 3 で作った .p12 は macOS で読めないことがある。`openssl pkcs12 -export -legacy ...` で作り直すか、キーチェーンアクセスから書き出す
Windows 版はコード署名をしていないため、初回に SmartScreen の警告が出ます (README に手順を記載)。

> **重要**: 証明書やパスワードは絶対にリポジトリへコミットしないこと。

## 1. バージョン番号の変更

バージョンの本体は **`src-tauri/tauri.conf.json` の `version`** です。
アプリ内のバージョン表示 (設定画面)・インストーラのファイル名・アプリ内アップデートの新旧判定のすべてに使われます。

```jsonc
// src-tauri/tauri.conf.json
{
  "version": "1.1.0"   // ← ここを変更
}
```

- バージョンは [セマンティックバージョニング](https://semver.org/lang/ja/) に従う
  (ツールや機能の追加: 1.x.0 を上げる / バグ修正のみ: 1.0.x を上げる /
  設定の保存形式を変えるなど、前のバージョンと互換性のない変更: x.0.0 を上げる)
- `package.json` と `src-tauri/Cargo.toml` の `version` はアプリの動作に影響しないが、
  揃えておくのが望ましい

## 2. リリース手順

### 2-1. CHANGELOGの整理

開発中の変更点は `CHANGELOG.md` の「未リリース」セクションに書き溜めておきます。
リリース時に、その内容を新しいバージョンの見出しへ移します。

```markdown
## [未リリース]

## [1.1.0] - 2026-12-01   ← 「未リリース」の中身をここへ移す

### 追加
- ○○ツール
```

この `## [1.1.0]` セクションの内容が、そのままGitHub Releasesの説明文になります
(release.ymlがタグ名と一致するセクションを自動で抜き出します)。

### 2-2. コミットとタグ

```bash
git add -A
git commit -m "v1.1.0"
git push

git tag v1.1.0          # tauri.conf.json のバージョンと必ず一致させる (先頭にv)
git push origin v1.1.0
```

タグをpushすると GitHub Actions (`.github/workflows/release.yml`) が起動し、
テスト (`npm test`) のあと、macOS (Apple Silicon) と Windows のビルドが自動で走ります (15〜30分程度)。

### 2-3. ビルド結果の確認

リポジトリの **Actions** タブで「Release」ワークフローの成功を確認します。
成功すると **Releases にドラフト** が作成され、以下が添付されます。

| ファイル | 用途 |
|---|---|
| `Deskit_x.x.x_aarch64.dmg` | macOS用インストーラ (利用者がダウンロード) |
| `Deskit_x.x.x_x64-setup.exe` | Windows用セットアップ (利用者がダウンロード) |
| `Deskit_x.x.x_x64_ja-JP.msi` | Windows用MSI (社内一括配布向け) |
| `Deskit_aarch64.app.tar.gz` + `.sig` | macOSのアプリ内アップデート用 (削除しないこと) |
| `*-setup.exe.sig` など | アプリ内アップデートの署名 (削除しないこと) |
| `latest.json` | アプリ内アップデートのカタログ (削除しないこと) |

## 3. 公開手順

1. Releasesページでドラフトを開き、説明文 (CHANGELOGから転記済み) と添付ファイルを確認する
2. 可能であればdmg / setup.exeを実際にインストールして動作確認する
3. **「Publish release」を押す** — この瞬間に一般公開され、
   すでに使っている人へのアプリ内アップデートの配信も始まる

> アプリ内アップデートは「最新の正式リリース」(`releases/latest`) を参照するため、
> **Pre-releaseのチェックは付けない** こと (付けると更新が配信されない)。

紹介ページのダウンロードボタンも `releases/latest` を指しているので、
公開した時点で新しいバージョンが配られます。

### 公開後の確認

- `https://github.com/zefact/deskit/releases/latest/download/latest.json`
  にアクセスし、新しいバージョン番号が返ることを確認
- 前のバージョンの Deskit を起動し、右下に更新の知らせが出ること・更新できることを確認
  (設定 → アップデート の「確かめる」でも確かめられる)

## 紹介ページ (GitHub Pages) の更新

`docs/` 配下を変更して main にpushするだけで、数分後に
https://zefact.github.io/deskit/ に自動反映されます。リリース作業とは独立しています。
ツールを足したときは、紹介ページのツール一覧と件数も合わせて直してください。

## リリースをやり直したいとき

ビルドに失敗した・内容を差し替えたい場合:

```bash
# ドラフトのReleaseをGitHub上で削除してから
git tag -d v1.1.0
git push origin :refs/tags/v1.1.0
# 修正をcommit後、再度タグを打つ
git tag v1.1.0
git push origin v1.1.0
```

公開済みのリリースは削除せず、修正版 (例: v1.1.1) を新たに出すこと。
