/**
 * ツールの一覧。
 *
 * 新しいツールを足すときは、画面のファイルを src/tools に置いてここへ1件追加する。
 * 画面は開いたときに初めて読み込む (起動を軽くするため)
 */

import {
  ArrowLeftRight,
  Binary,
  Braces,
  CalendarDays,
  CaseSensitive,
  Clock,
  Cloud,
  Code,
  Database,
  FileCode,
  Fingerprint,
  GitCompare,
  GitFork,
  Hash,
  KeyRound,
  Languages,
  Link,
  type LucideIcon,
  Palette,
  Pilcrow,
  Regex,
  Server,
  ShieldCheck,
} from "lucide-react";
import { type ComponentType, lazy, type LazyExoticComponent } from "react";

export type CategoryId = "account" | "convert" | "encode" | "format" | "generate" | "text";

export interface Category {
  id: CategoryId;
  name: string;
}

export const CATEGORIES: Category[] = [
  { id: "account", name: "アカウント" },
  { id: "convert", name: "変換" },
  { id: "encode", name: "エンコード / デコード" },
  { id: "format", name: "整形" },
  { id: "generate", name: "生成" },
  { id: "text", name: "テキスト" },
];

export interface ToolProps {
  /** いま表示されているか (裏に回っているあいだは時計などを止める) */
  active: boolean;
}

export interface ToolDef {
  id: string;
  name: string;
  /** 英語名 (検索用・副題) */
  en: string;
  description: string;
  category: CategoryId;
  icon: LucideIcon;
  keywords: string[];
  component: LazyExoticComponent<ComponentType<ToolProps>>;
}

export const TOOLS: ToolDef[] = [
  // ---- アカウント ----
  {
    id: "git-accounts",
    name: "Gitアカウント",
    en: "Git Accounts",
    description: "コミットの作者 (名前・メール) と接続に使う SSH 鍵を、アカウントとして組にして切り替えます",
    category: "account",
    icon: GitFork,
    keywords: ["github", "gitlab", "ssh", "user.name", "user.email", "gitconfig", "切り替え", "アカウント", "remote"],
    component: lazy(() => import("./GitAccounts")),
  },
  {
    id: "ssh-hosts",
    name: "SSH接続",
    en: "SSH Hosts",
    description: "~/.ssh/config の接続先 (Host) の別名・ユーザー・鍵を、追加・編集・削除します",
    category: "account",
    icon: Server,
    keywords: ["ssh", "config", "host", "hostname", "identityfile", "鍵", "別名", "サーバー", "github"],
    component: lazy(() => import("./SshHosts")),
  },
  {
    id: "aws-profiles",
    name: "AWSプロファイル",
    en: "AWS Profiles",
    description: "AWS CLI のプロファイルを確認・追加・編集し、ターミナルで使うプロファイルを切り替えます",
    category: "account",
    icon: Cloud,
    keywords: ["aws", "profile", "credentials", "sts", "iam", "AWS_PROFILE", "アクセスキー", "切り替え", "アカウント"],
    component: lazy(() => import("./AwsProfiles")),
  },
  // ---- 変換 ----
  {
    id: "json-yaml",
    name: "JSON ⇔ YAML",
    en: "JSON / YAML Converter",
    description: "JSON と YAML を相互に変換します",
    category: "convert",
    icon: ArrowLeftRight,
    keywords: ["yml", "変換", "コンバート"],
    component: lazy(() => import("./JsonYaml")),
  },
  {
    id: "timestamp",
    name: "日時 / Unix時間",
    en: "Unix Timestamp",
    description: "Unix時間と日時を相互に変換します。タイムゾーン・和暦にも対応",
    category: "convert",
    icon: Clock,
    keywords: ["epoch", "time", "date", "タイムスタンプ", "エポック", "和暦", "timezone"],
    component: lazy(() => import("./Timestamp")),
  },
  {
    id: "wareki",
    name: "西暦・和暦・年齢",
    en: "Japanese Era & Age",
    description: "生年月日や年から、和暦・年齢・干支と、小学校から大学までの入学・卒業の年を出します",
    category: "convert",
    icon: CalendarDays,
    keywords: ["和暦", "西暦", "元号", "年齢", "令和", "平成", "昭和", "大正", "明治", "干支", "早見表", "数え年", "入学", "卒業", "学年", "早生まれ", "age", "era", "wareki"],
    component: lazy(() => import("./Wareki")),
  },
  {
    id: "number-base",
    name: "基数変換",
    en: "Number Base Converter",
    description: "2進数・8進数・10進数・16進数を相互に変換します",
    category: "convert",
    icon: Binary,
    keywords: ["binary", "hex", "octal", "decimal", "2進", "16進", "にしん", "じゅうろくしん"],
    component: lazy(() => import("./NumberBase")),
  },
  {
    id: "color",
    name: "カラー変換",
    en: "Color Converter",
    description: "HEX・RGB・HSL・OKLCH などの色の表記を相互に変換します",
    category: "convert",
    icon: Palette,
    keywords: ["hex", "rgb", "hsl", "oklch", "cmyk", "色", "contrast", "コントラスト"],
    component: lazy(() => import("./ColorConverter")),
  },
  // ---- エンコード / デコード ----
  {
    id: "base64",
    name: "Base64",
    en: "Base64 Encoder / Decoder",
    description: "テキストを Base64 にエンコード・デコードします",
    category: "encode",
    icon: FileCode,
    keywords: ["encode", "decode", "エンコード", "デコード", "base64url"],
    component: lazy(() => import("./Base64Tool")),
  },
  {
    id: "url",
    name: "URLエンコード",
    en: "URL Encoder / Decoder",
    description: "URL のパーセントエンコード・デコードと、URL の分解をします",
    category: "encode",
    icon: Link,
    keywords: ["percent", "uri", "query", "パーセント", "クエリ"],
    component: lazy(() => import("./UrlTool")),
  },
  {
    id: "html-entity",
    name: "HTMLエンティティ",
    en: "HTML Entity Encoder / Decoder",
    description: "HTML の特殊文字を文字参照にエスケープ・元に戻します",
    category: "encode",
    icon: Code,
    keywords: ["escape", "エスケープ", "文字参照", "html"],
    component: lazy(() => import("./HtmlEntity")),
  },
  {
    id: "jwt",
    name: "JWTデコーダー",
    en: "JWT Decoder",
    description: "JSON Web Token のヘッダー・ペイロード・有効期限を確認します",
    category: "encode",
    icon: ShieldCheck,
    keywords: ["token", "トークン", "bearer", "oauth", "jws"],
    component: lazy(() => import("./JwtDecoder")),
  },
  // ---- 整形 ----
  {
    id: "json-format",
    name: "JSON整形",
    en: "JSON Formatter",
    description: "JSON をインデントして読みやすくしたり、1行に圧縮したりします",
    category: "format",
    icon: Braces,
    keywords: ["pretty", "minify", "beautify", "validate", "整形", "圧縮", "検証"],
    component: lazy(() => import("./JsonFormatter")),
  },
  {
    id: "sql-format",
    name: "SQL整形",
    en: "SQL Formatter",
    description: "SQL をインデントして読みやすく整えます",
    category: "format",
    icon: Database,
    keywords: ["mysql", "postgresql", "sqlite", "beautify", "整形"],
    component: lazy(() => import("./SqlFormatter")),
  },
  // ---- 生成 ----
  {
    id: "uuid",
    name: "UUID生成",
    en: "UUID Generator",
    description: "UUID (v4 / v7) をまとめて生成します",
    category: "generate",
    icon: Fingerprint,
    keywords: ["guid", "uuidv4", "uuidv7", "ulid", "id"],
    component: lazy(() => import("./UuidGenerator")),
  },
  {
    id: "hash",
    name: "ハッシュ生成",
    en: "Hash / Checksum",
    description: "テキストやファイルの MD5・SHA-1・SHA-256 などを求めます",
    category: "generate",
    icon: Hash,
    keywords: ["md5", "sha1", "sha256", "sha512", "checksum", "チェックサム", "hmac", "digest"],
    component: lazy(() => import("./HashTool")),
  },
  {
    id: "password",
    name: "パスワード生成",
    en: "Password Generator",
    description: "条件を指定して安全なランダムパスワードを作ります",
    category: "generate",
    icon: KeyRound,
    keywords: ["random", "ランダム", "passphrase", "secret", "記号", "symbol"],
    component: lazy(() => import("./PasswordGenerator")),
  },
  // ---- テキスト ----
  {
    id: "case",
    name: "ケース変換",
    en: "Case Converter",
    description: "camelCase・snake_case・kebab-case などに一括変換します",
    category: "text",
    icon: CaseSensitive,
    keywords: ["camel", "snake", "kebab", "pascal", "upper", "lower", "大文字", "小文字"],
    component: lazy(() => import("./CaseConverter")),
  },
  {
    id: "zenhan",
    name: "全角 / 半角変換",
    en: "Full-width / Half-width",
    description: "英数字・記号・カナの全角と半角、ひらがなとカタカナを変換します",
    category: "text",
    icon: Languages,
    keywords: ["zenkaku", "hankaku", "全角", "半角", "カタカナ", "ひらがな", "かな"],
    component: lazy(() => import("./ZenHan")),
  },
  {
    id: "counter",
    name: "文字数カウント",
    en: "Text Counter",
    description: "文字数・バイト数・行数・原稿用紙の枚数などを数えます",
    category: "text",
    icon: Pilcrow,
    keywords: ["count", "length", "bytes", "文字数", "バイト", "行数", "word"],
    component: lazy(() => import("./TextCounter")),
  },
  {
    id: "regex",
    name: "正規表現テスター",
    en: "Regex Tester",
    description: "正規表現の一致箇所・グループ・置換結果をその場で確認します",
    category: "text",
    icon: Regex,
    keywords: ["regexp", "regular expression", "match", "replace", "置換", "せいき"],
    component: lazy(() => import("./RegexTester")),
  },
  {
    id: "diff",
    name: "テキスト比較",
    en: "Text Diff",
    description: "2つのテキストの違いを左右に並べて表示します",
    category: "text",
    icon: GitCompare,
    keywords: ["compare", "差分", "比較", "diff", "merge"],
    component: lazy(() => import("./TextDiff")),
  },
];

export const TOOL_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export function categoryOf(id: CategoryId): Category {
  return CATEGORIES.find((c) => c.id === id)!;
}
