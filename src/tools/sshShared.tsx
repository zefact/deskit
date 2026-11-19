/**
 * ~/.ssh/config の接続先 (Host) の追加・編集・削除のダイアログ。
 * 「SSH接続」で使うほか、Gitアカウントの追加の画面からも新しい別名を作れるようにしている
 */

import { FolderOpen, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Field, Modal } from "../components/Modal";
import { Button, CopyButton, Notice, Select, Switch, TextInput } from "../components/ui";
import type { HostInput, SshHost, SshKey } from "../lib/accountTypes";
import { serviceName } from "../lib/gitRemote";
import { privateKeyPath, toConfigPath } from "../lib/sshPath";
import { call, homePath, pickFile } from "../tauriApi";
import { errorMessage } from "./common";

/** Git のホスティングサービス (SSH の接続先の候補) */
export const GIT_SERVICES = ["github.com", "gitlab.com", "bitbucket.org", "ssh.dev.azure.com"];

export const basename = (p: string) => p.split(/[\\/]/).pop() ?? p;

/** Git のサービスに向いた接続先か */
export const isGitHost = (h: SshHost) => GIT_SERVICES.includes((h.hostName ?? h.alias).toLowerCase());

const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SSH_HOST_RE = /^[A-Za-z0-9][A-Za-z0-9.:-]*$/;

/** 画面の Host を、書き込む形にする (新しく作るときの初期値つき) */
function toHostInput(h: SshHost | null): HostInput {
  if (!h) return { alias: "", hostName: "github.com", user: "git", port: null, identityFile: null, identitiesOnly: true };
  return {
    alias: h.alias,
    hostName: h.hostName ?? h.alias,
    user: h.user,
    port: h.port,
    identityFile: h.identityFile,
    identitiesOnly: (h.identitiesOnly ?? "").toLowerCase() === "yes",
  };
}

/** 一覧の鍵のうち、設定に書いてあるパスと同じもの (~ の書き方の違いは同じとみなす) */
function keyOfPath(keys: SshKey[], path: string | null): SshKey | undefined {
  if (!path) return undefined;
  const p = path.replace(/^"|"$/g, "");
  return keys.find((k) => k.path === p || p.endsWith(`/.ssh/${basename(k.path)}`));
}

/** 接続先の追加・編集 */
export function HostForm({
  host,
  hosts,
  onSaved,
  onClose,
}: {
  /** 編集する Host (新しく作るときは null) */
  host: SshHost | null;
  hosts: SshHost[];
  onSaved: (alias: string) => void;
  onClose: () => void;
}) {
  const isNew = !host;
  const [h, setH] = useState<HostInput>(() => toHostInput(host));
  const [keys, setKeys] = useState<SshKey[] | null>(null);
  // 鍵の選び方: 一覧から / パスを入力 / 指定しない
  const [keyMode, setKeyMode] = useState<"list" | "custom" | "none">(host?.identityFile ? "custom" : "none");
  const [customHost, setCustomHost] = useState(!GIT_SERVICES.includes(h.hostName.toLowerCase()));
  const [pickedPub, setPickedPub] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof HostInput>(k: K, v: HostInput[K]) => setH((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    call<SshKey[]>("ssh_list_keys")
      .then((list) => {
        setKeys(list);
        if (host?.identityFile) {
          if (keyOfPath(list, host.identityFile)) setKeyMode("list");
          return;
        }
        // 新しく作るときは、まだどの接続先にも使っていない鍵を選んでおく
        const used = new Set(hosts.map((x) => keyOfPath(list, x.identityFile)?.path).filter(Boolean));
        const free = isNew ? list.find((k) => !used.has(k.path)) : undefined;
        if (free) {
          setKeyMode("list");
          setH((x) => ({ ...x, identityFile: free.path }));
        }
      })
      .catch(() => setKeys([]));
    // 開いたときに1回だけ読む (保存中に一覧が読み直されても、選んだ鍵を変えない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedKey = keys ? keyOfPath(keys, h.identityFile) : undefined;
  const keyValue = keyMode === "none" ? "" : keyMode === "custom" ? "__custom__" : (selectedKey?.path ?? "");
  const alias = h.alias.trim();
  const gitService = !customHost && GIT_SERVICES.includes(h.hostName.toLowerCase());
  const keygen = `ssh-keygen -t ed25519 -C "メールアドレス" -f ~/.ssh/id_ed25519_${alias || "work"}`;

  const lines = [
    `Host ${alias || "別名"}`,
    `  HostName ${h.hostName.trim()}`,
    h.user?.trim() && `  User ${h.user.trim()}`,
    h.port?.trim() && `  Port ${h.port.trim()}`,
    keyMode !== "none" && h.identityFile?.trim() && `  IdentityFile ${h.identityFile.trim()}`,
    h.identitiesOnly && "  IdentitiesOnly yes",
  ].filter(Boolean);

  // 接続先を Git のサービスとサーバーで切り替えたら、ユーザーの初期値も合わせる
  const pickService = (v: string) => {
    setCustomHost(v === "");
    setH((x) => {
      const user = (x.user ?? "").trim();
      if (v !== "" && !user) return { ...x, hostName: v, user: "git" };
      if (v === "" && user === "git") return { ...x, hostName: "", user: "" };
      return { ...x, hostName: v };
    });
  };

  // ~/.ssh を開いた状態で、鍵のファイルを選んでもらう
  const browse = async () => {
    try {
      const picked = await pickFile({ dir: "~/.ssh", title: "鍵ファイル (秘密鍵) を選ぶ" });
      if (!picked) return;
      const { path, wasPublic } = privateKeyPath(toConfigPath(picked, await homePath()));
      setPickedPub(wasPublic);
      set("identityFile", path);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const save = async () => {
    if (!ALIAS_RE.test(alias)) return setError("別名は、英数字・ . ・ _ ・ - で入力してください (例: github-work)");
    if (isNew && hosts.some((x) => x.alias === alias)) return setError(`「${alias}」という別名は、もうあります`);
    if (!SSH_HOST_RE.test(h.hostName.trim())) return setError("接続先を github.com や 192.168.0.10 のような形で入力してください");
    if (h.port?.trim() && !(Number(h.port) >= 1 && Number(h.port) <= 65535)) return setError("ポートは 1〜65535 の数で入力してください");
    if (keyMode !== "none" && !h.identityFile?.trim()) return setError("鍵ファイルを選ぶか、「指定しない」にしてください");
    setError(null);
    setBusy(true);
    try {
      const input: HostInput = {
        ...h,
        alias,
        hostName: h.hostName.trim(),
        identityFile: keyMode === "none" ? null : (h.identityFile?.trim() ?? null),
      };
      await call("ssh_save_host", { input, isNew });
      onSaved(alias);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? "SSH の接続先を追加" : `接続先「${host.alias}」を編集`}
      onClose={onClose}
      footer={
        <>
          <span className="dialog-foot-note">書き換える前に、~/.ssh/config のバックアップを取ります</span>
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy ? "保存しています…" : "保存"}
          </Button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          label="別名 (Host)"
          hint={
            isNew
              ? "ssh 別名 で接続するときや、リモートURL (git@別名:org/repo.git) に入れる名前です"
              : "別名を変えると、この別名で接続していたところ (リモートURLなど) がつながらなくなるため、ここでは変えられません"
          }
        >
          {isNew ? (
            <TextInput value={h.alias} onChange={(v) => set("alias", v)} placeholder="github-work" autoFocus />
          ) : (
            <div className="input mono alias-fixed">{host.alias}</div>
          )}
        </Field>
        <div className="form-row">
          <Field label="接続先 (HostName)">
            <Select
              value={customHost ? "" : h.hostName.toLowerCase()}
              onChange={pickService}
              options={[
                ...GIT_SERVICES.map((x) => ({ value: x, label: `${x} (${serviceName(x)})` })),
                { value: "", label: "その他 (サーバーなど)" },
              ]}
            />
          </Field>
          {customHost ? (
            <Field label="接続先のホスト名か IP アドレス">
              <TextInput value={h.hostName} onChange={(v) => set("hostName", v)} placeholder="ssh.example.com" />
            </Field>
          ) : (
            <div />
          )}
        </div>
        <Field
          label="鍵ファイル (IdentityFile)"
          hint="接続に使う秘密鍵です。一覧には、~/.ssh にある鍵のうち公開鍵 (.pub) と組になっているものを出します。その .pub を GitHub やサーバーに登録しておきます"
        >
          <Select
            value={keyValue}
            onChange={(v) => {
              setPickedPub(false);
              if (v === "") {
                setKeyMode("none");
              } else if (v === "__custom__") {
                setKeyMode("custom");
              } else {
                setKeyMode("list");
                set("identityFile", v);
              }
            }}
            options={[
              ...(keys ?? []).map((k) => ({
                value: k.path,
                label: `${basename(k.path)}  (${k.keyType}${k.comment ? ` · ${k.comment}` : ""})`,
              })),
              { value: "__custom__", label: "その他 (ファイルを選ぶか、パスを入力)" },
              { value: "", label: "指定しない (ssh の既定の鍵を使う)" },
            ]}
          />
        </Field>
        {keyMode === "custom" && (
          <div className="key-path">
            <div className="key-path-row">
              <TextInput
                value={h.identityFile ?? ""}
                onChange={(v) => {
                  setPickedPub(false);
                  set("identityFile", v);
                }}
                placeholder="~/.ssh/id_ed25519_work"
              />
              <Button icon={FolderOpen} onClick={browse}>
                ファイルを選ぶ
              </Button>
            </div>
            {pickedPub && (
              <p className="field-hint">公開鍵 (.pub) が選ばれたため、組になっている秘密鍵 (.pub の付かないファイル) にしました</p>
            )}
          </div>
        )}
        {keyMode === "none" && gitService && (
          <p className="form-twin">
            <TriangleAlert size={13} />
            鍵を指定しないと、ほかのアカウントと同じ鍵で接続することになり、使い分けられません
          </p>
        )}
        {keys && (keys.length === 0 || keyMode === "custom") && (
          <div className="form-tip is-info">
            <p>
              {keys.length === 0 ? "~/.ssh に鍵が見つかりませんでした。" : ""}
              新しい鍵は、ターミナルで次のコマンドを実行すると作れます。できた公開鍵 (.pub) を GitHub やサーバーに登録してください。
            </p>
            <div className="form-tip-snippet">
              <pre className="snippet">{keygen}</pre>
              <CopyButton value={keygen} />
            </div>
          </div>
        )}
        <div className="form-row">
          <Field label="ユーザー (User)" hint="GitHub・GitLab・Bitbucket は git。サーバーはログインするユーザー名">
            <TextInput value={h.user ?? ""} onChange={(v) => set("user", v)} placeholder={gitService ? "git" : "ec2-user"} />
          </Field>
          <Field label="ポート (Port)" hint="空のときは 22">
            <TextInput value={h.port ?? ""} onChange={(v) => set("port", v)} placeholder="22" />
          </Field>
        </div>
        <div className="alias-only">
          <Switch checked={h.identitiesOnly} onChange={(v) => set("identitiesOnly", v)} label="この鍵だけを使う (IdentitiesOnly yes)" />
          <span className="field-hint">ssh-agent にあるほかの鍵で先に認証され、別のアカウントになるのを防ぎます</span>
        </div>
        <div className="alias-preview">
          <span className="hostkey-label">{isNew ? "~/.ssh/config に足す内容" : "書き換えたあとの内容 (ほかの行はそのまま残します)"}</span>
          <pre className="snippet">{lines.join("\n")}</pre>
        </div>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
    </Modal>
  );
}

/** 接続先の削除の確認 */
export function HostDeleteDialog({
  host,
  usedBy,
  onDeleted,
  onClose,
}: {
  host: SshHost;
  /** この別名を使っている Gitアカウントの表示名 */
  usedBy: string[];
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    setBusy(true);
    try {
      await call("ssh_delete_host", { alias: host.alias });
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      title="接続先を削除"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button variant="primary" onClick={remove} disabled={busy}>
            削除
          </Button>
        </>
      }
    >
      <p>
        ~/.ssh/config から「<span className="mono">Host {host.alias}</span>」の節を消します。消す前にバックアップを取ります。鍵のファイルは消しません。
      </p>
      {usedBy.length > 0 ? (
        <Notice kind="warn">
          Gitアカウント「{usedBy.join("」「")}」がこの別名を使っています。消すと、この別名をリモートURLに入れたリポジトリは接続できなくなります。
        </Notice>
      ) : (
        isGitHost(host) && <p className="faint">この別名をリモートURLに入れたリポジトリがあると、接続できなくなります。</p>
      )}
      {error && <Notice kind="error">{error}</Notice>}
    </Modal>
  );
}
