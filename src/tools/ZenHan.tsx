import { ArrowLeft } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { IconButton, InputPane, Opt, OptBar, OutputPane, Segmented, Switch } from "../components/ui";
import { hiraToKata, kataToHira, toHankaku, toZenkaku, type ZenhanTargets } from "../lib/zenhan";
import { SampleButton } from "./common";

type Mode = "toHan" | "toZen" | "toKata" | "toHira";

const SAMPLE = "ＤｅｓｋｉｔはＭａｃ／Ｗｉｎｄｏｗｓ対応のツール集です。ﾊﾞｰｼﾞｮﾝ　０．１！";

export default function ZenHan() {
  const [mode, setMode] = useState<Mode>("toHan");
  const [targets, setTargets] = useState<ZenhanTargets>({ alnum: true, symbol: true, space: true, kana: false });
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);

  const out = useMemo(() => {
    switch (mode) {
      case "toHan":
        return toHankaku(deferred, targets);
      case "toZen":
        return toZenkaku(deferred, targets);
      case "toKata":
        return hiraToKata(deferred);
      case "toHira":
        return kataToHira(deferred);
    }
  }, [deferred, mode, targets]);

  const set = (k: keyof ZenhanTargets) => (v: boolean) => setTargets((t) => ({ ...t, [k]: v }));
  const width = mode === "toHan" || mode === "toZen";

  return (
    <>
      <OptBar>
        <Opt label="変換">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "toHan", label: "全角 → 半角" },
              { value: "toZen", label: "半角 → 全角" },
              { value: "toKata", label: "ひらがな → カタカナ" },
              { value: "toHira", label: "カタカナ → ひらがな" },
            ]}
          />
        </Opt>
      </OptBar>
      {width && (
        <OptBar>
          <span className="opt-label">対象</span>
          <Switch checked={targets.alnum} onChange={set("alnum")} label="英数字" />
          <Switch checked={targets.symbol} onChange={set("symbol")} label="記号" />
          <Switch checked={targets.space} onChange={set("space")} label="スペース" />
          <Switch checked={targets.kana} onChange={set("kana")} label="カタカナ" />
        </OptBar>
      )}
      <div className="split">
        <InputPane
          title="入力"
          value={input}
          onChange={setInput}
          placeholder="変換するテキスト"
          extra={<SampleButton onClick={() => setInput(SAMPLE)} />}
        />
        <OutputPane
          title="出力"
          value={out}
          extra={<IconButton icon={ArrowLeft} label="入力欄へ移す" onClick={() => setInput(out)} disabled={!out} />}
        />
      </div>
    </>
  );
}
