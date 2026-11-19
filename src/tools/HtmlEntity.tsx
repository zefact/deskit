import { ArrowLeftRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button, InputPane, Opt, OptBar, OutputPane, Segmented, Switch } from "../components/ui";
import { decodeHtml, encodeHtml } from "../lib/htmlEntity";
import { SampleButton } from "./common";

type Mode = "encode" | "decode";

const SAMPLE = `<a href="/search?q=json&lang=ja" title='"引用"'>© 2026 Deskit → 詳しく</a>`;

export default function HtmlEntity() {
  const [mode, setMode] = useState<Mode>("encode");
  const [nonAscii, setNonAscii] = useState(false);
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);
  const parser = useMemo(() => new DOMParser(), []);

  const out = useMemo(() => {
    if (deferred === "") return "";
    return mode === "encode" ? encodeHtml(deferred, { nonAscii }) : decodeHtml(deferred, parser);
  }, [deferred, mode, nonAscii, parser]);

  const swap = () => {
    setInput(out);
    setMode(mode === "encode" ? "decode" : "encode");
  };

  return (
    <>
      <OptBar>
        <Opt label="処理">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "encode", label: "エスケープ" },
              { value: "decode", label: "元に戻す" },
            ]}
          />
        </Opt>
        {mode === "encode" && (
          <Switch checked={nonAscii} onChange={setNonAscii} label="ASCII以外も &#x..; にする" />
        )}
        <div className="optbar-spacer" />
        <Button icon={ArrowLeftRight} onClick={swap}>
          入れ替え
        </Button>
      </OptBar>
      <div className="split">
        <InputPane
          title={mode === "encode" ? "テキスト / HTML" : "エスケープされたHTML"}
          value={input}
          onChange={setInput}
          placeholder={mode === "encode" ? "エスケープするテキスト" : "&lt;div&gt; のような文字参照を含むテキスト"}
          extra={<SampleButton onClick={() => setInput(mode === "encode" ? SAMPLE : encodeHtml(SAMPLE))} />}
        />
        <OutputPane title="出力" value={out} />
      </div>
    </>
  );
}
