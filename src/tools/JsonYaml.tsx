import { ArrowLeftRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import YAML from "yaml";
import type { EditorMark } from "../components/CodeEditor";
import { Button, InputPane, Opt, OptBar, OutputPane, Segmented } from "../components/ui";
import { JsonError, parseJson, toPlainValue } from "../lib/json";
import { errorMessage, PaneFoot, SampleButton } from "./common";

type Dir = "j2y" | "y2j";

const SAMPLE_JSON = `{
  "name": "deskit",
  "version": "0.1.0",
  "features": ["json", "yaml", "base64"],
  "window": { "width": 1240, "height": 820, "resizable": true },
  "author": null
}`;

interface Result {
  out: string;
  error?: string;
  marks?: EditorMark[];
}

function convert(input: string, dir: Dir, indent: number): Result {
  if (input.trim() === "") return { out: "" };
  if (dir === "j2y") {
    try {
      const value = toPlainValue(parseJson(input));
      return { out: YAML.stringify(value, { indent, lineWidth: 0 }) };
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
  }
  const docs = YAML.parseAllDocuments(input);
  const list = Array.isArray(docs) ? docs : [docs];
  for (const d of list) {
    const err = d.errors[0];
    if (err) {
      const pos = err.linePos?.[0];
      return {
        out: "",
        error: pos ? `${pos.line}行 ${pos.col}列: ${err.message.split("\n")[0]}` : err.message,
        marks: [{ from: err.pos[0], to: Math.max(err.pos[1], err.pos[0] + 1), className: "cm-mark-error" }],
      };
    }
  }
  try {
    const values = list.map((d) => d.toJS());
    const value = values.length === 1 ? values[0] : values;
    return { out: JSON.stringify(value, null, indent) ?? "" };
  } catch (e) {
    return { out: "", error: errorMessage(e) };
  }
}

export default function JsonYaml() {
  const [dir, setDir] = useState<Dir>("j2y");
  const [indent, setIndent] = useState<"2" | "4">("2");
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);
  const result = useMemo(() => convert(deferred, dir, Number(indent)), [deferred, dir, indent]);

  const from = dir === "j2y" ? "JSON" : "YAML";
  const to = dir === "j2y" ? "YAML" : "JSON";

  const swap = () => {
    if (!result.error && result.out) setInput(result.out);
    setDir(dir === "j2y" ? "y2j" : "j2y");
  };

  return (
    <>
      <OptBar>
        <Opt label="変換">
          <Segmented<Dir>
            value={dir}
            onChange={setDir}
            options={[
              { value: "j2y", label: "JSON → YAML" },
              { value: "y2j", label: "YAML → JSON" },
            ]}
          />
        </Opt>
        <Opt label="インデント">
          <Segmented
            value={indent}
            onChange={setIndent}
            options={[
              { value: "2", label: "2" },
              { value: "4", label: "4" },
            ]}
          />
        </Opt>
        <div className="optbar-spacer" />
        <Button icon={ArrowLeftRight} onClick={swap}>
          入れ替え
        </Button>
      </OptBar>
      <div className="split">
        <InputPane
          title={from}
          value={input}
          onChange={setInput}
          lang={dir === "j2y" ? "json" : "yaml"}
          placeholder={`${from} を入力または貼り付け`}
          marks={result.marks}
          extra={<SampleButton onClick={() => setInput(dir === "j2y" ? SAMPLE_JSON : (convert(SAMPLE_JSON, "j2y", 2).out))} />}
          footer={result.error && <PaneFoot kind="error">{result.error}</PaneFoot>}
        />
        <OutputPane title={to} value={result.out} lang={dir === "j2y" ? "yaml" : "json"} />
      </div>
    </>
  );
}
