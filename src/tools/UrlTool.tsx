import { ArrowLeftRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button, Card, CopyButton, InputPane, Opt, OptBar, OutputPane, Segmented, Switch, ValueRow } from "../components/ui";
import { decodeUrl, encodeUrl, parseUrlParts, type UrlEncodeMode } from "../lib/urlCodec";
import { errorMessage, PaneFoot, SampleButton } from "./common";

type Mode = "encode" | "decode";

const SAMPLE_DECODED = "https://example.com/検索?q=開発 ツール&lang=ja&tags=json,yaml#結果";

export default function UrlTool() {
  const [mode, setMode] = useState<Mode>("encode");
  const [encMode, setEncMode] = useState<UrlEncodeMode>("component");
  const [plus, setPlus] = useState(true);
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);

  const result = useMemo(() => {
    if (deferred === "") return { out: "" };
    try {
      return { out: mode === "encode" ? encodeUrl(deferred, encMode) : decodeUrl(deferred, plus) };
    } catch (e) {
      return { out: "", error: errorMessage(e) };
    }
  }, [deferred, mode, encMode, plus]);

  // 分解は「URLそのもの」の方 (エンコードなら入力、デコードなら結果) で行う
  const parts = useMemo(() => {
    const src = mode === "encode" ? deferred : result.out;
    return parseUrlParts(src) ?? parseUrlParts(deferred);
  }, [deferred, mode, result.out]);

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
        {mode === "encode" ? (
          <Opt label="対象">
            <Segmented<UrlEncodeMode>
              value={encMode}
              onChange={setEncMode}
              options={[
                { value: "component", label: "値 (encodeURIComponent)" },
                { value: "uri", label: "URL全体 (encodeURI)" },
                { value: "form", label: "フォーム (空白→+)" },
              ]}
            />
          </Opt>
        ) : (
          <Switch checked={plus} onChange={setPlus} label="+ を空白として扱う" />
        )}
        <div className="optbar-spacer" />
        <Button icon={ArrowLeftRight} onClick={swap}>
          入れ替え
        </Button>
      </OptBar>
      <div className="split" style={{ minHeight: 220 }}>
        <InputPane
          title="入力"
          value={input}
          onChange={setInput}
          placeholder={mode === "encode" ? "エンコードするテキスト・URL" : "デコードするテキスト (%E3%81%82 など)"}
          extra={<SampleButton onClick={() => setInput(mode === "encode" ? SAMPLE_DECODED : encodeURI(SAMPLE_DECODED))} />}
          footer={result.error && <PaneFoot kind="error">{result.error}</PaneFoot>}
        />
        <OutputPane title="出力" value={result.out} />
      </div>
      {parts && (
        <div className="url-parts">
          <Card title="URLの構成">
            <ValueRow label="スキーム" value={parts.protocol} />
            {parts.username && <ValueRow label="ユーザー" value={parts.username} />}
            <ValueRow label="ホスト" value={parts.host} />
            {parts.port && <ValueRow label="ポート" value={parts.port} />}
            <ValueRow label="パス" value={parts.pathname} />
            {parts.hash && <ValueRow label="フラグメント (#)" value={parts.hash} />}
          </Card>
          <Card title={`クエリパラメータ (${parts.params.length})`}>
            {parts.params.length === 0 ? (
              <div className="card-empty">クエリパラメータはありません</div>
            ) : (
              <table className="kv-table">
                <thead>
                  <tr>
                    <th>名前</th>
                    <th>値 (デコード済み)</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {parts.params.map(([k, v], i) => (
                    <tr key={i}>
                      <td className="mono">{k}</td>
                      <td className="mono">{v}</td>
                      <td>
                        <CopyButton value={v} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
