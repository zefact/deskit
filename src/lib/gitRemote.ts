/**
 * Git のリモートURLの読み取りと、アカウントに合わせたURLへの書き換え。
 *
 * 複数のアカウントは、次のどちらかで使い分ける。
 *  - SSH: 「git@github-work:org/repo.git」のように ~/.ssh/config の別名で鍵を選ぶ
 *  - HTTPS: 「https://taro-work@github.com/org/repo.git」のようにユーザー名を入れ、
 *    認証情報の保存先 (Git Credential Manager・キーチェーンなど) にユーザー名ごとのトークンを選ばせる
 * どのURLがどのアカウントのものかを判断し、別のアカウントへ切り替えるときのURLを作る
 */

export interface ParsedRemote {
  kind: "scp" | "ssh" | "https";
  /** ユーザー名 (HTTPS の「ユーザー名:トークン@」のトークンは含めない) */
  user?: string;
  host: string;
  port?: string;
  /** org/repo.git の部分 */
  path: string;
}

const trimPath = (p: string) => p.replace(/^\/+/, "").replace(/\/+$/, "");

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function parseRemote(url: string): ParsedRemote | null {
  const s = url.trim();
  let m = /^(?:ssh|git\+ssh):\/\/(?:([^@/]+)@)?([^/:]+)(?::(\d+))?\/(.+)$/i.exec(s);
  if (m) return { kind: "ssh", user: m[1], host: m[2], port: m[3], path: trimPath(m[4]) };
  m = /^https?:\/\/(?:([^@/]+)@)?([^/:]+)(?::(\d+))?\/(.+)$/i.exec(s);
  if (m) {
    const user = m[1] ? decode(m[1].split(":")[0]) : undefined;
    return { kind: "https", user: user || undefined, host: m[2], port: m[3], path: trimPath(m[4]) };
  }
  // git@host:org/repo.git (scp 形式)。1文字のホストは Windows のドライブ (C:\) なので除く
  m = /^(?:([^@/:\s]+)@)?([^/:\s]{2,}):(?!\/)(.+)$/.exec(s);
  if (m) return { kind: "scp", user: m[1], host: m[2], path: trimPath(m[3]) };
  return null;
}

/** トークンらしい値 (GitHub・GitLab の個人用アクセストークンなど) */
const TOKEN_LIKE = /^(gh[pousr]_|github_pat_|glpat-)/;

/**
 * 画面に出すためのURL。「https://ユーザー名:トークン@」のトークンや、
 * ユーザー名の欄に入れたトークンを伏せる
 */
export function maskUrl(url: string): string {
  return url.replace(/^(https?:\/\/)([^@/]+)@/i, (_all, scheme: string, cred: string) => {
    const [user, pass] = cred.split(":");
    const shownUser = TOKEN_LIKE.test(user) ? "••••" : user;
    return pass === undefined ? `${scheme}${shownUser}@` : `${scheme}${shownUser}:••••@`;
  });
}

export interface HostLike {
  alias: string;
  hostName?: string | null;
}

/** 別名なら HostName (本当の接続先) を、そうでなければそのまま返す */
export function realHost(host: string, hosts: HostLike[]): string {
  const h = hosts.find((x) => x.alias === host);
  return (h?.hostName ?? host).toLowerCase();
}

export function aliasUrl(path: string, alias: string): string {
  return `git@${alias}:${trimPath(path)}`;
}

export function httpsUrl(path: string, user: string, host: string): string {
  return `https://${encodeURIComponent(user)}@${host}/${trimPath(path)}`;
}

export interface AccountLike {
  id: string;
  /** SSH で使う別名 (HTTPS のアカウントでは使わない) */
  sshHost: string;
  /** 接続のしかた (古いデータには無いので、無ければ SSH) */
  protocol?: "ssh" | "https";
  /** HTTPS で使うユーザー名 */
  httpsUser?: string;
  /** HTTPS の接続先 (github.com など) */
  httpsHost?: string;
}

export const isHttps = (a: AccountLike) => a.protocol === "https";

const httpsHostOf = (a: AccountLike) => (a.httpsHost || "github.com").toLowerCase();

/** アカウントの本当の接続先 (github.com など) */
export function accountHost(a: AccountLike, hosts: HostLike[]): string {
  return isHttps(a) ? httpsHostOf(a) : realHost(a.sshHost, hosts);
}

/** アカウントの形のリモートURL */
export function remoteUrlFor(a: AccountLike, path: string): string {
  return isHttps(a) ? httpsUrl(path, a.httpsUser ?? "", httpsHostOf(a)) : aliasUrl(path, a.sshHost);
}

/**
 * そのリモートが、どのアカウントのものか。
 * SSH は別名で、HTTPS はURLに入れたユーザー名と接続先で見分ける (ユーザー名の無い HTTPS は対象外)
 */
export function accountOfRemote<T extends AccountLike>(url: string, accounts: T[]): T | undefined {
  const p = parseRemote(url);
  if (!p) return undefined;
  if (p.kind === "https") {
    const user = p.user?.toLowerCase();
    if (!user) return undefined;
    return accounts.find(
      (a) => isHttps(a) && a.httpsUser?.toLowerCase() === user && httpsHostOf(a) === p.host.toLowerCase(),
    );
  }
  return accounts.find((a) => !isHttps(a) && a.sshHost === p.host);
}

export interface RemoteChange {
  name: string;
  from: string;
  to: string;
  /**
   * 接続のしかたも変わるか。他人のリポジトリ (upstream など) のこともあるので、画面では既定で外す。
   * toSsh: HTTPS → SSH / toHttps: SSH → HTTPS / null: 同じまま
   */
  change: "toSsh" | "toHttps" | null;
}

/**
 * アカウントを当てはめたときのリモートURLの変更。
 * 同じサービス (github.com など) を向いているリモートだけを、そのアカウントの形
 * (SSH なら別名、HTTPS ならユーザー名入り) に書き換える
 */
export function planRemoteChanges(
  remotes: { name: string; url: string }[],
  account: AccountLike,
  hosts: HostLike[],
): RemoteChange[] {
  const target = accountHost(account, hosts);
  const wantHttps = isHttps(account);
  const out: RemoteChange[] = [];
  for (const r of remotes) {
    const p = parseRemote(r.url);
    if (!p || p.port) continue;
    const isHttpsRemote = p.kind === "https";
    const host = isHttpsRemote ? p.host.toLowerCase() : realHost(p.host, hosts);
    if (host !== target) continue;
    // SSH の形にするときは、慣例どおり末尾に .git を付ける
    const path = isHttpsRemote && !wantHttps && !p.path.endsWith(".git") ? `${p.path}.git` : p.path;
    const to = remoteUrlFor(account, path);
    if (to === r.url) continue;
    const change = isHttpsRemote === wantHttps ? null : wantHttps ? "toHttps" : "toSsh";
    out.push({ name: r.name, from: r.url, to, change });
  }
  return out;
}

const SERVICE_NAMES: Record<string, string> = {
  "github.com": "GitHub",
  "gitlab.com": "GitLab",
  "bitbucket.org": "Bitbucket",
  "ssh.dev.azure.com": "Azure DevOps",
};

/** 接続先のホストの、画面に出す名前 (github.com → GitHub) */
export function serviceName(host: string): string {
  return SERVICE_NAMES[host.toLowerCase()] ?? host;
}
