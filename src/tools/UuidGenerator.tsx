import { RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button, Opt, OptBar, OutputPane, Segmented, Switch } from "../components/ui";
import { formatJa } from "../lib/timestamp";
import { formatUuid, uuidV4, uuidV7Batch, uuidV7Time } from "../lib/uuid";
import { PaneFoot } from "./common";

type Version = "v4" | "v7";

function generate(version: Version, count: number): string[] {
  if (version === "v7") return uuidV7Batch(count);
  return Array.from({ length: count }, () => uuidV4());
}

export default function UuidGenerator() {
  const [version, setVersion] = useState<Version>("v4");
  const [count, setCount] = useState(10);
  const [upper, setUpper] = useState(false);
  const [hyphens, setHyphens] = useState(true);
  const [braces, setBraces] = useState(false);
  const [list, setList] = useState<string[]>(() => generate("v4", 10));

  const regenerate = useCallback((v = version, n = count) => setList(generate(v, n)), [version, count]);

  const out = useMemo(
    () => list.map((u) => formatUuid(u, { upper, hyphens, braces })).join("\n"),
    [list, upper, hyphens, braces],
  );

  const v7Time = version === "v7" && list[0] ? uuidV7Time(list[0]) : null;

  return (
    <>
      <OptBar>
        <Opt label="バージョン">
          <Segmented<Version>
            value={version}
            onChange={(v) => {
              setVersion(v);
              regenerate(v);
            }}
            options={[
              { value: "v4", label: "v4 (ランダム)" },
              { value: "v7", label: "v7 (時刻順)" },
            ]}
          />
        </Opt>
        <Opt label="個数">
          <input
            className="input mono num-input"
            type="number"
            min={1}
            max={1000}
            value={count}
            onChange={(e) => {
              const n = Math.max(1, Math.min(1000, Number(e.target.value) || 1));
              setCount(n);
              regenerate(version, n);
            }}
          />
        </Opt>
        <Switch checked={upper} onChange={setUpper} label="大文字" />
        <Switch checked={hyphens} onChange={setHyphens} label="ハイフン" />
        <Switch checked={braces} onChange={setBraces} label="{ } で囲む" />
        <div className="optbar-spacer" />
        <Button icon={RefreshCw} variant="primary" onClick={() => regenerate()}>
          生成
        </Button>
      </OptBar>
      <OutputPane
        title={`UUID ${version} × ${list.length}`}
        className="grow"
        value={out}
        footer={
          <PaneFoot>
            {version === "v4"
              ? "v4: 122ビットのランダム値。用途を問わず使える標準的な形式です"
              : `v7: 先頭48ビットが作成時刻 (${v7Time ? formatJa(v7Time) : ""})。並べると作成順になり、DBの主キーに向きます`}
          </PaneFoot>
        }
      />
    </>
  );
}
