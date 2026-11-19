import { ArrowLeftRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button, InputPane, Opt, OptBar, OutputPane, Segmented, Switch } from "../components/ui";
import { decodeBase64Text, encodeBase64Text } from "../lib/base64";
import { errorMessage, fmtBytes, PaneFoot, SampleButton } from "./common";

type Mode = "encode" | "decode";

const SAMPLE = "こんにちは、Deskit! 🧰";

export default function Base64Tool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [urlSafe, setUrlSafe] = useState(false);
  const [wrap, setWrap] = useState(false);
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);

  const result = useMemo(() => {
    if (deferred === "") return { out: "" };
    try {
      return {
        out: mode === "encode" ? encodeBase64Text(deferred, { urlSafe, wrap }) : decodeBase64Text(deferred),
      };
    } catch (e) {
      return { out: "", error: errorMessage(e) };
    }
  }, [deferred, mode, urlSafe, wrap]);

  const inBytes = useMemo(() => new TextEncoder().encode(deferred).length, [deferred]);

  const swap = () => {
    if (!result.error) setInput(result.out);
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
              { value: "encode", label: "エンコード" },
              { value: "decode", label: "デコード" },
            ]}
          />
        </Opt>
        {mode === "encode" && (
          <>
            <Switch checked={urlSafe} onChange={setUrlSafe} label="URLセーフ (Base64URL)" />
            <Switch checked={wrap} onChange={setWrap} label="76文字で改行 (MIME)" />
          </>
        )}
        <div className="optbar-spacer" />
        <Button icon={ArrowLeftRight} onClick={swap}>
          入れ替え
        </Button>
      </OptBar>
      <div className="split">
        <InputPane
          title={mode === "encode" ? "テキスト" : "Base64"}
          value={input}
          onChange={setInput}
          placeholder={mode === "encode" ? "エンコードするテキスト" : "デコードする Base64 (URLセーフ形式・改行入りも可)"}
          extra={
            <SampleButton
              onClick={() => setInput(mode === "encode" ? SAMPLE : encodeBase64Text(SAMPLE))}
            />
          }
          footer={
            result.error ? (
              <PaneFoot kind="error">{result.error}</PaneFoot>
            ) : deferred ? (
              <PaneFoot>{fmtBytes(inBytes)}</PaneFoot>
            ) : null
          }
        />
        <OutputPane title={mode === "encode" ? "Base64" : "テキスト"} value={result.out} />
      </div>
    </>
  );
}
