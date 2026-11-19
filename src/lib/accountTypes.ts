/** Git アカウント・AWS プロファイルのツールで、Rust 側とやり取りする値の形 */

// ---- Git ----

export interface SshHost {
  alias: string;
  hostName: string | null;
  user: string | null;
  port: string | null;
  identityFile: string | null;
  identitiesOnly: string | null;
  /** ~/.ssh/config 本体に1つだけ書かれた Host で、このアプリで書き換えられるか */
  editable: boolean;
}

/** 「SSH接続」の画面に出す内容 */
export interface SshOverview {
  hosts: SshHost[];
  configPath: string;
}

/** ~/.ssh の鍵 (公開鍵と組になっている秘密鍵) */
export interface SshKey {
  /** ~/.ssh/id_ed25519_work のような、設定に書く形のパス */
  path: string;
  keyType: string;
  /** 公開鍵のコメント (ふつうはメールアドレス) */
  comment: string | null;
}

/** ~/.ssh/config に書く Host の内容 */
export interface HostInput {
  alias: string;
  hostName: string;
  user: string | null;
  port: string | null;
  identityFile: string | null;
  identitiesOnly: boolean;
}

export interface GitOverview {
  gitVersion: string | null;
  gitError: string | null;
  globalName: string | null;
  globalEmail: string | null;
  /** HTTPS の認証情報の保存先 (credential.helper) */
  credentialHelper: string | null;
  sshHosts: SshHost[];
  sshConfigPath: string;
}

/** 接続確認が失敗した種類 (unknownHost なら、ホストの鍵を登録できる) */
export type SshFailReason = "unknownHost" | "hostChanged" | "denied" | "dns" | "network" | "other";

export interface SshTest {
  ok: boolean;
  user: string | null;
  message: string;
  reason: SshFailReason | null;
}

export interface HostKey {
  keyType: string;
  /** SHA256:… の形の指紋 */
  fingerprint: string;
}

/** 接続先から取得したホスト鍵と、公式の指紋との照合結果 */
export interface HostKeys {
  host: string;
  hostName: string;
  port: number;
  keys: HostKey[];
  service: string | null;
  verdict: "verified" | "mismatch" | "unknown";
  /** すでに known_hosts にある、この接続先の鍵の数 */
  registered: number;
  knownHostsPath: string;
}

export interface Remote {
  name: string;
  url: string;
}

export interface RepoInfo {
  root: string;
  branch: string | null;
  localName: string | null;
  localEmail: string | null;
  remotes: Remote[];
}

/**
 * 画面側で保存するアカウント (表示名と、コミットの作者と、接続のしかたの組)。
 * 接続は SSH (別名で鍵を選ぶ) か HTTPS (URLのユーザー名でトークンを選ぶ) のどちらか
 */
export interface GitAccount {
  id: string;
  label: string;
  name: string;
  email: string;
  /** SSH の別名 (HTTPS のアカウントでは空) */
  sshHost: string;
  /** 古いデータには無いので、無ければ SSH */
  protocol?: "ssh" | "https";
  /** HTTPS で使うユーザー名 */
  httpsUser?: string;
  /** HTTPS の接続先 (github.com など) */
  httpsHost?: string;
}

// ---- AWS ----

export type AwsProfileKind = "keys" | "sso" | "role" | "process" | "none";

export interface AwsProfile {
  name: string;
  region: string | null;
  output: string | null;
  /** 伏せたアクセスキーID */
  accessKey: string | null;
  hasSecret: boolean;
  hasSessionToken: boolean;
  inConfig: boolean;
  inCredentials: boolean;
  kind: AwsProfileKind;
  extra: [string, string][];
}

export interface AwsIntegration {
  supported: boolean;
  shell: string | null;
  rcPath: string | null;
  installed: boolean;
  snippet: string;
}

export interface AwsOverview {
  configPath: string;
  credentialsPath: string;
  profiles: AwsProfile[];
  selected: string | null;
  integration: AwsIntegration;
}

/**
 * アカウントの名前を読みにいった結果。
 * found: 読めた / none: 付いていない / denied: 読む権限がない /
 * unsupported: AWS CLI が古くて読めない / error: そのほかの失敗
 */
export type NameStatus = "found" | "none" | "denied" | "unsupported" | "error";

export interface NameLookup {
  status: NameStatus;
  value: string | null;
  detail: string | null;
}

export interface AwsIdentity {
  account: string;
  arn: string;
  userId: string;
  /** IAM のアカウントエイリアス */
  alias: NameLookup;
  /** コンソールや Organizations で付けたアカウント名 */
  accountName: NameLookup;
}

export interface AwsSaveInput {
  original: string | null;
  name: string;
  region: string;
  output: string;
  accessKeyId: string;
  secretAccessKey: string;
}
