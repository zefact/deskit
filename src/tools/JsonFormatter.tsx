import { ArrowLeft } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import type { EditorMark } from "../components/CodeEditor";
import { IconButton, InputPane, Opt, OptBar, OutputPane, Segmented, Switch } from "../components/ui";
import { type Indent, JsonError, parseJson, stringifyJson } from "../lib/json";
import { errorMessage, fmtBytes, fmtNum, PaneFoot, SampleButton } from "./common";

const SAMPLE = `{"id":1024,"name":"Deskit","tags":["dev","tools"],"price":12345678901234567890,"owner":{"name":"ZEFACT","country":"JP"},"active":true,"note":null}`;

interface Result {
  out: string;
  error?: string;
  marks?: EditorMark[];
}

export default function JsonFormatter() {
  const [input, setInput] = useState("");
  const [indent, setIndent] = useState<Indent>("2");
  const [sortKeys, setSortKeys] = useState(false);
  const [escapeUnicode, setEscapeUnicode] = useState(false);
  const deferred = useDeferredValue(input);

  const result = useMemo<Result>(() => {
    if (deferred.trim() === "") return { out: "" };
    try {
      return { out: stringifyJson(parseJson(deferred), { indent, sortKeys, escapeUnicode }) };
    } catch (e) {
      if (e instanceof JsonError) {
        return {
          out: "",
          error: `${e.line}行 ${e.column}列: ${e.message}`,
          marks: [{ from: e.offset, to: e.offset + 1, className: "cm-mark-error" }],
        };
      }
      return { out: "", error: errorMessage(e) };
    }
  }, [deferred, indent, sortKeys, escapeUnicode]);

  const outBytes = useMemo(() => new TextEncoder().encode(result.out).length, [result.out]);

  return (
    <>
      <OptBar>
        <Opt label="インデント">
          <Segmented<Indent>
            value={indent}
            onChange={setIndent}
            options={[
              { value: "2", label: "2スペース" },
              { value: "4", label: "4スペース" },
              { value: "tab", label: "タブ" },
              { value: "minify", label: "圧縮 (1行)" },
            ]}
          />
        </Opt>
        <Switch checked={sortKeys} onChange={setSortKeys} label="キーを並べ替え" />
        <Switch checked={escapeUnicode} onChange={setEscapeUnicode} label="非ASCIIを \u エスケープ" />
      </OptBar>
      <div className="split">
        <InputPane
          title="JSON"
          value={input}
          onChange={setInput}
          lang="json"
          placeholder="JSON を入力または貼り付け"
          marks={result.marks}
          extra={<SampleButton onClick={() => setInput(SAMPLE)} />}
          footer={
            result.error ? (
              <PaneFoot kind="error">{result.error}</PaneFoot>
            ) : result.out ? (
              <PaneFoot kind="ok">正しい JSON です</PaneFoot>
            ) : null
          }
        />
        <OutputPane
          title="整形結果"
          value={result.out}
          lang="json"
          wrap={indent === "minify"}
          extra={
            <IconButton icon={ArrowLeft} label="入力欄へ移す" onClick={() => setInput(result.out)} disabled={!result.out} />
          }
          footer={
            result.out ? (
              <PaneFoot>
                {fmtNum(result.out.split("\n").length)} 行 · {fmtBytes(outBytes)}
              </PaneFoot>
            ) : null
          }
        />
      </div>
    </>
  );
}
