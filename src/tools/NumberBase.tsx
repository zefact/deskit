import { useMemo, useState } from "react";
import { Card, CopyButton, OptBar, Switch } from "../components/ui";
import { type Base, bitLength, formatInBase, parseInBase } from "../lib/numberBase";
import { errorMessage, fmtNum } from "./common";

const ROWS: { base: Base; label: string; short: string }[] = [
  { base: 10, label: "10進数", short: "DEC" },
  { base: 16, label: "16進数", short: "HEX" },
  { base: 8, label: "8進数", short: "OCT" },
  { base: 2, label: "2進数", short: "BIN" },
];

export default function NumberBase() {
  // 最後に編集した欄とその文字。ほかの欄はここから計算する
  const [source, setSource] = useState<{ base: Base; text: string }>({ base: 10, text: "255" });
  const [group, setGroup] = useState(true);
  const [upper, setUpper] = useState(true);

  const parsed = useMemo(() => {
    if (source.text.trim() === "") return { value: null as bigint | null };
    try {
      return { value: parseInBase(source.text, source.base) };
    } catch (e) {
      return { value: null, error: errorMessage(e) };
    }
  }, [source]);

  const bits = parsed.value !== null ? bitLength(parsed.value) : 0;

  return (
    <>
      <OptBar>
        <Switch checked={group} onChange={setGroup} label="桁を区切る" />
        <Switch checked={upper} onChange={setUpper} label="16進を大文字" />
        <div className="optbar-spacer" />
        {parsed.value !== null && (
          <span className="faint">
            {fmtNum(bits)} ビット · {fmtNum(Math.max(1, Math.ceil(bits / 8)))} バイト
          </span>
        )}
      </OptBar>
      <Card className="base-card">
        {ROWS.map((r) => {
          const editing = source.base === r.base;
          const text = editing
            ? source.text
            : parsed.value !== null
              ? formatInBase(parsed.value, r.base, { group, upper })
              : "";
          return (
            <div className={`base-row ${editing && parsed.error ? "is-error" : ""}`} key={r.base}>
              <div className="base-label">
                <span className="base-short">{r.short}</span>
                <span>{r.label}</span>
              </div>
              <input
                className="input mono base-input"
                value={text}
                spellCheck={false}
                placeholder={editing ? "数値を入力" : ""}
                onChange={(e) => setSource({ base: r.base, text: e.target.value })}
                onFocus={() => {
                  // 編集を始めた欄を基準にする (区切りの空白は付いたままでも読める)
                  if (!editing) setSource({ base: r.base, text });
                }}
              />
              <CopyButton value={text.replace(/[\s,]/g, "")} />
              {editing && parsed.error && <div className="base-error">{parsed.error}</div>}
            </div>
          );
        })}
      </Card>
    </>
  );
}
