import { useDeferredValue, useMemo, useState } from "react";
import type { EditorMark } from "../components/CodeEditor";
import { Card, InputPane, Notice, OutputPane, Switch, TextInput } from "../components/ui";
import { buildRegex, findMatches, type RegexMatch } from "../lib/regex";
import { errorMessage, fmtNum, SampleButton } from "./common";

const FLAGS: { flag: string; label: string; tip: string }[] = [
  { flag: "g", label: "g", tip: "すべて (global)" },
  { flag: "i", label: "i", tip: "大文字・小文字を区別しない" },
  { flag: "m", label: "m", tip: "^ $ を各行の先頭・末尾に" },
  { flag: "s", label: "s", tip: ". が改行にも一致" },
  { flag: "u", label: "u", tip: "Unicode (サロゲートペアを1文字として扱う)" },
  { flag: "y", label: "y", tip: "lastIndex の位置からだけ探す (sticky)" },
];

const SAMPLE_PATTERN = String.raw`(?<user>[\w.+-]+)@(?<domain>[\w-]+\.[\w.-]+)`;
const SAMPLE_TEXT = `お問い合わせ: support@example.com
営業担当 sales.team+jp@corp.example.co.jp まで
これはメールアドレスではありません: user@localhost`;

/** 一覧に出す数 (多すぎると描くのが重くなる) */
const LIST_LIMIT = 300;

export default function RegexTester() {
  const [pattern, setPattern] = useState("");
  const [flags, setFlags] = useState("gm");
  const [text, setText] = useState("");
  const [replaceOn, setReplaceOn] = useState(false);
  const [replacement, setReplacement] = useState("");
  const dPattern = useDeferredValue(pattern);
  const dText = useDeferredValue(text);

  const result = useMemo((): { re?: RegExp; error?: string; matches: RegexMatch[]; truncated: boolean } => {
    if (dPattern === "") return { matches: [], truncated: false };
    try {
      const re = buildRegex(dPattern, flags);
      return { re, ...findMatches(re, dText) };
    } catch (e) {
      return { error: errorMessage(e), matches: [], truncated: false };
    }
  }, [dPattern, flags, dText]);

  const marks = useMemo<EditorMark[]>(
    () =>
      result.matches.map((m, i) => ({
        from: m.index,
        to: m.end,
        className: i % 2 === 0 ? "cm-mark-a" : "cm-mark-b",
      })),
    [result.matches],
  );

  const replaced = useMemo(() => {
    if (!replaceOn || !result.re) return "";
    try {
      return dText.replace(result.re, replacement);
    } catch (e) {
      return errorMessage(e);
    }
  }, [replaceOn, result.re, dText, replacement]);

  const toggleFlag = (f: string) =>
    setFlags((cur) => {
      const next = cur.includes(f) ? cur.replace(f, "") : cur + f;
      return FLAGS.map((x) => x.flag)
        .filter((x) => next.includes(x))
        .join("");
    });

  return (
    <>
      <div className={`regex-bar ${result.error ? "is-error" : ""}`}>
        <span className="regex-slash">/</span>
        <input
          className="regex-input mono"
          value={pattern}
          placeholder="正規表現 (例: \d{3}-\d{4})"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => setPattern(e.target.value)}
        />
        <span className="regex-slash">/</span>
        <span className="regex-flags-text mono">{flags}</span>
        <div className="regex-flags">
          {FLAGS.map((f) => (
            <button
              key={f.flag}
              type="button"
              className={`flag-chip ${flags.includes(f.flag) ? "is-on" : ""}`}
              onClick={() => toggleFlag(f.flag)}
              data-tip={f.tip}
            >
              {f.label}
            </button>
          ))}
        </div>
        <SampleButton
          onClick={() => {
            setPattern(SAMPLE_PATTERN);
            setText(SAMPLE_TEXT);
          }}
        />
      </div>
      {result.error && <Notice kind="error">{result.error}</Notice>}

      <div className="split">
        <InputPane
          title={
            <>
              テスト文字列
              {dPattern && !result.error && (
                <span className={`badge ${result.matches.length ? "badge-ok" : ""}`}>
                  {fmtNum(result.matches.length)}
                  {result.truncated ? "+" : ""} 件一致
                </span>
              )}
            </>
          }
          value={text}
          onChange={setText}
          placeholder="ここに入力したテキストで一致を確かめます"
          marks={marks}
        />
        <div className="stack">
          <Card
            title="一致した箇所"
            className={replaceOn ? "match-card is-half" : "match-card grow"}
            actions={<Switch checked={replaceOn} onChange={setReplaceOn} label="置換" />}
          >
            {result.matches.length === 0 ? (
              <div className="card-empty">{dPattern ? "一致はありません" : "正規表現を入力してください"}</div>
            ) : (
              <div className="match-list">
                {result.matches.slice(0, LIST_LIMIT).map((m, i) => (
                  <div className="match" key={i}>
                    <div className="match-head">
                      <span className="match-no">#{i + 1}</span>
                      <span className={`match-text mono ${i % 2 === 0 ? "cm-mark-a" : "cm-mark-b"}`}>
                        {m.text === "" ? "(空文字)" : m.text}
                      </span>
                      <span className="match-pos">
                        {m.index}–{m.end}
                      </span>
                    </div>
                    {m.groups.length > 0 && (
                      <div className="match-groups">
                        {m.groups.map((g) => (
                          <div className="match-group" key={g.name}>
                            <span className="group-name mono">{g.name}</span>
                            <span className="group-value mono">{g.value ?? <i className="faint">undefined</i>}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {result.matches.length > LIST_LIMIT && (
                  <div className="card-empty">ほか {fmtNum(result.matches.length - LIST_LIMIT)} 件</div>
                )}
              </div>
            )}
          </Card>
          {replaceOn && (
            <>
              <TextInput value={replacement} onChange={setReplacement} placeholder="置換後の文字列 ($1, $<name>, $& が使えます)" />
              <OutputPane title="置換結果" value={replaced} className="grow" />
            </>
          )}
        </div>
      </div>
    </>
  );
}
