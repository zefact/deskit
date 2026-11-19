/**
 * ~/.ssh/config の接続先 (Host) の一覧と、追加・編集・削除。
 *
 * Gitアカウントとは別に、別名ごとの接続先・ユーザー・鍵を直す。
 * Gitアカウントで使っている別名には、そのアカウントの名前を出す
 */

import { KeyRound, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, IconButton, Notice } from "../components/ui";
import type { SshHost, SshOverview } from "../lib/accountTypes";
import { serviceName } from "../lib/gitRemote";
import { openTool } from "../nav";
import { useStore } from "../store";
import { call } from "../tauriApi";
import { errorMessage } from "./common";
import { accountsUsing, gitAccountsStore } from "./gitAccountsStore";
import type { ToolProps } from "./registry";
import { basename, HostDeleteDialog, HostForm, isGitHost } from "./sshShared";

/** user@host:port の形 (書いていないところは省く) */
function target(h: SshHost): string {
  return `${h.user ? `${h.user}@` : ""}${h.hostName ?? h.alias}${h.port ? `:${h.port}` : ""}`;
}

export default function SshHosts({ active }: ToolProps) {
  const accounts = useStore(gitAccountsStore);
  const [ov, setOv] = useState<SshOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<SshHost | "new" | null>(null);
  const [deleting, setDeleting] = useState<SshHost | null>(null);

  const refresh = useCallback(async () => {
    try {
      setOv(await call<SshOverview>("ssh_overview"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  const hosts = ov?.hosts ?? [];
  const readOnly = hosts.some((h) => !h.editable);

  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}

      <Card
        title={
          <>
            接続先 <span className="count-inline">{hosts.length}</span>
          </>
        }
        className="ssh-card"
        actions={
          <>
            <IconButton icon={RefreshCw} label="読み直す" onClick={refresh} />
            <Button icon={Plus} variant="primary" onClick={() => setEditing("new")}>
              追加
            </Button>
          </>
        }
      >
        {ov && hosts.length === 0 && (
          <div className="card-empty">~/.ssh/config に接続先 (Host) がありません。「追加」から作れます。</div>
        )}
        {hosts.length > 0 && (
          <div className="ssh-table">
            <div className="ssh-row ssh-row-head">
              <span>別名 (Host)</span>
              <span>接続先</span>
              <span>鍵</span>
              <span>使っている Gitアカウント</span>
              <span />
            </div>
            {hosts.map((h) => {
              const users = accountsUsing(accounts, h.alias);
              const only = (h.identitiesOnly ?? "").toLowerCase() === "yes";
              return (
                <div className="ssh-row" key={h.alias}>
                  <div className="ssh-name">
                    <div className="ssh-name-text">
                      {h.alias}
                      {!h.editable && (
                        <span
                          className="badge"
                          data-tip="Include で読み込んだファイルにあるか、ほかの名前と並べて書かれているため、ここでは書き換えられません"
                        >
                          読むだけ
                        </span>
                      )}
                    </div>
                    <div className="faint ssh-sub">{isGitHost(h) ? serviceName(h.hostName ?? h.alias) : "サーバー"}</div>
                  </div>
                  <div className="mono ssh-target">{target(h)}</div>
                  <div className="ssh-key">
                    {h.identityFile ? (
                      <>
                        <div className="mono">
                          <KeyRound size={12} /> {basename(h.identityFile)}
                        </div>
                        {only && <div className="faint ssh-sub">この鍵だけを使う</div>}
                      </>
                    ) : (
                      <span className="faint">指定なし (既定の鍵)</span>
                    )}
                  </div>
                  <div className="ssh-users">
                    {users.length > 0 ? (
                      users.map((a) => (
                        <span key={a.id} className="badge badge-ok">
                          {a.label}
                        </span>
                      ))
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </div>
                  <div className="ssh-actions">
                    {h.editable && (
                      <>
                        <IconButton icon={Pencil} label="編集" onClick={() => setEditing(h)} />
                        <IconButton icon={Trash2} label="削除" onClick={() => setDeleting(h)} />
                      </>
                    )}
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
          <span>書き換える前に、アプリのフォルダへバックアップを取ります。ほかの行やコメントはそのまま残します</span>
          {readOnly && <span>「読むだけ」の接続先は、元のファイルを直接書き換えてください</span>}
        </div>
      )}
      <p className="ssh-git-link faint">
        別名とコミットの作者を組にして、リポジトリごとに切り替えるには{" "}
        <button type="button" className="text-link" onClick={() => openTool("git-accounts")}>
          Gitアカウント
        </button>{" "}
        を使ってください。
      </p>

      {editing && (
        <HostForm
          host={editing === "new" ? null : editing}
          hosts={hosts}
          onSaved={async (alias) => {
            setEditing(null);
            await refresh();
            setNotice(`「${alias}」を保存しました`);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {deleting && (
        <HostDeleteDialog
          host={deleting}
          usedBy={accountsUsing(accounts, deleting.alias).map((a) => a.label)}
          onDeleted={async () => {
            const alias = deleting.alias;
            setDeleting(null);
            await refresh();
            setNotice(`「${alias}」を削除しました`);
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}
