/**
 * 起動したときに新しいバージョンを確かめ、あればウィンドウの右下に知らせる。
 * 「更新して再起動」で、ダウンロード → 入れ替え → 再起動まで行う
 */

import { CircleArrowDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { releaseNotesUrl } from "../links";
import { openExternal } from "../tauriApi";
import { type AvailableUpdate, checkForUpdate } from "../updater";
import { Button } from "./ui";

export function UpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [installing, setInstalling] = useState(false);
  const [percent, setPercent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 起動したときの確認は、つながらなくても何も出さない (オフラインのときなど)
    checkForUpdate()
      .then(setUpdate)
      .catch(() => {});
  }, []);

  if (!update || dismissed) return null;

  const install = async () => {
    setInstalling(true);
    setError(null);
    setPercent(null);
    try {
      await update.install(setPercent);
    } catch (e) {
      setInstalling(false);
      setError(`更新できませんでした: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="update-toast" role="status">
      <CircleArrowDown size={20} className="update-toast-icon" />
      <div className="update-toast-body">
        <div className="update-toast-title">
          新しいバージョン <span className="mono">v{update.version}</span> があります
        </div>
        {installing ? (
          <>
            <div className="update-toast-desc">
              ダウンロードしています{percent === null ? "…" : ` ${percent}%`}。終わると自動で再起動します
            </div>
            <div className="update-progress">
              <span style={{ width: `${percent ?? 0}%` }} />
            </div>
          </>
        ) : (
          <>
            <div className={`update-toast-desc ${error ? "is-error" : ""}`}>
              {error ?? "更新すると再起動します。入力中の内容は消えるので、先にコピーしておいてください"}
            </div>
            <div className="update-toast-actions">
              <Button variant="primary" onClick={install}>
                更新して再起動
              </Button>
              <Button variant="ghost" onClick={() => openExternal(releaseNotesUrl(update.version)).catch(() => {})}>
                変更点を見る
              </Button>
            </div>
          </>
        )}
      </div>
      {!installing && (
        <button type="button" className="icon-btn update-toast-close" aria-label="後で" data-tip="後で" onClick={() => setDismissed(true)}>
          <X size={14} />
        </button>
      )}
    </div>
  );
}
