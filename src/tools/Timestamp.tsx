import { Clock3 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, CopyButton, Notice, Opt, OptBar, Segmented, Select, TextInput, ValueRow } from "../components/ui";
import {
  formatJa,
  formatRelative,
  formatWareki,
  isoWithOffset,
  parseTimeInput,
  TIME_ZONES,
  type TsUnit,
} from "../lib/timestamp";
import type { ToolProps } from "./registry";
import { errorMessage } from "./common";

const UNIT_LABEL = { s: "秒", ms: "ミリ秒", us: "マイクロ秒", ns: "ナノ秒", text: "日時の文字列" } as const;

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export default function Timestamp({ active }: ToolProps) {
  const [now, setNow] = useState(() => Date.now());
  const [input, setInput] = useState(() => String(Math.floor(Date.now() / 1000)));
  const [unit, setUnit] = useState<TsUnit>("auto");
  const [zone, setZone] = useState("America/New_York");

  // 現在時刻の表示 (画面が裏に回っているあいだは止める)
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [active]);

  const parsed = useMemo(() => {
    try {
      return parseTimeInput(input, unit);
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [input, unit]);

  const nowSec = Math.floor(now / 1000);
  const date = "date" in parsed ? parsed.date : null;
  const ms = date?.getTime();

  return (
    <>
      <div className="now-card">
        <div className="now-icon">
          <Clock3 size={22} />
        </div>
        <div className="now-main">
          <div className="now-label">現在の Unix 時間</div>
          <div className="now-value mono">{nowSec}</div>
        </div>
        <div className="now-sub">
          <div className="mono">{now} ms</div>
          <div>{formatJa(new Date(now))}</div>
        </div>
        <CopyButton value={String(nowSec)} />
        <Button onClick={() => setInput(String(nowSec))}>入力へ</Button>
      </div>

      <OptBar>
        <Opt label="入力">
          <TextInput
            value={input}
            onChange={setInput}
            placeholder="1731400000 / 2026-11-12 10:00:00 / 2026-11-12T01:00:00Z"
            className="ts-input"
          />
        </Opt>
        <Opt label="単位">
          <Segmented<TsUnit>
            value={unit}
            onChange={setUnit}
            options={[
              { value: "auto", label: "自動" },
              { value: "s", label: "秒" },
              { value: "ms", label: "ミリ秒" },
              { value: "us", label: "μ秒" },
              { value: "ns", label: "n秒" },
            ]}
          />
        </Opt>
        {"detected" in parsed && <span className="faint ts-detected">→ {UNIT_LABEL[parsed.detected]}として解釈</span>}
      </OptBar>

      {"error" in parsed ? (
        <Notice kind="error">{parsed.error}</Notice>
      ) : (
        date &&
        ms !== undefined && (
          <div className="ts-grid">
            <Card title="Unix 時間">
              <ValueRow label="秒" value={String(Math.floor(ms / 1000))} />
              <ValueRow label="ミリ秒" value={String(ms)} />
              <ValueRow label="相対" value={formatRelative(date, now)} mono={false} />
            </Card>
            <Card title={`このPC (${localZone})`}>
              <ValueRow label="日時" value={formatJa(date)} />
              <ValueRow label="ISO 8601" value={isoWithOffset(date)} />
              <ValueRow label="和暦" value={formatWareki(date)} mono={false} />
            </Card>
            <Card title="UTC">
              <ValueRow label="日時" value={formatJa(date, "UTC")} />
              <ValueRow label="ISO 8601" value={date.toISOString()} />
              <ValueRow label="RFC 7231 (HTTP)" value={date.toUTCString()} />
            </Card>
            <Card
              title="タイムゾーン"
              actions={<Select value={zone} onChange={setZone} options={TIME_ZONES.map((z) => ({ value: z.id, label: z.label }))} />}
            >
              <ValueRow label="日時" value={formatJa(date, zone)} />
              <ValueRow label="ISO 8601" value={isoWithOffset(date, zone)} />
            </Card>
          </div>
        )
      )}
    </>
  );
}
