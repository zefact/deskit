import { useDeferredValue, useMemo, useState } from "react";
import { Card, InputPane, ValueRow } from "../components/ui";
import { textStats } from "../lib/textStats";
import { fmtNum, SampleButton } from "./common";

const SAMPLE = `今日は朝から良い天気です。コーヒーを淹れて、仕事を始めましょう。
ｶﾀｶﾅやＡＢＣのような全角・半角も数えます。

Deskit counts characters, bytes & lines 👩‍💻`;

export default function TextCounter() {
  const [input, setInput] = useState("");
  const deferred = useDeferredValue(input);
  const s = useMemo(() => textStats(deferred), [deferred]);

  const big: [string, number, string?][] = [
    ["文字数", s.chars],
    ["空白・改行を除く", s.charsNoSpace],
    ["行数", s.lines],
    ["単語数", s.words, "英語は空白区切り、日本語は形態の区切り"],
  ];

  return (
    <div className="split">
      <InputPane
        title="テキスト"
        value={input}
        onChange={setInput}
        placeholder="数えるテキストを入力または貼り付け"
        extra={<SampleButton onClick={() => setInput(SAMPLE)} />}
      />
      <div className="stack">
        <div className="stat-grid">
          {big.map(([label, n, tip]) => (
            <div className="stat" key={label} title={tip}>
              <div className="stat-num">{fmtNum(n)}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
        <Card title="詳細">
          <ValueRow label="UTF-8" hint="バイト数" value={`${fmtNum(s.utf8Bytes)} バイト`} copy={String(s.utf8Bytes)} />
          <ValueRow label="Shift_JIS" hint="バイト数 (概算)" value={`${fmtNum(s.sjisBytes)} バイト`} copy={String(s.sjisBytes)} />
          <ValueRow label="UTF-16" hint="JavaScript の length" value={fmtNum(s.utf16)} copy={String(s.utf16)} />
          <ValueRow label="コードポイント" value={fmtNum(s.codePoints)} copy={String(s.codePoints)} />
          <ValueRow label="全角 / 半角" value={`${fmtNum(s.fullWidth)} / ${fmtNum(s.halfWidth)}`} />
          <ValueRow label="空行" value={fmtNum(s.blankLines)} copy={String(s.blankLines)} />
          <ValueRow label="原稿用紙" hint="400字詰め換算" value={`${fmtNum(s.manuscriptPages)} 枚`} copy={String(s.manuscriptPages)} />
        </Card>
      </div>
    </div>
  );
}
