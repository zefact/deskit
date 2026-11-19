import { useDeferredValue, useMemo, useState } from "react";
import type { EditorMark } from "../components/CodeEditor";
import { Card, InputPane, OutputPane, ValueRow } from "../components/ui";
import { decodeJwt, jwtStatus, timeClaims } from "../lib/jwt";
import { formatJa, formatRelative } from "../lib/timestamp";
import { errorMessage, PaneFoot, SampleButton } from "./common";

// jwt.io のサンプルに exp を足したもの (署名は検証しない)
const SAMPLE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkRlc2tpdCBVc2VyIiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzYyOTEyMDAwLCJleHAiOjE4OTM0NTYwMDB9.c2lnbmF0dXJlLWlzLW5vdC12ZXJpZmllZA";

const STATUS_LABEL = {
  valid: { text: "有効期限内", kind: "ok" },
  expired: { text: "有効期限切れ", kind: "error" },
  notYet: { text: "まだ有効になっていません (nbf)", kind: "warn" },
  unknown: { text: "有効期限 (exp) なし", kind: "info" },
} as const;

export default function JwtDecoder() {
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);

  const result = useMemo(() => {
    if (deferred.trim() === "") return null;
    try {
      return { jwt: decodeJwt(deferred) };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [deferred]);

  // トークンを ヘッダー・ペイロード・署名 で色分けする
  const marks = useMemo<EditorMark[]>(() => {
    const m = /[\w-]+\.[\w-]+\.[\w-]*/.exec(input);
    if (!m) return [];
    const classes = ["jwt-h", "jwt-p", "jwt-s"];
    const out: EditorMark[] = [];
    let pos = m.index;
    m[0].split(".").forEach((p, i) => {
      out.push({ from: pos, to: pos + p.length, className: classes[i] });
      pos += p.length + 1;
    });
    return out;
  }, [input]);

  const jwt = result && "jwt" in result ? result.jwt : null;
  const claims = jwt ? timeClaims(jwt.payload) : [];
  const status = jwt ? STATUS_LABEL[jwtStatus(jwt.payload)] : null;

  return (
    <div className="split jwt">
      <InputPane
        title="トークン"
        value={input}
        onChange={setInput}
        placeholder="eyJhbGciOi... (Bearer 付きでも可)"
        marks={marks}
        extra={<SampleButton onClick={() => setInput(SAMPLE)} />}
        footer={
          result && "error" in result ? (
            <PaneFoot kind="error">{result.error}</PaneFoot>
          ) : jwt ? (
            <PaneFoot>署名は検証していません。中身の確認用です</PaneFoot>
          ) : null
        }
      />
      <div className="stack">
        {status && (
          <div className={`jwt-status notice notice-${status.kind}`}>
            <strong>{status.text}</strong>
            {typeof jwt?.header.alg === "string" && <span className="jwt-alg">alg: {jwt.header.alg}</span>}
          </div>
        )}
        <OutputPane
          title={<span className="jwt-title jwt-title-h">ヘッダー</span>}
          className="jwt-header"
          value={jwt ? JSON.stringify(jwt.header, null, 2) : ""}
          lang="json"
        />
        <OutputPane
          title={<span className="jwt-title jwt-title-p">ペイロード</span>}
          className="grow"
          value={jwt ? JSON.stringify(jwt.payload, null, 2) : ""}
          lang="json"
        />
        {claims.length > 0 && (
          <Card title="日時のクレーム">
            {claims.map((c) => (
              <ValueRow
                key={c.key}
                label={`${c.label} (${c.key})`}
                value={`${formatJa(c.date)}  ·  ${formatRelative(c.date)}`}
                mono={false}
              />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
