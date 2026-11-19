import { useDeferredValue, useMemo, useState } from "react";
import { Card, InputPane, ValueRow } from "../components/ui";
import { CASE_STYLES, convertLines } from "../lib/caseConvert";
import { SampleButton } from "./common";

export default function CaseConverter() {
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);
  const lineCount = deferred === "" ? 0 : deferred.split(/\r?\n/).length;

  const rows = useMemo(
    () => CASE_STYLES.map((s) => ({ style: s, out: deferred === "" ? "" : convertLines(deferred, s) })),
    [deferred],
  );

  return (
    <div className="split">
      <InputPane
        title="テキスト"
        value={input}
        onChange={setInput}
        placeholder={"変換する名前・文 (複数行なら1行ずつ変換します)\n例: user account id"}
        extra={<SampleButton onClick={() => setInput("user account id\nXMLHttpRequest\nmax_retry-count")} />}
      />
      <Card title={lineCount > 1 ? `変換結果 (${lineCount}行ずつ)` : "変換結果"} className="case-card">
        {rows.map(({ style, out }) => (
          <ValueRow key={style.id} label={style.label} value={out.replace(/\n/g, "  ⏎  ")} copy={out} />
        ))}
      </Card>
    </div>
  );
}
