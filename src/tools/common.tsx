/** ツール画面どうしで使い回す小物 */

import { CircleAlert, CircleCheck, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { IconButton } from "../components/ui";

export function SampleButton({ onClick }: { onClick: () => void }) {
  return <IconButton icon={Sparkles} label="サンプルを入れる" onClick={onClick} />;
}

/** 枠の下に出す1行 (エラー・成功・情報) */
export function PaneFoot({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: ReactNode }) {
  return (
    <div className={`pane-foot ${kind === "error" ? "is-error" : kind === "ok" ? "is-ok" : ""}`}>
      {kind === "error" && <CircleAlert size={13} />}
      {kind === "ok" && <CircleCheck size={13} />}
      <span className="pane-foot-text">{children}</span>
    </div>
  );
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 1,234 のように区切って表示する */
export const fmtNum = (n: number) => n.toLocaleString("ja-JP");

/** バイト数を読みやすく (1.2 KB など) */
export function fmtBytes(n: number): string {
  if (n < 1024) return `${fmtNum(n)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 2 : 1)} ${units[i]}`;
}
