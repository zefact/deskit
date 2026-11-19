/** 設定とアプリの情報 */

import { getVersion } from "@tauri-apps/api/app";
import { ExternalLink, Monitor, Moon, RefreshCw, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SITE_URL } from "../links";
import { inTauri } from "../platform";
import { openExternal } from "../tauriApi";
import { editorFontSizeStore, useStore } from "../store";
import { type ColorMode, colorModeStore } from "../theme";
import { TOOLS } from "../tools/registry";
import { type AvailableUpdate, checkForUpdate } from "../updater";
import { Logo } from "./Logo";
import { Button, Segmented } from "./ui";

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const mode = useStore(colorModeStore);
  const fontSize = useStore(editorFontSizeStore);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (inTauri) getVersion().then(setVersion).catch(() => {});
    else setVersion("dev");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-label="設定">
        <header className="dialog-head">
          <h2>設定</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="閉じる">
            <X size={16} />
          </button>
        </header>

        <div className="setting-row">
          <div>
            <div className="setting-title">テーマ</div>
            <div className="setting-desc">「システム」はOSの外観に合わせて切り替わります</div>
          </div>
          <Segmented<ColorMode>
            value={mode}
            onChange={(v) => colorModeStore.set(v)}
            options={[
              { value: "system", label: <><Monitor size={13} /> システム</> },
              { value: "light", label: <><Sun size={13} /> ライト</> },
              { value: "dark", label: <><Moon size={13} /> ダーク</> },
            ]}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-title">エディタの文字サイズ</div>
            <div className="setting-desc">入力欄・出力欄の文字の大きさ</div>
          </div>
          <Segmented
            value={String(fontSize)}
            onChange={(v) => editorFontSizeStore.set(Number(v))}
            options={["12", "13", "14", "16"].map((v) => ({ value: v, label: `${v}px` }))}
          />
        </div>

        <UpdateRow />

        <div className="setting-row">
          <div>
            <div className="setting-title">公式サイト</div>
            <div className="setting-desc">
              使い方・ダウンロード・更新情報 <span className="mono setting-url">{SITE_URL.replace(/^https:\/\//, "").replace(/\/$/, "")}</span>
            </div>
          </div>
          <Button icon={ExternalLink} onClick={() => openExternal(SITE_URL).catch(() => {})}>
            開く
          </Button>
        </div>

        <div className="about">
          <Logo size={44} />
          <div>
            <div className="about-name">
              Deskit <span className="about-ver">{version === "dev" ? "開発版" : version && `v${version}`}</span>
            </div>
            <div className="about-desc">
              開発者向けの小さなツール集 ({TOOLS.length}ツール)。入力した内容が外部へ送られることはありません。
            </div>
            <div className="about-copy">© 2026 ZEFACT Co., Ltd.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

type UpdateState = "idle" | "checking" | "latest" | "available" | "installing";

/** アップデートの確認と、入れ替え */
function UpdateRow() {
  const [state, setState] = useState<UpdateState>("idle");
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const update = useRef<AvailableUpdate | null>(null);

  const runCheck = async () => {
    setState("checking");
    setError(null);
    try {
      update.current = await checkForUpdate();
      setState(update.current ? "available" : "latest");
    } catch (e) {
      setState("idle");
      setError(`確かめられませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const install = async () => {
    if (!update.current) return;
    setState("installing");
    setError(null);
    setPercent(null);
    try {
      await update.current.install(setPercent);
    } catch (e) {
      setState("available");
      setError(`更新できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // 結果は説明の下に出す (右に出すとボタンの位置が動くため)
  const result = error ? (
    <div className="update-result is-error">{error}</div>
  ) : state === "latest" ? (
    <div className="update-result is-ok">お使いのバージョンは最新です</div>
  ) : state === "available" ? (
    <div className="update-result">新しいバージョン v{update.current?.version} があります。更新すると再起動します</div>
  ) : state === "installing" ? (
    <div className="update-result">
      ダウンロードしています{percent === null ? "…" : ` ${percent}%`}。終わると自動で再起動します
    </div>
  ) : null;

  return (
    <div className="setting-row">
      <div>
        <div className="setting-title">アップデート</div>
        <div className="setting-desc">新しいバージョンが公開されているか確かめます。起動したときにも確かめています</div>
        {result}
      </div>
      {state === "available" || state === "installing" ? (
        <Button variant="primary" onClick={install} disabled={state === "installing"}>
          {state === "installing" ? "更新しています…" : "更新して再起動"}
        </Button>
      ) : (
        <Button icon={RefreshCw} onClick={runCheck} disabled={state === "checking"}>
          {state === "checking" ? "確かめています…" : "確かめる"}
        </Button>
      )}
    </div>
  );
}
