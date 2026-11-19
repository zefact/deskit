/**
 * AWS CLI のプロファイルの確認・追加・編集・切り替え。
 *
 * - 一覧は ~/.aws/config と ~/.aws/credentials から作る (シークレットは画面に来ない)
 * - 「接続確認」で aws sts get-caller-identity を実行し、どのアカウント・ユーザーかを出す
 * - 「選択」したプロファイルは、ターミナル連携を設定すると新しいターミナルの AWS_PROFILE になる
 */

import { CircleX, LoaderCircle, Pencil, PlugZap, Plus, RefreshCw, Terminal, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { Field, Modal } from "../components/Modal";
import { Button, Card, CopyButton, IconButton, Notice, Select, TextInput } from "../components/ui";
import type { AwsIdentity, AwsOverview, AwsProfile, AwsSaveInput, NameLookup, NameStatus } from "../lib/accountTypes";
import { describePrincipal, formatAccountId } from "../lib/awsIdentity";
import { isMac } from "../platform";
import { call } from "../tauriApi";
import { errorMessage } from "./common";
import type { ToolProps } from "./registry";

const REGIONS: [string, string][] = [
  ["ap-northeast-1", "東京"],
  ["ap-northeast-3", "大阪"],
  ["ap-northeast-2", "ソウル"],
  ["ap-southeast-1", "シンガポール"],
  ["ap-southeast-2", "シドニー"],
  ["ap-south-1", "ムンバイ"],
  ["us-east-1", "バージニア北部"],
  ["us-east-2", "オハイオ"],
  ["us-west-1", "北カリフォルニア"],
  ["us-west-2", "オレゴン"],
  ["ca-central-1", "カナダ中部"],
  ["eu-west-1", "アイルランド"],
  ["eu-west-2", "ロンドン"],
  ["eu-central-1", "フランクフルト"],
  ["sa-east-1", "サンパウロ"],
];
const regionName = (r: string | null) => REGIONS.find(([id]) => id === r)?.[1];

const KIND_LABEL: Record<AwsProfile["kind"], string> = {
  keys: "アクセスキー",
  sso: "SSO",
  role: "ロール",
  process: "外部コマンド",
  none: "認証情報なし",
};

type IdState = AwsIdentity | { error: string } | "busy";

function exportCommand(name: string) {
  return isMac || !navigator.userAgent.includes("Windows")
    ? `export AWS_PROFILE=${name}`
    : `$env:AWS_PROFILE="${name}"`;
}

/** アカウントの名前の種類 (読むのに要る権限と、画面での説明) */
const NAME_KINDS = [
  {
    key: "accountName",
    label: "アカウント名",
    tip: "AWS コンソールや Organizations で付けたアカウントの名前",
    permission: "account:GetAccountInformation",
  },
  {
    key: "alias",
    label: "別名",
    tip: "IAM で付けたアカウントの別名 (アカウントエイリアス)",
    permission: "iam:ListAccountAliases",
  },
] as const;

/** 名前を読めなかった理由 (短い表示) */
const MISSING_SHORT: Record<Exclude<NameStatus, "found">, string> = {
  none: "未設定",
  denied: "権限なし",
  unsupported: "CLIが古い",
  error: "取得できず",
};

function missingReason(label: string, permission: string, r: NameLookup): string {
  switch (r.status) {
    case "none":
      return `${label}: このアカウントには付いていません`;
    case "denied":
      return `${label}: このキーには ${permission} の権限がないため読めません`;
    case "unsupported":
      return `${label}: AWS CLI が古いため読めません (新しくすると読めます)`;
    default:
      return `${label}: 読めませんでした${r.detail ? ` (${r.detail})` : ""}`;
  }
}

/** アカウント名・別名。読めたものだけ出し、どちらも読めなければ理由を出す */
function AccountNames({ id }: { id: AwsIdentity }) {
  const kinds = NAME_KINDS.map((k) => ({ ...k, r: id[k.key] }));
  const found = kinds.filter((k) => k.r.status === "found" && k.r.value);
  if (found.length > 0)
    return (
      <div className="aws-id-line">
        {found.map((k) => (
          <Fragment key={k.key}>
            <span className="aws-id-label" data-tip={k.tip}>
              {k.label}
            </span>
            <span className={k.key === "alias" ? "aws-alias" : "aws-acct-name"}>{k.r.value}</span>
          </Fragment>
        ))}
      </div>
    );
  return (
    <div className="aws-id-line aws-name-miss" title={kinds.map((k) => missingReason(k.label, k.permission, k.r)).join("\n")}>
      {kinds.map((k) => (
        <span key={k.key}>
          <span className="aws-id-label">{k.label}</span> {k.r.status === "found" ? "—" : MISSING_SHORT[k.r.status]}
        </span>
      ))}
    </div>
  );
}

function IdentityCell({ state }: { state: IdState | undefined }) {
  if (!state) return <span className="faint">—</span>;
  if (state === "busy")
    return (
      <span className="test-busy">
        <LoaderCircle size={13} className="spin" /> 確認中…
      </span>
    );
  if ("error" in state)
    return (
      <span className="test-ng" title={state.error}>
        <CircleX size={13} /> {state.error.replace(/^An error occurred \(([^)]+)\).*$/s, "$1")}
      </span>
    );
  const who = describePrincipal(state.arn);
  return (
    <div className="aws-id">
      <div className="aws-id-line">
        <span className="aws-id-label" data-tip="AWS アカウントの12桁の番号です (AWS コンソールの右上と同じ)">
          アカウントID
        </span>
        <span className="mono">{formatAccountId(state.account)}</span>
      </div>
      <AccountNames id={state} />
      <div className="aws-id-line aws-arn" title={state.arn}>
        {who.kind && <span className="aws-id-label">{who.kind}</span>}
        <span className="mono">{who.name}</span>
        {who.session && <span className="faint mono">({who.session})</span>}
      </div>
    </div>
  );
}

// ======================= 追加・編集 =======================

function ProfileForm({
  profile,
  existing,
  onSaved,
  onClose,
}: {
  profile: AwsProfile | null;
  existing: string[];
  onSaved: (ov: AwsOverview, name: string) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<AwsSaveInput>({
    original: profile?.name ?? null,
    name: profile?.name ?? "",
    region: profile?.region ?? "ap-northeast-1",
    output: profile?.output ?? "json",
    accessKeyId: "",
    secretAccessKey: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof AwsSaveInput) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const isNew = profile === null;

  const save = async () => {
    const name = f.name.trim();
    if (!/^[A-Za-z0-9_.@+-]+$/.test(name)) return setError("プロファイル名には英数字と - _ . @ + だけが使えます");
    if (name !== profile?.name && existing.includes(name)) return setError(`「${name}」というプロファイルはすでにあります`);
    if (isNew && (!f.accessKeyId.trim() || !f.secretAccessKey.trim()))
      return setError("アクセスキーIDとシークレットアクセスキーを入力してください");
    setSaving(true);
    try {
      const ov = await call<AwsOverview>("aws_save_profile", { input: { ...f, name } });
      onSaved(ov, name);
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={isNew ? "プロファイルを追加" : `「${profile.name}」を編集`}
      onClose={onClose}
      footer={
        <>
          <span className="dialog-foot-note">保存する前に、元のファイルをアプリのフォルダにバックアップします</span>
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            保存
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="プロファイル名" hint={profile?.name === "default" ? "default の名前は変えられません" : "--profile や AWS_PROFILE に指定する名前"}>
          <TextInput value={f.name} onChange={set("name")} placeholder="dev" />
        </Field>
        <div className="form-row">
          <Field label="リージョン">
            <input
              className="input mono"
              list="aws-regions"
              value={f.region}
              spellCheck={false}
              onChange={(e) => set("region")(e.target.value)}
              placeholder="ap-northeast-1"
            />
            <datalist id="aws-regions">
              {REGIONS.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </datalist>
          </Field>
          <Field label="出力形式">
            <Select
              value={f.output}
              onChange={set("output")}
              options={[
                { value: "", label: "(指定しない)" },
                { value: "json", label: "json" },
                { value: "yaml", label: "yaml" },
                { value: "text", label: "text" },
                { value: "table", label: "table" },
              ]}
            />
          </Field>
        </div>
        {!isNew && profile.kind !== "keys" && (
          <Notice>
            このプロファイルは {KIND_LABEL[profile.kind]} で認証しています。アクセスキーを入れると、キーで認証するようになります
          </Notice>
        )}
        <Field
          label="アクセスキーID"
          hint={!isNew && profile.accessKey ? `いまのキー: ${profile.accessKey}。変えないときは空欄のまま` : undefined}
        >
          <TextInput value={f.accessKeyId} onChange={set("accessKeyId")} placeholder={isNew ? "AKIA..." : "変えないときは空欄"} />
        </Field>
        <Field label="シークレットアクセスキー" hint={!isNew ? "変えないときは空欄のまま" : "画面には表示されず、~/.aws/credentials にだけ保存します"}>
          <input
            className="input mono"
            type="password"
            value={f.secretAccessKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => set("secretAccessKey")(e.target.value)}
            placeholder={isNew ? "" : "変えないときは空欄"}
          />
        </Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Modal>
  );
}

// ======================= 画面全体 =======================

export default function AwsProfiles({ active }: ToolProps) {
  const [ov, setOv] = useState<AwsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cli, setCli] = useState<{ version?: string; error?: string } | null>(null);
  const [ids, setIds] = useState<Record<string, IdState>>({});
  const [editing, setEditing] = useState<AwsProfile | "new" | null>(null);
  const [deleting, setDeleting] = useState<AwsProfile | null>(null);
  const [integration, setIntegration] = useState<"install" | "uninstall" | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error" | "info"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOv(await call<AwsOverview>("aws_overview"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    refresh();
  }, [active, refresh]);

  useEffect(() => {
    call<string>("aws_cli_version")
      .then((version) => setCli({ version }))
      .catch((e) => setCli({ error: errorMessage(e) }));
  }, []);

  const check = useCallback(async (name: string) => {
    setIds((m) => ({ ...m, [name]: "busy" }));
    try {
      const id = await call<AwsIdentity>("aws_identity", { profile: name });
      setIds((m) => ({ ...m, [name]: id }));
    } catch (e) {
      setIds((m) => ({ ...m, [name]: { error: errorMessage(e) } }));
    }
  }, []);

  const checkAll = async () => {
    // 同時に走らせすぎない (aws コマンドは1回ごとに重い)
    const names = ov?.profiles.map((p) => p.name) ?? [];
    const queue = [...names];
    const worker = async () => {
      while (queue.length) await check(queue.shift()!);
    };
    await Promise.all([worker(), worker()]);
  };

  const run = async (cmd: string, args?: Record<string, unknown>, done?: string) => {
    try {
      setOv(await call<AwsOverview>(cmd, args));
      if (done) setNotice({ kind: "ok", text: done });
      return true;
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e) });
      return false;
    }
  };

  const selected = ov?.selected ?? "default";
  const integ = ov?.integration;

  const select = async (name: string) => {
    const ok = await run("aws_select_profile", { name });
    if (!ok) return;
    setNotice({
      kind: "ok",
      text: integ?.installed
        ? `「${name}」を選びました。新しく開いたターミナルから使われます (いま開いているターミナルでは ${exportCommand(name)} を実行してください)`
        : `「${name}」を選びました。ターミナル連携を設定すると、新しく開いたターミナルで自動的に使われます`,
    });
  };

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}

      <div className="now-card">
        <div className="now-icon">
          <Terminal size={22} />
        </div>
        <div className="now-main">
          <div className="now-label">ターミナルで使うプロファイル</div>
          <div className="now-value aws-selected">{selected}</div>
        </div>
        <div className="aws-integ">
          {!integ ? null : !integ.supported ? (
            <span className="faint">このOSでは export のコピーで切り替えてください</span>
          ) : integ.installed ? (
            <>
              <span className="badge badge-ok">ターミナル連携: 設定済み</span>
              <span className="faint mono">{integ.rcPath}</span>
              <Button variant="ghost" onClick={() => setIntegration("uninstall")}>
                解除
              </Button>
            </>
          ) : (
            <>
              <span className="faint">新しく開いたターミナルに反映するには</span>
              <Button icon={Terminal} variant="primary" onClick={() => setIntegration("install")}>
                ターミナル連携を設定
              </Button>
            </>
          )}
        </div>
        <CopyButton value={exportCommand(selected)} label="export コマンドをコピー" />
      </div>

      {cli?.error && (
        <Notice kind="warn">
          AWS CLI が見つからないため、接続確認はできません ({cli.error})。プロファイルの編集と切り替えは使えます
        </Notice>
      )}
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}

      <Card
        title={
          <>
            プロファイル <span className="count-inline">{ov?.profiles.length ?? 0}</span>
            {cli?.version && <span className="faint aws-cli">{cli.version}</span>}
          </>
        }
        className="aws-card"
        actions={
          <>
            <IconButton icon={RefreshCw} label="読み直す" onClick={refresh} />
            <Button icon={PlugZap} onClick={checkAll} disabled={!ov?.profiles.length || !!cli?.error}>
              すべて接続確認
            </Button>
            <Button icon={Plus} variant="primary" onClick={() => setEditing("new")}>
              追加
            </Button>
          </>
        }
      >
        {ov && ov.profiles.length === 0 && (
          <div className="card-empty">プロファイルがありません。「追加」から作れます。</div>
        )}
        {ov && ov.profiles.length > 0 && (
          <div className="aws-table">
            <div className="aws-row aws-row-head">
              <span>プロファイル</span>
              <span>リージョン</span>
              <span>認証</span>
              <span>AWSアカウント (接続確認で表示)</span>
              <span />
            </div>
            {ov.profiles.map((p) => {
              const isSel = p.name === selected;
              return (
                <div
                  className={`aws-row ${isSel ? "is-selected" : "is-pickable"}`}
                  key={p.name}
                  onClick={(e) => {
                    // 行のどこを押しても選べる。ボタン類と、文字をなぞって選んだときは除く
                    if (isSel) return;
                    if ((e.target as HTMLElement).closest("button, a, input, select, textarea")) return;
                    if (window.getSelection()?.isCollapsed === false) return;
                    select(p.name);
                  }}
                >
                  <div className="aws-name">
                    <button
                      type="button"
                      className={`radio ${isSel ? "is-on" : ""}`}
                      aria-label={`${p.name} を選ぶ`}
                      onClick={() => !isSel && select(p.name)}
                    />
                    <div>
                      <div className="aws-name-text">
                        {p.name}
                        {isSel && <span className="badge badge-ok">選択中</span>}
                      </div>
                      {p.output && <div className="faint aws-sub">出力: {p.output}</div>}
                    </div>
                  </div>
                  <div>
                    {p.region ? (
                      <>
                        <div className="mono">{p.region}</div>
                        {regionName(p.region) && <div className="faint aws-sub">{regionName(p.region)}</div>}
                      </>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </div>
                  <div>
                    {p.kind === "keys" ? (
                      <>
                        <div className="mono">{p.accessKey}</div>
                        <div className="faint aws-sub">
                          {p.hasSecret ? "シークレットあり" : "シークレットなし"}
                          {p.hasSessionToken && " · 一時トークン"}
                        </div>
                      </>
                    ) : (
                      <span className="badge">{KIND_LABEL[p.kind]}</span>
                    )}
                  </div>
                  <IdentityCell state={ids[p.name]} />
                  <div className="aws-actions">
                    <IconButton
                      icon={PlugZap}
                      label="接続確認"
                      onClick={() => check(p.name)}
                      disabled={ids[p.name] === "busy" || !!cli?.error}
                    />
                    <CopyButton value={exportCommand(p.name)} label="export コマンドをコピー" />
                    <IconButton icon={Pencil} label="編集" onClick={() => setEditing(p)} />
                    <IconButton icon={Trash2} label="削除" onClick={() => setDeleting(p)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {ov && (
        <div className="aws-files faint">
          <span className="mono">{ov.configPath}</span>
          <span className="mono">{ov.credentialsPath}</span>
          <span>書き換える前に、アプリのフォルダへバックアップを取ります</span>
        </div>
      )}

      {editing && (
        <ProfileForm
          profile={editing === "new" ? null : editing}
          existing={ov?.profiles.map((p) => p.name) ?? []}
          onClose={() => setEditing(null)}
          onSaved={(next, name) => {
            setOv(next);
            setEditing(null);
            setIds((m) => {
              const rest = { ...m };
              delete rest[name];
              return rest;
            });
            setNotice({ kind: "ok", text: `「${name}」を保存しました` });
          }}
        />
      )}

      {deleting && (
        <Modal
          title="プロファイルを削除"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDeleting(null)}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const name = deleting.name;
                  setDeleting(null);
                  await run("aws_delete_profile", { name }, `「${name}」を削除しました`);
                }}
              >
                削除
              </Button>
            </>
          }
        >
          <p>
            「{deleting.name}」を ~/.aws/config と ~/.aws/credentials から取り除きます。
            消す前のファイルはアプリのフォルダにバックアップします。
          </p>
        </Modal>
      )}

      {integration && integ && (
        <Modal
          title={integration === "install" ? "ターミナル連携を設定" : "ターミナル連携を解除"}
          wide
          onClose={() => setIntegration(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setIntegration(null)}>
                キャンセル
              </Button>
              <Button
                variant="primary"
                onClick={async () => {
                  const mode = integration;
                  setIntegration(null);
                  await run(
                    mode === "install" ? "aws_install_integration" : "aws_uninstall_integration",
                    undefined,
                    mode === "install"
                      ? `${integ.rcPath} に追加しました。新しく開いたターミナルから、選んだプロファイルが使われます`
                      : `${integ.rcPath} から取り除きました`,
                  );
                }}
              >
                {integration === "install" ? "追加する" : "取り除く"}
              </Button>
            </>
          }
        >
          {integration === "install" ? (
            <>
              <p>
                <span className="mono">{integ.rcPath}</span> の最後に次の数行を足します。
                Deskit で選んだプロファイル名を <span className="mono">~/.aws/deskit_profile</span> に書いておき、
                ターミナルを開いたときにそれを <span className="mono">AWS_PROFILE</span> にします。
              </p>
              <pre className="snippet">{integ.snippet}</pre>
              <p className="faint">変更前のファイルはアプリのフォルダにバックアップします。いつでも「解除」で取り除けます。</p>
            </>
          ) : (
            <p>
              <span className="mono">{integ.rcPath}</span> から Deskit が足した数行を取り除きます。
              選んでいたプロファイルは、新しいターミナルでは使われなくなります。
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
