/**
 * Git アカウントの確認と切り替え。
 *
 * Git で「誰として」作業するかは、別々の2つで決まる。
 *  - コミットの作者: user.name / user.email。コミットの履歴に残る
 *  - 接続に使う鍵: リモートURL (git@<別名>:org/repo.git) の別名から、~/.ssh/config で鍵が決まる
 * この2つの組を「アカウント」として登録し、リポジトリごと (.git/config の作者とリモートURL) に切り替える。
 * パソコン全体の既定の作者 (~/.gitconfig の名前とメール) は、アカウントとは別に直接書き換える。
 * ~/.ssh/config の別名そのものは「SSH接続」で直す (アカウントの追加の画面からも新しく作れる)
 */

import { getCurrentWebview } from "@tauri-apps/api/webview";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronDown,
  CircleCheck,
  CircleX,
  FileText,
  FolderGit2,
  FolderOpen,
  KeyRound,
  Laptop,
  Lightbulb,
  LoaderCircle,
  type LucideIcon,
  Minus,
  Pencil,
  PenLine,
  PlugZap,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field, Modal } from "../components/Modal";
import { Button, IconButton, Notice, Segmented, Select, TextInput } from "../components/ui";
import type { GitAccount, GitOverview, HostKeys, RepoInfo, SshHost, SshTest } from "../lib/accountTypes";
import {
  accountHost,
  accountOfRemote,
  httpsUrl,
  isHttps,
  maskUrl,
  parseRemote,
  planRemoteChanges,
  realHost,
  type RemoteChange,
  serviceName,
} from "../lib/gitRemote";
import { openTool } from "../nav";
import { inTauri } from "../platform";
import { createStore, useStore } from "../store";
import { call, pickFolder } from "../tauriApi";
import { errorMessage } from "./common";
import { gitAccountsStore } from "./gitAccountsStore";
import type { ToolProps } from "./registry";
import { basename, GIT_SERVICES, HostForm } from "./sshShared";

const recentReposStore = createStore<string[]>(
  "git-recent-repos",
  [],
  (v): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string"),
);
/** 「しくみ」の説明を開いているか */
const helpOpenStore = createStore<boolean>("git-help-open", true, (v): v is boolean => typeof v === "boolean");

/** HTTPS で使い分けられるサービス (ほかは「その他」で入力する) */
const HTTPS_SERVICES = ["github.com", "gitlab.com", "bitbucket.org"];

/** 認証情報の保存先 (credential.helper の値) の、画面に出す名前 */
function helperLabel(helper: string | null | undefined): string | null {
  if (!helper) return null;
  const names = helper.split(", ").map((h) => {
    const base = basename(h.replace(/^!/, "").split(/\s+/)[0]).replace(/\.exe$/i, "");
    if (base === "osxkeychain" || base === "git-credential-osxkeychain") return "macOS のキーチェーン";
    if (/^(manager|manager-core|git-credential-manager(-core)?)$/.test(base)) return "Git Credential Manager";
    if (base === "wincred") return "Windows 資格情報マネージャー";
    if (base === "gh") return "GitHub CLI";
    if (base === "store") return "ファイル (~/.git-credentials・暗号化なし)";
    if (base === "cache") return "メモリ (しばらくのあいだだけ)";
    return base;
  });
  return [...new Set(names)].join("・");
}

const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

const author = (name: string | null | undefined, email: string | null | undefined) =>
  `${name || "(名前なし)"} <${email || "メールなし"}>`;

type TestState = SshTest | "busy";

/**
 * 接続確認の結果。失敗したときは理由を省略せずに出し、
 * 初めての相手 (ホストの鍵が未登録) なら、その場で登録できるボタンを出す
 */
function TestLine({
  state,
  service,
  onTrust,
}: {
  state: TestState | undefined;
  service: string;
  onTrust?: () => void;
}) {
  if (!state) return <span className="faint">接続はまだ確認していません</span>;
  if (state === "busy")
    return (
      <span className="test-busy">
        <LoaderCircle size={13} className="spin" /> 確認しています…
      </span>
    );
  if (state.ok)
    return (
      <span className="test-ok">
        <CircleCheck size={13} />
        {state.user ? (
          <span>
            {service} に <b>{state.user}</b> として接続できます
          </span>
        ) : (
          state.message
        )}
      </span>
    );
  return (
    <div className="test-fail">
      <span className="test-ng is-full">
        <CircleX size={13} />
        <span>{state.message}</span>
      </span>
      {state.reason === "unknownHost" && onTrust && (
        <Button icon={ShieldCheck} onClick={onTrust}>
          ホストの鍵を登録
        </Button>
      )}
    </div>
  );
}

// ======================= ホストの鍵の登録 =======================

/**
 * 初めて接続する相手の鍵を取得して指紋を見せ、確かめてから ~/.ssh/known_hosts に登録する。
 * GitHub・GitLab・Bitbucket は、公式に公開されている指紋と照らし合わせる
 */
function HostKeyDialog({ host, onClose, onTrusted }: { host: string; onClose: () => void; onTrusted: () => void }) {
  const [info, setInfo] = useState<HostKeys | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    call<HostKeys>("git_host_keys", { host })
      .then((r) => alive && setInfo(r))
      .catch((e) => alive && setError(errorMessage(e)));
    return () => {
      alive = false;
    };
  }, [host]);

  const trust = async () => {
    if (!info) return;
    setSaving(true);
    setError(null);
    try {
      await call<number>("git_trust_host", { host, fingerprints: info.keys.map((k) => k.fingerprint) });
      onTrusted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const where = info ? `${info.hostName}${info.port !== 22 ? `:${info.port}` : ""}` : host;

  return (
    <Modal
      title="ホストの鍵を登録"
      wide
      onClose={onClose}
      footer={
        <>
          <span className="dialog-foot-note">登録する前に、元の known_hosts をバックアップします</span>
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            variant="primary"
            icon={ShieldCheck}
            onClick={trust}
            disabled={!info || info.verdict === "mismatch" || saving}
          >
            {saving ? "登録しています…" : "登録して接続を確認"}
          </Button>
        </>
      }
    >
      <p>
        初めて接続する相手には、ssh が「本当にその相手か」を確かめるための鍵がまだありません。相手から鍵を取得し、指紋
        (鍵の要約) を確かめてから ~/.ssh/known_hosts に登録します。ターミナルで ssh を実行して yes と答えるのと同じです。
      </p>
      {!info && !error && (
        <div className="hostkey-loading">
          <LoaderCircle size={16} className="spin" /> {host} の鍵を取得しています…
        </div>
      )}
      {info && (
        <>
          <div className="hostkey-target">
            <span className="hostkey-label">接続先</span>
            <span className="mono">{where}</span>
            {info.host !== info.hostName && <span className="faint">(別名 {info.host})</span>}
          </div>
          {info.verdict === "verified" && (
            <Notice kind="ok">
              {info.service} が公式に公開している指紋と、すべて一致しました。安心して登録できます。
            </Notice>
          )}
          {info.verdict === "mismatch" && (
            <Notice kind="error">
              {info.service} が公式に公開している指紋と一致しません。通信の途中でなりすまされている可能性があるため、登録できません。別のネットワークで試すか、{info.service} の告知を確認してください。
            </Notice>
          )}
          {info.verdict === "unknown" && (
            <Notice kind="warn">
              このホストの公式の指紋は、Deskit では分かりません。サービスの管理者が公開している指紋と見比べて、同じときだけ登録してください。
            </Notice>
          )}
          <div className="hostkey-list">
            {info.keys.map((k) => (
              <div className="hostkey-row" key={k.fingerprint}>
                <span className="hostkey-type">{k.keyType}</span>
                <span className="mono hostkey-print">{k.fingerprint}</span>
                {info.verdict === "verified" && <CircleCheck size={14} className="hostkey-ok" />}
              </div>
            ))}
          </div>
          {info.registered > 0 && (
            <p className="faint">この接続先の鍵は、すでに {info.registered} 件登録されています。まだない鍵だけを追加します。</p>
          )}
        </>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Modal>
  );
}

/** 見出し・ひとこと説明・ボタンをそろえた、画面のひと区切り */
function Section({
  icon: Icon,
  title,
  desc,
  actions,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  desc?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="git-sec">
      <header className="git-sec-head">
        <div className="git-sec-icon">
          <Icon size={16} />
        </div>
        <div className="git-sec-text">
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {actions && <div className="git-sec-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** ほかのツールを開く、文中のリンク */
function ToolLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <button type="button" className="text-link" onClick={() => openTool(id)}>
      {children}
    </button>
  );
}

// ======================= しくみの説明 =======================

interface Example {
  alias: string;
  hostName: string;
  key: string;
  /** 接続確認で分かったユーザー名 */
  user: string | null;
  /** 手元の ~/.ssh/config の値か (false なら架空の例) */
  real: boolean;
  /** .git/config に書く作者 (この別名を使うアカウントがあれば、その作者) */
  author: { name: string; email: string; account: string | null };
  /** ~/.gitconfig の作者 (設定がなければ例) */
  global: { name: string; email: string; real: boolean };
}

const EXAMPLE_AUTHOR = { name: "Taro Yamada", email: "taro@example.com" };

/** 図に出す設定ファイル1つ分 */
function FileBlock({
  name,
  origin,
  writer,
  children,
}: {
  name: string;
  /** このパソコンの内容か、例か */
  origin: string;
  /** Deskit のどこで書き換えるか */
  writer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="git-file">
      <div className="git-file-head">
        <FileText size={13} />
        <span className="git-file-name">{name}</span>
        <span className="git-file-origin">{origin}</span>
      </div>
      {children}
      <div className="git-file-writer">{writer}</div>
    </div>
  );
}

function HowItWorks({ open, example }: { open: boolean; example: Example }) {
  const service = serviceName(example.hostName);
  return (
    <section className={`git-help ${open ? "is-open" : ""}`}>
      <button type="button" className="git-help-head" onClick={() => helpOpenStore.set(!open)} aria-expanded={open}>
        <Lightbulb size={16} />
        <span className="git-help-title">Gitアカウントのしくみ</span>
        <span className="git-help-lead">「コミットの作者」と「接続に使う鍵」は、別々のファイルで決まります</span>
        <span className="git-help-toggle">
          {open ? "閉じる" : "開く"}
          <ChevronDown size={15} />
        </span>
      </button>
      {open && (
        <div className="git-help-body">
          <p className="git-help-intro">
            Git で「誰として」作業するかは、次の2つで決まります。片方だけを切り替えると、食い違いが起きます。
          </p>
          <div className="git-help-pair">
            <div className="git-help-box">
              <div className="git-help-box-head">
                <PenLine size={15} /> コミットの作者
                <code>user.name</code>
                <code>user.email</code>
              </div>
              <p>
                コミットの履歴に残る名前とメールアドレスです。GitHub は、このメールアドレスでコミットを誰のものとして表示するかを決めます。
              </p>
              <p className="git-help-ng">
                <TriangleAlert size={13} />
                違っていると、会社のリポジトリに個人のメールアドレスでコミットが残ります
              </p>
            </div>
            <div className="git-help-box">
              <div className="git-help-box-head">
                <KeyRound size={15} /> GitHub への接続
                <code>SSH の鍵</code>
              </div>
              <p>
                push や pull のときに、どの GitHub アカウントとしてログインするかです。どの鍵を使って接続するかで決まります。
              </p>
              <p className="git-help-ng">
                <TriangleAlert size={13} />
                違っていると、push できない (Permission denied) か、別のアカウントで push されます
              </p>
            </div>
          </div>

          <h3>どのファイルに書かれるか</h3>
          <p>
            作者と鍵は、別々のファイルから探されます。Git の中では、この2つは結びついていません。リポジトリの{" "}
            <code>.git/config</code> に「作者」と「接続に使う別名」の両方を書いておくと、そのリポジトリでは組がそろいます。
          </p>
          <div className="git-map">
            <div className="git-map-head">
              <PenLine size={14} /> コミットの作者
            </div>
            <div className="git-map-head">
              <KeyRound size={14} /> 接続に使う鍵
            </div>

            <div className="git-map-wide">
              <FileBlock
                name="リポジトリの .git/config"
                origin={example.author.account ? `「${example.author.account}」を設定したとき` : "例"}
                writer={<>「リポジトリごとのアカウント設定」で、この2か所を書き換えます</>}
              >
                <div className="git-file-split">
                  <pre className="git-file-code">
                    {"[user]\n  name = "}
                    <mark>{example.author.name}</mark>
                    {"\n  email = "}
                    <mark>{example.author.email}</mark>
                  </pre>
                  <pre className="git-file-code">
                    {'[remote "origin"]\n  url = git@'}
                    <mark>{example.alias}</mark>
                    {":org/repo.git"}
                  </pre>
                </div>
              </FileBlock>
            </div>

            <div className="git-map-link">
              <ArrowDown size={14} /> ここに作者がなければ
            </div>
            <div className="git-map-link">
              <ArrowDown size={14} /> 別名「{example.alias}」を探す
            </div>

            <FileBlock
              name="~/.gitconfig"
              origin={example.global.real ? "このパソコンの内容" : "例"}
              writer={<>「パソコン全体の既定の作者」で書き換えます</>}
            >
              <pre className="git-file-code">
                {"[user]\n  name = "}
                <mark>{example.global.name}</mark>
                {"\n  email = "}
                <mark>{example.global.email}</mark>
              </pre>
            </FileBlock>
            <FileBlock
              name="~/.ssh/config"
              origin={example.real ? "このパソコンの内容" : "例"}
              writer={
                <>
                  「<ToolLink id="ssh-hosts">SSH接続</ToolLink>」で追加・編集します
                </>
              }
            >
              <pre className="git-file-code">
                {"Host "}
                <mark>{example.alias}</mark>
                {`\n  HostName ${example.hostName}\n  IdentityFile `}
                <mark>{example.key}</mark>
              </pre>
            </FileBlock>

            <div className="git-map-result">
              <ArrowDown size={14} />
              <span>見つかった作者が、コミットの履歴に残ります</span>
            </div>
            <div className="git-map-result">
              <ArrowDown size={14} />
              <span>
                鍵 <code>{basename(example.key)}</code> で {example.hostName} に接続し、
                {example.user ? (
                  <>
                    {service} の <b>{example.user}</b> として認証されます
                  </>
                ) : (
                  <>その鍵を登録した {service} アカウントとして認証されます</>
                )}
              </span>
            </div>
          </div>
          <p className="git-help-note">
            別名を使わない <code>git@github.com:…</code> では、いつも同じ鍵が使われるため、アカウントを使い分けられません。
          </p>
          <p className="git-help-note">
            HTTPS で使う場合は、鍵の代わりにトークン (またはブラウザでのログイン) で認証します。リモートURLにユーザー名を入れる
            (<code>https://ユーザー名@github.com/org/repo.git</code>) と、認証情報の保存先 (キーチェーンなど) がユーザー名ごとにトークンを使い分けます。
          </p>
          <p className="git-help-note">
            このツールの「アカウント」は、作者と別名の組をアプリの中に覚えておき、<code>.git/config</code> の2か所をいっしょに書き換えるためのものです。登録しただけでは、どのファイルも変わりません。
          </p>
        </div>
      )}
    </section>
  );
}

// ======================= アカウントのカード =======================

function AccountCard({
  account: a,
  hosts,
  helper,
  test,
  onTest,
  onTrust,
  onEdit,
  onDelete,
}: {
  account: GitAccount;
  hosts: SshHost[];
  /** HTTPS の認証情報の保存先 (画面に出す名前) */
  helper: string | null;
  test: TestState | undefined;
  onTest: () => void;
  onTrust: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const https = isHttps(a);
  const host = hosts.find((h) => h.alias === a.sshHost);
  const real = accountHost(a, hosts);
  const service = serviceName(real);
  return (
    <div className="acct-card">
      <div className="acct-top">
        <div className="acct-avatar">{(a.label || a.name).slice(0, 1).toUpperCase()}</div>
        <div className="acct-label">{a.label}</div>
        <div className="acct-tools">
          <IconButton icon={Pencil} label="編集" onClick={onEdit} />
          <IconButton icon={Trash2} label="一覧から削除" onClick={onDelete} />
        </div>
      </div>
      <div className="acct-rows">
        <div className="acct-row">
          <div className="acct-row-label">
            <PenLine size={13} /> コミットの作者
          </div>
          <div className="acct-row-value">
            {a.name} <span className="faint">&lt;{a.email}&gt;</span>
          </div>
        </div>
        <div className="acct-row">
          <div className="acct-row-label">
            <KeyRound size={13} /> {https ? "接続 (HTTPS)" : "接続に使う別名"}
          </div>
          {https ? (
            <div className="acct-row-value is-wrap">
              <span className="mono">{a.httpsUser}</span>
              <span className="faint"> @ {real} · トークンで認証</span>
            </div>
          ) : (
            <div className="acct-row-value is-wrap">
              <span className="mono">{a.sshHost}</span>
              <span className="faint">
                {real !== a.sshHost.toLowerCase() && ` → ${real}`}
                {host?.identityFile ? ` · 鍵 ${basename(host.identityFile)}` : " · 既定の鍵"}
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="acct-test">
        {https ? (
          // HTTPS は、トークンを読まずに確かめる方法がないので、接続確認はしない
          <span className={helper ? "acct-note" : "acct-note is-warn"}>
            {helper
              ? `push / pull のときに、${helper}に保存した ${a.httpsUser} のトークンで認証します`
              : "認証情報の保存先が設定されていないため、push / pull のたびにトークンを聞かれます"}
          </span>
        ) : (
          <>
            <TestLine state={test} service={service} onTrust={onTrust} />
            <Button icon={PlugZap} onClick={onTest} disabled={test === "busy"}>
              接続を確認
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ======================= アカウントの追加・編集 =======================

function AccountForm({
  initial,
  others,
  hosts,
  helper,
  tests,
  onTest,
  onTrust,
  onSave,
  onNewAlias,
  onClose,
}: {
  initial: GitAccount;
  /** ほかのアカウント (作者が同じかを見るため) */
  others: GitAccount[];
  hosts: SshHost[];
  /** HTTPS の認証情報の保存先 (画面に出す名前) */
  helper: string | null;
  tests: Record<string, TestState>;
  onTest: (host: string) => Promise<SshTest>;
  onTrust: (host: string) => void;
  onSave: (a: GitAccount) => void;
  /** 別名を新しく作る (作ったら then で受け取る) */
  onNewAlias: (then: (alias: string) => void) => void;
  onClose: () => void;
}) {
  const [a, setA] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof GitAccount) => (v: string) => setA((x) => ({ ...x, [k]: v }));

  // 別名の候補: Git のサービスを向いている別名 → 別名を使わない接続 → そのほかの別名
  const options = useMemo(() => {
    const gitHosts = hosts.filter((h) => GIT_SERVICES.includes(realHost(h.alias, hosts)));
    const others = hosts.filter((h) => !gitHosts.includes(h));
    const list = [
      ...gitHosts.map((h) => ({
        value: h.alias,
        label: `${h.alias} → ${h.hostName ?? h.alias}${h.identityFile ? `  (鍵 ${basename(h.identityFile)})` : ""}`,
      })),
      ...GIT_SERVICES.filter((s) => !hosts.some((h) => h.alias === s)).map((s) => ({
        value: s,
        label: `${s} (別名を使わない・既定の鍵)`,
      })),
      ...others.map((h) => ({ value: h.alias, label: `${h.alias} → ${h.hostName ?? h.alias}` })),
    ];
    if (a.sshHost && !list.some((o) => o.value === a.sshHost)) list.unshift({ value: a.sshHost, label: a.sshHost });
    return list;
  }, [hosts, a.sshHost]);

  // 同じメールアドレスのアカウントがあると、リポジトリの作者からどのアカウントか見分けられない
  const twin = a.email.trim() ? others.find((o) => sameEmail(o.email, a.email.trim())) : undefined;

  const real = realHost(a.sshHost, hosts);
  // 別名でも鍵の指定でもない、サービスそのままの接続 (ほかのアカウントと鍵が同じになる)
  const bare = a.sshHost.toLowerCase() === real && !hosts.find((h) => h.alias === a.sshHost)?.identityFile;

  const test = async () => {
    const r = await onTest(a.sshHost);
    // 表示名がまだ空か別名のままなら、認証されたユーザー名を入れる
    if (r.ok && r.user && (!a.label.trim() || a.label === a.sshHost)) setA((x) => ({ ...x, label: r.user ?? "" }));
  };

  const https = a.protocol === "https";
  const httpsHost = a.httpsHost || "github.com";
  // 「その他」を選んだか、一覧に無い接続先なら入力欄を出す
  const [customHost, setCustomHost] = useState(!HTTPS_SERVICES.includes(httpsHost));
  const httpsUser = (a.httpsUser ?? "").trim();
  const preview = httpsUrl("org/repo.git", httpsUser || "ユーザー名", httpsHost);

  const save = () => {
    const name = a.name.trim();
    const email = a.email.trim();
    if (!name) return setError("作者の名前を入力してください");
    if (!/^[^\s@]+@[^\s@]+$/.test(email)) return setError("作者のメールアドレスを、メールアドレスの形で入力してください");
    if (https) {
      const host = httpsHost.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host)) return setError("接続先を github.com のような形で入力してください");
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(httpsUser))
        return setError("ユーザー名を入力してください (メールアドレスではなく、サービスのユーザー名です)");
      return onSave({ ...a, name, email, sshHost: "", protocol: "https", httpsUser, httpsHost: host, label: a.label.trim() || httpsUser });
    }
    if (!a.sshHost) return setError("接続に使う別名を選んでください");
    onSave({
      id: a.id,
      label: a.label.trim() || name,
      name,
      email,
      sshHost: a.sshHost,
      protocol: "ssh",
    });
  };

  return (
    <Modal
      title={initial.id ? "アカウントを編集" : "アカウントを追加"}
      onClose={onClose}
      wide
      footer={
        <>
          <span className="dialog-foot-note">保存しても、設定ファイルはまだ書き換えません</span>
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={save}>
            保存
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="表示名" hint="一覧で見分けるための名前です。空のときは作者の名前になります">
          <TextInput value={a.label} onChange={set("label")} mono={false} placeholder="例: 会社 / 個人" />
        </Field>

        <fieldset className="form-group">
          <legend>
            <PenLine size={14} /> コミットの作者
          </legend>
          <p className="form-group-desc">
            コミットの履歴に残る名前とメールアドレスです。GitHub に登録してあるメールアドレスにすると、コミットがそのアカウントのものとして表示されます。
          </p>
          <div className="form-row">
            <Field label="名前" hint="user.name">
              <TextInput value={a.name} onChange={set("name")} mono={false} placeholder="Taro Yamada" />
            </Field>
            <Field label="メールアドレス" hint="user.email">
              <TextInput value={a.email} onChange={set("email")} placeholder="taro@example.com" />
            </Field>
          </div>
          {twin && (
            <p className="form-twin">
              <TriangleAlert size={13} />
              「{twin.label}」と同じメールアドレスです。違う作者にするときは、書き換えてください
            </p>
          )}
        </fieldset>

        <fieldset className="form-group">
          <legend>
            <KeyRound size={14} /> 接続のしかた
          </legend>
          <Segmented
            value={https ? "https" : "ssh"}
            onChange={(p) =>
              setA((x) => ({
                ...x,
                protocol: p,
                // HTTPS のアカウントを SSH に変えたときは、別名の候補の先頭を選んでおく
                sshHost: p === "ssh" && !x.sshHost ? (options[0]?.value ?? "github.com") : x.sshHost,
              }))
            }
            options={[
              { value: "ssh", label: "SSH (別名で鍵を選ぶ)" },
              { value: "https", label: "HTTPS (ユーザー名でトークンを選ぶ)" },
            ]}
          />
          {https ? (
            <>
              <p className="form-group-desc">
                リモートURLにユーザー名を入れます。認証情報の保存先が、ユーザー名ごとにトークンを分けて覚えるので、アカウントを使い分けられます。最初の push / pull のときに、ブラウザでのログインかトークンで認証します (GitHub のパスワードは使えません)。
              </p>
              <div className="form-row">
                <Field label="接続先">
                  <Select
                    value={customHost ? "" : httpsHost}
                    onChange={(v) => {
                      setCustomHost(v === "");
                      setA((x) => ({ ...x, httpsHost: v }));
                    }}
                    options={[
                      ...HTTPS_SERVICES.map((h) => ({ value: h, label: `${h} (${serviceName(h)})` })),
                      { value: "", label: "その他 (GitHub Enterprise など)" },
                    ]}
                  />
                </Field>
                <Field label="ユーザー名" hint={`${customHost ? "サービス" : serviceName(httpsHost)} のユーザー名 (メールアドレスではありません)`}>
                  <TextInput value={a.httpsUser ?? ""} onChange={set("httpsUser")} placeholder="taro-work" />
                </Field>
              </div>
              {customHost && (
                <Field label="接続先のホスト名">
                  <TextInput value={a.httpsHost ?? ""} onChange={set("httpsHost")} placeholder="github.example.co.jp" />
                </Field>
              )}
              <div className="form-preview">
                <span className="hostkey-label">リモートURLの形</span>
                <span className="mono">{preview}</span>
              </div>
              {helper ? (
                <Notice>認証情報の保存先: {helper}。ここにユーザー名ごとのトークンが保存されます。</Notice>
              ) : (
                <Notice kind="warn">
                  認証情報の保存先 (credential.helper) が設定されていません。このままでは、push / pull のたびにトークンを聞かれます。
                </Notice>
              )}
            </>
          ) : (
            <>
          <p className="form-group-desc">
            ~/.ssh/config の Host です。リモートURL (<code>git@別名:org/repo.git</code>) に入り、push / pull に使う鍵が決まります。
          </p>
          <div className="field-row">
            <Select value={a.sshHost} onChange={set("sshHost")} options={options} />
            <Button icon={Plus} onClick={() =>
                // 表示名がまだ空なら、作った別名を入れておく (別名の候補から作るときと同じ)
                onNewAlias((alias) => setA((x) => ({ ...x, sshHost: alias, label: x.label.trim() ? x.label : alias })))
              }>
              新しい別名
            </Button>
            <Button icon={PlugZap} onClick={test}>
              接続を確認
            </Button>
          </div>
          <div className="field-test">
            <TestLine state={tests[a.sshHost]} service={serviceName(real)} onTrust={() => onTrust(a.sshHost)} />
          </div>
          {bare && GIT_SERVICES.includes(real) && (
            <div className="form-tip">
              <p>
                別名を使わず <code>{a.sshHost}</code> にそのまま接続するので、ほかのアカウントと同じ鍵になります。アカウントごとに鍵を分けるには、「新しい別名」で鍵を決めた別名を作ってください。鍵を作らずに使い分けたいときは、上で「HTTPS」を選んでください。
              </p>
            </div>
          )}
            </>
          )}
        </fieldset>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Modal>
  );
}

// ======================= リポジトリごとの切り替え =======================

function RemoteBadge({ url, accounts, hosts }: { url: string; accounts: GitAccount[]; hosts: SshHost[] }) {
  const a = accountOfRemote(url, accounts);
  if (a) return <span className="badge badge-ok">{a.label}</span>;
  const p = parseRemote(url);
  if (p?.kind === "https")
    return p.user ? (
      <span className="badge" data-tip="URLにユーザー名が入っていますが、登録したアカウントのどれでもありません">
        HTTPS · 未登録のユーザー
      </span>
    ) : (
      <span className="badge" data-tip="URLにユーザー名が無いので、認証情報の保存先にある、どれか1つのアカウントで接続します">
        HTTPS · ユーザー名なし
      </span>
    );
  if (p && GIT_SERVICES.includes(p.host.toLowerCase()))
    return (
      <span className="badge" data-tip="別名を使っていないので、いつも同じ既定の鍵で接続します">
        別名なし
      </span>
    );
  if (p && hosts.some((h) => h.alias === p.host)) return <span className="badge">登録していない別名</span>;
  return null;
}

/** 設定したあと、push / pull でどの鍵 (トークン) が使われるか */
function KeyNote({ account, hosts }: { account: GitAccount; hosts: SshHost[] }) {
  if (isHttps(account)) {
    return (
      <p className="repo-key-note">
        <KeyRound size={13} />
        <span>
          push / pull では、認証情報の保存先にある <b className="mono">{account.httpsUser}</b> のトークンが使われます
        </span>
      </p>
    );
  }
  const key = hosts.find((h) => h.alias === account.sshHost)?.identityFile;
  return (
    <p className="repo-key-note">
      <KeyRound size={13} />
      <span>
        push / pull では、<span className="mono">~/.ssh/config</span> の「<span className="mono">{account.sshHost}</span>」
        {key ? (
          <>
            に書かれた鍵 <b className="mono">{basename(key)}</b> が使われます
          </>
        ) : (
          <>に鍵 (IdentityFile) が書かれていないため、既定の鍵が使われます</>
        )}
        。<span className="mono">~/.ssh/config</span> は書き換えません
      </span>
    </p>
  );
}

function RepoSection({
  accounts,
  hosts,
  globalName,
  globalEmail,
  active,
}: {
  accounts: GitAccount[];
  hosts: SshHost[];
  globalName: string | null;
  globalEmail: string | null;
  active: boolean;
}) {
  const recent = useStore(recentReposStore);
  const [repo, setRepo] = useState<RepoInfo | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const r = await call<RepoInfo>("git_inspect_repo", { path });
      setRepo(r);
      recentReposStore.set((l) => [r.root, ...l.filter((x) => x !== r.root)].slice(0, 6));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // フォルダのドロップ (このツールを開いているときだけ。画面の下にあるので、見える位置まで送る)
  useEffect(() => {
    if (!inTauri || !active) return;
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths[0]) {
        load(e.payload.paths[0]);
        cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
    return () => {
      un.then((f) => f());
    };
  }, [active, load]);

  // いまの作者 (ローカルの設定がなければパソコン全体の既定)。git も項目ごとにこの順で探す
  const hasLocal = !!(repo?.localName || repo?.localEmail);
  const effName = repo?.localName ?? globalName;
  const effEmail = repo?.localEmail ?? globalEmail;
  const authorAccount = repo ? accounts.find((a) => sameEmail(a.email, effEmail)) : undefined;
  // いまの接続 (origin を優先して、アカウントの別名を使っているリモート)
  const remoteAccount = useMemo(() => {
    if (!repo) return undefined;
    const sorted = [...repo.remotes].sort((x, y) => Number(y.name === "origin") - Number(x.name === "origin"));
    for (const r of sorted) {
      const a = accountOfRemote(r.url, accounts);
      if (a) return a;
    }
    return undefined;
  }, [repo, accounts]);

  useEffect(() => {
    setTarget(remoteAccount?.id ?? authorAccount?.id ?? accounts[0]?.id ?? "");
  }, [remoteAccount, authorAccount, accounts, repo?.root]);

  // リモートごとに「書き換える / 書き換えない」(HTTPS のものは既定で書き換えない)
  const [pick, setPick] = useState<Record<string, boolean>>({});
  useEffect(() => setPick({}), [repo, target]);

  const account = accounts.find((a) => a.id === target);
  const planned = repo && account ? planRemoteChanges(repo.remotes, account, hosts) : [];
  const isPicked = (c: RemoteChange) => pick[c.name] ?? !c.change;
  const remoteChanges = planned.filter(isPicked);
  const authorChanges = !!repo && !!account && (repo.localName !== account.name || repo.localEmail !== account.email);
  const nothing = remoteChanges.length === 0 && !authorChanges;
  const alreadySet = planned.length === 0 && !authorChanges;

  let verdict: { kind: "ok" | "warn" | "info"; text: ReactNode } | null = null;
  if (repo && accounts.length > 0) {
    if (authorAccount && remoteAccount) {
      verdict =
        authorAccount.id === remoteAccount.id
          ? { kind: "ok", text: <>作者も接続も「{authorAccount.label}」です</> }
          : {
              kind: "warn",
              text: (
                <>
                  作者は「{authorAccount.label}」、接続は「{remoteAccount.label}」で、食い違っています
                </>
              ),
            };
    } else if (remoteAccount) {
      verdict = {
        kind: "warn",
        text: <>接続は「{remoteAccount.label}」ですが、作者のメールアドレスはどのアカウントとも違います</>,
      };
    } else if (authorAccount) {
      verdict = {
        kind: "info",
        text: <>作者は「{authorAccount.label}」です。リモートURLは、どのアカウントの形 (別名・ユーザー名) にもなっていません</>,
      };
    } else {
      verdict = { kind: "info", text: "登録したアカウントのどれにも当てはまりません" };
    }
  }

  const apply = async () => {
    if (!repo || !account) return;
    try {
      const r = await call<RepoInfo>("git_apply_repo", {
        path: repo.root,
        name: account.name,
        email: account.email,
        remotes: remoteChanges.map((c) => ({ name: c.name, url: c.to })),
      });
      setRepo(r);
      setDone(`このリポジトリを「${account.label}」に切り替えました`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const clearLocal = async () => {
    if (!repo) return;
    try {
      setRepo(await call<RepoInfo>("git_clear_repo_identity", { path: repo.root }));
      setDone("このリポジトリの作者の設定を消しました。これからはパソコン全体の既定が使われます");
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const pickAndLoad = async () => {
    const p = await pickFolder();
    if (p) load(p);
  };

  return (
    <Section
      icon={FolderGit2}
      title={
        <>
          リポジトリごとのアカウント設定 <span className="badge badge-ok">おすすめ</span>
        </>
      }
      desc="選んだリポジトリの .git/config に、アカウントの作者と接続 (リモートURL) を設定します。一度設定すれば、切り替え忘れがありません"
      actions={
        <Button icon={FolderOpen} onClick={pickAndLoad}>
          フォルダを選択
        </Button>
      }
    >
      <div className="card repo-card" ref={cardRef}>
        {!repo && !loading && (
          <button type="button" className="repo-drop" onClick={pickAndLoad}>
            <FolderGit2 size={24} />
            <span className="repo-drop-main">リポジトリのフォルダを選ぶか、ここへドロップしてください</span>
            <span className="repo-drop-sub">いまの作者と接続を確かめて、アカウントを切り替えられます</span>
          </button>
        )}
        {loading && (
          <div className="repo-loading">
            <LoaderCircle size={18} className="spin" /> 読み込んでいます…
          </div>
        )}
        {error && (
          <div className="card-pad">
            <Notice kind="error">{error}</Notice>
          </div>
        )}
        {repo && !loading && (
          <>
            <div className="repo-head">
              <FolderGit2 size={18} />
              <span className="repo-name">{basename(repo.root)}</span>
              {repo.branch && <span className="badge">{repo.branch}</span>}
              <span className="repo-path mono">{repo.root}</span>
              <IconButton icon={RefreshCw} label="読み直す" onClick={() => load(repo.root)} />
              <IconButton icon={X} label="閉じる" onClick={() => setRepo(null)} />
            </div>

            <div className="repo-now">
              <div className="repo-now-title">いまの状態</div>
              <div className="repo-grid">
                <div className="repo-label">
                  <PenLine size={13} /> コミットの作者
                </div>
                <div className="repo-value">
                  <span>{effName || effEmail ? author(effName, effEmail) : <span className="faint">設定されていません</span>}</span>
                  <span className="badge">{hasLocal ? "このリポジトリの設定" : "パソコン全体の既定"}</span>
                  {authorAccount && <span className="badge badge-ok">{authorAccount.label}</span>}
                </div>
                <div className="repo-label">
                  <KeyRound size={13} /> 接続 (リモート)
                </div>
                <div className="repo-remotes">
                  {repo.remotes.length === 0 && <span className="faint">リモートはありません</span>}
                  {repo.remotes.map((r) => (
                    <div className="repo-remote" key={r.name}>
                      <span className="remote-name mono">{r.name}</span>
                      <span className="mono remote-url" title={maskUrl(r.url)}>
                        {maskUrl(r.url)}
                      </span>
                      <RemoteBadge url={r.url} accounts={accounts} hosts={hosts} />
                    </div>
                  ))}
                </div>
              </div>
              {verdict && (
                <div className={`repo-verdict is-${verdict.kind}`}>
                  {verdict.kind === "ok" ? <CircleCheck size={14} /> : verdict.kind === "warn" ? <TriangleAlert size={14} /> : <Lightbulb size={14} />}
                  {verdict.text}
                </div>
              )}
            </div>

            {accounts.length > 0 ? (
              <div className="repo-apply">
                <div className="repo-apply-head">
                  <span className="repo-apply-title">このリポジトリで使うアカウント</span>
                  <Select
                    value={target}
                    onChange={setTarget}
                    options={accounts.map((a) => ({ value: a.id, label: `${a.label}  (${a.email})` }))}
                  />
                </div>
                {alreadySet ? (
                  <div className="faint">すでに「{account?.label}」の設定になっています。変える必要はありません</div>
                ) : (
                  <>
                    <div className="repo-apply-sub">
                      書き換える内容
                      <span className="repo-apply-file">
                        ファイル: <span className="mono">{basename(repo.root)}/.git/config</span>
                      </span>
                    </div>
                    <ul className="change-list">
                      {authorChanges && account && (
                        <li>
                          <span className="change-check" />
                          <span className="change-key">コミットの作者</span>
                          <span className={`change-from ${hasLocal ? "" : "is-unset"}`}>
                            {hasLocal ? author(repo.localName, repo.localEmail) : "未設定 (パソコン全体の既定)"}
                          </span>
                          <ArrowRight size={13} />
                          <span className="change-to">{author(account.name, account.email)}</span>
                        </li>
                      )}
                      {planned.map((c) => (
                        <li key={c.name} className={isPicked(c) ? "" : "is-skipped"}>
                          <input
                            type="checkbox"
                            className="change-check"
                            checked={isPicked(c)}
                            onChange={(e) => setPick((m) => ({ ...m, [c.name]: e.target.checked }))}
                            aria-label={`${c.name} のURLを書き換える`}
                          />
                          <span className="change-key">
                            接続 <span className="mono">({c.name})</span>
                          </span>
                          <span className="change-from mono">{maskUrl(c.from)}</span>
                          <ArrowRight size={13} />
                          <span className="change-to mono">{maskUrl(c.to)}</span>
                          {c.change && (
                            <span
                              className="badge"
                              data-tip="接続のしかたも変わります。他人のリポジトリ (upstream など) のこともあるので、はじめは外してあります"
                            >
                              {c.change === "toSsh" ? "HTTPS → SSH" : "SSH → HTTPS"}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {account && <KeyNote account={account} hosts={hosts} />}
                  </>
                )}
                <div className="repo-actions">
                  <Button variant="primary" onClick={apply} disabled={nothing}>
                    このリポジトリに設定
                  </Button>
                  {hasLocal && (
                    <Button variant="ghost" icon={Undo2} onClick={clearLocal}>
                      このリポジトリの作者設定を消す
                    </Button>
                  )}
                </div>
                {done && <Notice kind="ok">{done}</Notice>}
              </div>
            ) : (
              <div className="card-pad">
                <Notice>アカウントを登録すると、ここで切り替えられます</Notice>
              </div>
            )}
          </>
        )}
        {recent.length > 0 && (
          <div className="repo-recent">
            <span className="repo-recent-label">最近のリポジトリ</span>
            {recent.map((p) => (
              <button
                key={p}
                type="button"
                className={`recent-chip ${repo?.root === p ? "is-on" : ""}`}
                onClick={() => load(p)}
                title={p}
              >
                <FolderGit2 size={13} />
                {basename(p)}
              </button>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}

// ======================= パソコン全体の既定 =======================

const EMAIL_RE = /^[^\s@]+@[^\s@]+$/;

/** ~/.gitconfig の名前とメールを入れる欄 (保存してある値が変わったら、作り直して読み直す) */
function GlobalAuthorForm({
  savedName,
  savedEmail,
  locked,
  onSave,
}: {
  savedName: string;
  savedEmail: string;
  /** git が見つからず、書き換えられない */
  locked: boolean;
  onSave: (name: string, email: string) => Promise<void>;
}) {
  const [name, setName] = useState(savedName);
  const [email, setEmail] = useState(savedEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== savedName || email.trim() !== savedEmail;

  const save = async () => {
    if (!name.trim()) return setError("名前を入力してください");
    if (!EMAIL_RE.test(email.trim())) return setError("メールアドレスを、メールアドレスの形で入力してください");
    setError(null);
    setBusy(true);
    try {
      await onSave(name.trim(), email.trim());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card global-form">
      <div className="form-row">
        <Field label="名前" hint="user.name">
          <TextInput value={name} onChange={setName} mono={false} placeholder="Taro Yamada" />
        </Field>
        <Field label="メールアドレス" hint="user.email">
          <TextInput value={email} onChange={setEmail} placeholder="taro@example.com" />
        </Field>
      </div>
      <div className="global-actions">
        <Button variant="primary" onClick={save} disabled={!changed || busy || locked}>
          {busy ? "保存しています…" : "保存"}
        </Button>
        {changed && !busy && (
          <Button
            variant="ghost"
            icon={Undo2}
            onClick={() => {
              setName(savedName);
              setEmail(savedEmail);
              setError(null);
            }}
          >
            元に戻す
          </Button>
        )}
        {!changed && !savedName && !savedEmail && !locked && <span className="faint">いまは設定されていません</span>}
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </div>
  );
}

function DefaultSection({ ov, onChanged }: { ov: GitOverview | null; onChanged: () => Promise<void> }) {
  const [notice, setNotice] = useState<string | null>(null);
  // git が見つからないときは、設定が「ない」のではなく「読めない」。書き換えもできない
  const noGit = !!ov && !ov.gitVersion;
  const savedName = ov?.globalName ?? "";
  const savedEmail = ov?.globalEmail ?? "";

  const save = async (name: string, email: string) => {
    setNotice(null);
    await call("git_set_global_identity", { name, email });
    await onChanged();
    setNotice("保存しました。作者を決めていないリポジトリで、これからのコミットに使われます");
  };

  return (
    <Section
      icon={Laptop}
      title="パソコン全体の既定の作者"
      desc="リポジトリで作者を決めていないときに、コミットに使われる名前とメールアドレスです (~/.gitconfig)。アカウントごとの作者は、下の「リポジトリごとのアカウント設定」で設定してください"
      actions={
        <>
          {ov?.gitVersion && <span className="git-sec-meta">git {ov.gitVersion}</span>}
          <IconButton icon={RefreshCw} label="読み直す" onClick={onChanged} />
        </>
      }
    >
      {!ov ? (
        <div className="card card-pad faint">読み込んでいます…</div>
      ) : (
        <>
          {noGit && <Notice kind="warn">git が見つからないため、いまの設定を読めません。git を入れると、ここで確認・変更できます</Notice>}
          <GlobalAuthorForm
            key={`${savedName}\n${savedEmail}`}
            savedName={savedName}
            savedEmail={savedEmail}
            locked={noGit}
            onSave={save}
          />
        </>
      )}
      {notice && <Notice kind="ok">{notice}</Notice>}
      <div className="global-effects">
        <div className="global-effect is-yes">
          <h4>
            <Check size={14} /> 保存すると変わるもの
          </h4>
          <ul>
            <li>
              作者を決めていないリポジトリで、<b>これからするコミットの作者</b> (
              <span className="mono">~/.gitconfig</span> の user.name・user.email)
            </li>
          </ul>
        </div>
        <div className="global-effect is-no">
          <h4>
            <Minus size={14} /> 変わらないもの
          </h4>
          <ul>
            <li>接続 (SSH の鍵・HTTPS のユーザー名)。リポジトリのリモートURLで決まります</li>
            <li>「リポジトリごとのアカウント設定」で作者を決めたリポジトリ</li>
            <li>これまでのコミット</li>
          </ul>
        </div>
      </div>
      <p className="global-tip">
        <TriangleAlert size={13} />
        作業のたびにここを書き換えるのはおすすめしません。戻し忘れると、別の名前でコミットしてしまいます
      </p>
    </Section>
  );
}

// ======================= 画面全体 =======================

export default function GitAccounts({ active }: ToolProps) {
  const accounts = useStore(gitAccountsStore);
  const helpOpen = useStore(helpOpenStore);
  const [ov, setOv] = useState<GitOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [editing, setEditing] = useState<GitAccount | null>(null);
  const [deleting, setDeleting] = useState<GitAccount | null>(null);
  /** 「ホストの鍵を登録」で開いている別名 */
  const [trusting, setTrusting] = useState<string | null>(null);
  /** アカウントの追加の画面から、新しい別名を作っている (then: 作った別名をそのアカウントで選ぶ) */
  const [newAlias, setNewAlias] = useState<{ then: (alias: string) => void } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOv(await call<GitOverview>("git_overview"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  const hosts = useMemo(() => ov?.sshHosts ?? [], [ov]);
  const helper = helperLabel(ov?.credentialHelper);
  const sshAccounts = accounts.filter((a) => !isHttps(a));

  // まだアカウントにしていない、Git のサービス向けの別名
  const candidates = hosts.filter(
    (h) => GIT_SERVICES.includes(realHost(h.alias, hosts)) && !accounts.some((a) => a.sshHost === h.alias),
  );

  // 「しくみ」に出す例 (できれば手元の ~/.ssh/config の別名を使う)
  const example = useMemo<Example>(() => {
    const usable = (h: SshHost | undefined): h is SshHost =>
      !!h?.hostName && !!h.identityFile && h.hostName.toLowerCase() !== h.alias.toLowerCase() && GIT_SERVICES.includes(h.hostName.toLowerCase());
    const h = accounts.map((a) => hosts.find((x) => x.alias === a.sshHost)).find(usable) ?? hosts.find(usable);
    const global =
      ov?.globalName || ov?.globalEmail
        ? { name: ov.globalName ?? "", email: ov.globalEmail ?? "", real: true }
        : { ...EXAMPLE_AUTHOR, real: false };
    if (!h?.hostName || !h.identityFile) {
      return {
        alias: "github-work",
        hostName: "github.com",
        key: "~/.ssh/id_ed25519_work",
        user: null,
        real: false,
        author: { ...EXAMPLE_AUTHOR, account: null },
        global,
      };
    }
    const t = tests[h.alias];
    // この別名を使うアカウントがあれば、それをリポジトリに設定したときの内容を見せる
    const owner = accounts.find((a) => !isHttps(a) && a.sshHost === h.alias);
    return {
      alias: h.alias,
      hostName: h.hostName,
      key: h.identityFile,
      user: t && t !== "busy" && t.ok ? t.user : null,
      real: true,
      author: owner ? { name: owner.name, email: owner.email, account: owner.label } : { ...EXAMPLE_AUTHOR, account: null },
      global,
    };
  }, [accounts, hosts, tests, ov]);

  const testHost = useCallback(async (host: string): Promise<SshTest> => {
    setTests((t) => ({ ...t, [host]: "busy" }));
    let r: SshTest;
    try {
      r = await call<SshTest>("git_ssh_test", { host });
    } catch (e) {
      r = { ok: false, user: null, message: errorMessage(e), reason: null };
    }
    setTests((t) => ({ ...t, [host]: r }));
    return r;
  }, []);

  // 作者の下書き: パソコン全体の既定 (なければ最初に登録したアカウント)。違う作者なら書き換えてもらう
  const draftAuthor =
    ov?.globalName || ov?.globalEmail
      ? { name: ov.globalName ?? "", email: ov.globalEmail ?? "" }
      : { name: accounts[0]?.name ?? "", email: accounts[0]?.email ?? "" };

  const newAccount = (sshHost?: string): GitAccount => ({
    id: "",
    label: sshHost ?? "",
    name: draftAuthor.name,
    email: draftAuthor.email,
    // まだどのアカウントにも使っていない別名を先に選ぶ
    sshHost: sshHost ?? candidates[0]?.alias ?? "github.com",
  });

  // まだアカウントにしていない別名の候補 (1つ登録しても、残りは出したままにする)
  const candidateChips = (
    <div className="recent-row">
      {candidates.map((h) => (
        <button key={h.alias} type="button" className="recent-chip" onClick={() => setEditing(newAccount(h.alias))}>
          <KeyRound size={13} />
          {h.alias}
          <span className="faint">→ {h.hostName}</span>
        </button>
      ))}
    </div>
  );

  const save = (a: GitAccount) => {
    if (a.id) gitAccountsStore.set((l) => l.map((x) => (x.id === a.id ? a : x)));
    else gitAccountsStore.set((l) => [...l, { ...a, id: crypto.randomUUID() }]);
    setEditing(null);
  };

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {ov?.gitError && <Notice kind="error">{ov.gitError}</Notice>}

      <HowItWorks open={helpOpen} example={example} />

      <DefaultSection ov={ov} onChanged={refresh} />

      <Section
        icon={Users}
        title={
          <>
            アカウント <span className="count">{accounts.length}</span>
          </>
        }
        desc="「コミットの作者」と「接続のしかた (SSH の別名か、HTTPS のユーザー名)」の組です。登録しただけでは、設定ファイルは変わりません"
        actions={
          <>
            {sshAccounts.length > 0 && (
              <Button icon={PlugZap} onClick={() => sshAccounts.forEach((a) => testHost(a.sshHost))}>
                すべて接続を確認
              </Button>
            )}
            <Button icon={Plus} variant="primary" onClick={() => setEditing(newAccount())}>
              アカウントを追加
            </Button>
          </>
        }
      >
        {accounts.length === 0 ? (
          <div className="acct-empty">
            <p>まだアカウントがありません。「アカウントを追加」から、作者と別名を組にして登録してください。</p>
            {candidates.length > 0 ? (
              <>
                <div className="opt-label">~/.ssh/config にある別名から作る</div>
                {candidateChips}
              </>
            ) : (
              ov && (
                <p className="faint">
                  ~/.ssh/config に GitHub などへの別名が見つかりませんでした。アカウントごとに鍵を使い分けるには、
                  「<ToolLink id="ssh-hosts">SSH接続</ToolLink>」か、「アカウントを追加」の「新しい別名」から別名を作ってください。
                </p>
              )
            )}
          </div>
        ) : (
          <>
            <div className="acct-grid">
              {accounts.map((a) => (
                <AccountCard
                  key={a.id}
                  account={a}
                  hosts={hosts}
                  helper={helper}
                  test={tests[a.sshHost]}
                  onTest={() => testHost(a.sshHost)}
                  onTrust={() => setTrusting(a.sshHost)}
                  onEdit={() => setEditing(a)}
                  onDelete={() => setDeleting(a)}
                />
              ))}
            </div>
            {candidates.length > 0 && (
              <div className="acct-suggest">
                <div className="opt-label">まだアカウントにしていない ~/.ssh/config の別名</div>
                {candidateChips}
              </div>
            )}
          </>
        )}
      </Section>

      <RepoSection
        accounts={accounts}
        hosts={hosts}
        globalName={ov?.globalName ?? null}
        globalEmail={ov?.globalEmail ?? null}
        active={active}
      />

      {editing && (
        <AccountForm
          initial={editing}
          others={accounts.filter((x) => x.id !== editing.id)}
          hosts={hosts}
          helper={helper}
          tests={tests}
          onTest={testHost}
          onTrust={setTrusting}
          onSave={save}
          onNewAlias={(then) => setNewAlias({ then })}
          onClose={() => setEditing(null)}
        />
      )}
      {/* アカウントの追加の画面の上に重ねて出す */}
      {newAlias && (
        <HostForm
          host={null}
          hosts={hosts}
          onSaved={async (alias) => {
            const { then } = newAlias;
            setNewAlias(null);
            await refresh();
            then(alias);
          }}
          onClose={() => setNewAlias(null)}
        />
      )}
      {/* 追加・編集のダイアログより後に置き、その上に重ねて出す */}
      {trusting && (
        <HostKeyDialog
          host={trusting}
          onClose={() => setTrusting(null)}
          onTrusted={() => {
            setTrusting(null);
            testHost(trusting);
          }}
        />
      )}
      {deleting && (
        <Modal
          title="アカウントを削除"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  gitAccountsStore.set((l) => l.filter((x) => x.id !== deleting.id));
                  setDeleting(null);
                }}
              >
                削除
              </Button>
            </>
          }
        >
          <p>
            「{deleting.label}」をこの一覧から削除します。~/.gitconfig・~/.ssh/config・鍵のファイルは変わりません。
          </p>
        </Modal>
      )}
    </>
  );
}
