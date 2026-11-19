import { useMemo, useState } from "react";
import { Card, Notice, TextInput, ValueRow } from "../components/ui";
import {
  contrastRatio,
  mix,
  parseColor,
  type RGBA,
  roundTo,
  toCmyk,
  toHex,
  toHslString,
  toHsv,
  toOklchString,
  toRgbString,
} from "../lib/color";

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

function grade(ratio: number) {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA (大きい文字)";
  return "不足";
}

export default function ColorConverter() {
  const [text, setText] = useState("#7c6cff");
  const [last, setLast] = useState<RGBA>(() => parseColor("#7c6cff")!);
  const parsed = useMemo(() => parseColor(text), [text]);
  // 入力途中で読めないあいだは、最後に読めた色を出しておく
  const c = parsed ?? last;

  const update = (v: string) => {
    setText(v);
    const p = parseColor(v);
    if (p) setLast(p);
  };

  const hex = toHex(c);
  const hsv = toHsv(c);
  const cmyk = toCmyk(c);
  const onWhite = contrastRatio(c, WHITE);
  const onBlack = contrastRatio(c, BLACK);

  const shades = useMemo(() => {
    const tints = [0.8, 0.6, 0.4, 0.2].map((t) => mix(c, WHITE, t));
    const darks = [0.2, 0.4, 0.6, 0.8].map((t) => mix(c, BLACK, t));
    return [...tints, c, ...darks].map((x) => toHex({ ...x, a: 1 }));
  }, [c]);

  return (
    <div className="split color-split">
      <div className="stack">
        <div className="swatch-wrap">
          <div className="swatch" style={{ background: toRgbString(c) }}>
            <input
              type="color"
              className="swatch-picker"
              value={hex}
              onChange={(e) => update(e.target.value)}
              aria-label="色を選ぶ"
            />
            <span className="swatch-hint">クリックで色を選ぶ</span>
          </div>
        </div>
        <TextInput value={text} onChange={update} placeholder="#7c6cff / rgb(124 108 255) / hsl(247 100% 71%) / oklch(...)" />
        {!parsed && text.trim() !== "" && <Notice kind="warn">色として読めません (最後に読めた色を表示しています)</Notice>}
        <div className="shades">
          {shades.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`shade ${i === 4 ? "is-base" : ""}`}
              style={{ background: s }}
              onClick={() => update(s)}
              data-tip={s}
            />
          ))}
        </div>
        <div className="contrast">
          <div className="contrast-box" style={{ background: "#fff", color: hex }}>
            <span className="contrast-sample">Aa あ</span>
            <span className="contrast-ratio">
              白の上 {roundTo(onWhite, 2)} : 1 <b>{grade(onWhite)}</b>
            </span>
          </div>
          <div className="contrast-box" style={{ background: "#000", color: hex }}>
            <span className="contrast-sample">Aa あ</span>
            <span className="contrast-ratio">
              黒の上 {roundTo(onBlack, 2)} : 1 <b>{grade(onBlack)}</b>
            </span>
          </div>
        </div>
      </div>
      <Card title="表記">
        <ValueRow label="HEX" value={toHex(c, { alpha: true })} />
        <ValueRow label="HEX (大文字)" value={toHex(c, { alpha: true, upper: true })} />
        <ValueRow label="RGB" value={toRgbString(c)} />
        <ValueRow label="HSL" value={toHslString(c)} />
        <ValueRow label="HSV / HSB" value={`hsv(${roundTo(hsv.h)}, ${roundTo(hsv.s)}%, ${roundTo(hsv.v)}%)`} />
        <ValueRow label="OKLCH" value={toOklchString(c)} />
        <ValueRow
          label="CMYK"
          hint="単純計算 (印刷用の色管理なし)"
          value={`cmyk(${roundTo(cmyk.c)}%, ${roundTo(cmyk.m)}%, ${roundTo(cmyk.y)}%, ${roundTo(cmyk.k)}%)`}
        />
        <ValueRow label="R, G, B" value={[c.r, c.g, c.b].map((v) => Math.round(v)).join(", ")} />
        <ValueRow label="SwiftUI" value={`Color(red: ${roundTo(c.r / 255, 3)}, green: ${roundTo(c.g / 255, 3)}, blue: ${roundTo(c.b / 255, 3)})`} />
      </Card>
    </div>
  );
}
