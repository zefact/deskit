import { RefreshCw, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CopyButton, Opt, OptBar, Segmented, Switch, TextInput } from "../components/ui";
import {
  AMBIGUOUS,
  blockedChars,
  charGroups,
  DEFAULT_PASSWORD_OPTIONS,
  entropyBits,
  type FirstChar,
  generatePassword,
  isPasswordOptions,
  normalizeSymbols,
  optionProblem,
  type PasswordOptions,
  strengthOf,
  SYMBOL_CHOICES,
  SYMBOL_PRESETS,
} from "../lib/password";
import { createStore, useStore } from "../store";

const STRENGTH = {
  weak: { label: "弱い", level: 1 },
  fair: { label: "ふつう", level: 2 },
  good: { label: "強い", level: 3 },
  strong: { label: "とても強い", level: 4 },
} as const;

const FIRST_OPTIONS: { value: FirstChar; label: string }[] = [
  { value: "any", label: "指定なし" },
  { value: "letter", label: "英字" },
  { value: "alnum", label: "英字か数字" },
];

/** 条件は次に開いたときも使う (サービスごとの決まりに合わせて設定することが多いため) */
const optionsStore = createStore<PasswordOptions>("password-options", DEFAULT_PASSWORD_OPTIONS, isPasswordOptions);
const countStore = createStore<number>(
  "password-count",
  8,
  (v): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 50,
);

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** 数を入れる小さな欄 (空や範囲外は、範囲の中に収める) */
function NumberInput({
  value,
  min,
  max,
  onChange,
  disabled,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <input
      className="input mono num-input"
      type="number"
      min={min}
      max={max}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(clamp(Math.floor(Number(e.target.value)) || min, min, max))}
    />
  );
}

export default function PasswordGenerator() {
  const opts = useStore(optionsStore);
  const count = useStore(countStore);
  const [nonce, setNonce] = useState(0);

  const set = <K extends keyof PasswordOptions>(k: K, v: PasswordOptions[K]) =>
    optionsStore.set((o) => ({ ...o, [k]: v }));

  const problem = optionProblem(opts);
  const list = useMemo(
    () => (problem ? [] : Array.from({ length: count }, () => generatePassword(opts))),
    // nonce は「もう一度作る」ための印
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts, count, nonce, problem],
  );
  // 条件は合っていても、組み合わせによっては作れないことがある (記号1種類で続けない、など)
  const message =
    problem ?? (list.some((p) => p === "") ? "条件をすべて満たすパスワードを作れませんでした。条件をゆるめてください" : null);
  const bits = entropyBits(opts);
  const strength = STRENGTH[strengthOf(bits)];

  const blocked = useMemo(() => blockedChars(opts), [opts]);
  const symbolCount = charGroups(opts).find((g) => g.kind === "symbols")?.chars.length ?? 0;
  const currentSymbols = normalizeSymbols(opts.symbolSet);
  const isDefault = (Object.keys(DEFAULT_PASSWORD_OPTIONS) as (keyof PasswordOptions)[]).every(
    (k) => opts[k] === DEFAULT_PASSWORD_OPTIONS[k],
  );

  // 続けて押しても取りこぼさないよう、いちばん新しい設定から書き換える
  const toggleSymbol = (c: string) =>
    optionsStore.set((o) => {
      const cur = normalizeSymbols(o.symbolSet);
      return { ...o, symbolSet: cur.includes(c) ? cur.replace(c, "") : normalizeSymbols(cur + c) };
    });

  return (
    <>
      <OptBar>
        <Opt label="長さ">
          <input
            type="range"
            min={4}
            max={128}
            value={opts.length}
            onChange={(e) => set("length", Number(e.target.value))}
            className="range"
            aria-label="長さ"
          />
          <NumberInput value={opts.length} min={4} max={128} onChange={(v) => set("length", v)} label="長さ" />
        </Opt>
        <Opt label="個数">
          <NumberInput value={count} min={1} max={50} onChange={(v) => countStore.set(v)} label="個数" />
        </Opt>
        <div className="optbar-spacer" />
        <Button icon={RefreshCw} variant="primary" onClick={() => setNonce((n) => n + 1)} disabled={!!problem}>
          作り直す
        </Button>
      </OptBar>

      <Card
        title="条件"
        className="pw-settings"
        actions={
          <Button icon={RotateCcw} variant="ghost" onClick={() => optionsStore.set(DEFAULT_PASSWORD_OPTIONS)} disabled={isDefault}>
            初期設定に戻す
          </Button>
        }
      >
        <div className="pw-set-row">
          <span className="pw-set-label">使う文字</span>
          <div className="pw-set-body">
            <Switch checked={opts.lower} onChange={(v) => set("lower", v)} label="小文字 a-z" />
            <Switch checked={opts.upper} onChange={(v) => set("upper", v)} label="大文字 A-Z" />
            <Switch checked={opts.digits} onChange={(v) => set("digits", v)} label="数字 0-9" />
            <Switch checked={opts.symbols} onChange={(v) => set("symbols", v)} label="記号" />
            <span className="pw-set-note">オンにした種類は、それぞれ必ず1文字以上入ります</span>
          </div>
        </div>

        <div className={`pw-set-row ${opts.symbols ? "" : "is-off"}`}>
          <span className="pw-set-label">
            使う記号
            <span className="pw-set-count">{opts.symbols ? `${symbolCount}種類` : "使わない"}</span>
          </span>
          <div className="pw-set-body pw-set-stack">
            <div className="pw-chips">
              {[...SYMBOL_CHOICES].map((c) => {
                const on = currentSymbols.includes(c);
                const why = blocked.has(c) ? "「ほかに除く文字」に入っているので使いません" : undefined;
                return (
                  <button
                    key={c}
                    type="button"
                    className={`pw-chip mono ${on ? "is-on" : ""} ${why ? "is-blocked" : ""}`}
                    aria-pressed={on}
                    aria-label={`記号 ${c}`}
                    data-tip={why}
                    disabled={!opts.symbols}
                    onClick={() => toggleSymbol(c)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
            <div className="pw-presets">
              {SYMBOL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`pw-preset ${currentSymbols === normalizeSymbols(p.chars) ? "is-on" : ""}`}
                  data-tip={p.hint}
                  disabled={!opts.symbols}
                  onClick={() => set("symbolSet", normalizeSymbols(p.chars))}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                className="pw-preset"
                disabled={!opts.symbols || currentSymbols === ""}
                onClick={() => set("symbolSet", "")}
              >
                すべて外す
              </button>
            </div>
          </div>
        </div>

        <div className="pw-set-row">
          <span className="pw-set-label">並び</span>
          <div className="pw-set-body">
            <Opt label="先頭の文字">
              <Segmented value={opts.first} onChange={(v) => set("first", v)} options={FIRST_OPTIONS} />
            </Opt>
            <Switch checked={opts.noRepeat} onChange={(v) => set("noRepeat", v)} label="同じ文字を続けない (aa・11 など)" />
          </div>
        </div>

        <div className="pw-set-row">
          <span className="pw-set-label">除く文字</span>
          <div className="pw-set-body">
            <Switch
              checked={opts.excludeAmbiguous}
              onChange={(v) => set("excludeAmbiguous", v)}
              label={`見間違えやすい英数字 (${[...AMBIGUOUS].join(" ")})`}
            />
            <Opt label="ほかに除く文字">
              <TextInput value={opts.exclude} onChange={(v) => set("exclude", v)} placeholder="例: xX%" className="pw-exclude" />
            </Opt>
          </div>
        </div>
      </Card>

      <div className={`strength strength-${message ? 0 : strength.level}`}>
        <div className="strength-bar">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className={!message && i <= strength.level ? "on" : ""} />
          ))}
        </div>
        <span className={`strength-label ${message ? "is-problem" : ""}`}>{message ?? strength.label}</span>
        {!message && <span className="strength-bits">約 {Math.round(bits)} ビット</span>}
      </div>

      <Card
        title="パスワード"
        className="pw-card"
        actions={<CopyButton value={message ? "" : list.join("\n")} label="すべてコピー" />}
      >
        {!message &&
          list.map((p, i) => (
            <div className="pw-row" key={i}>
              <span className="pw-text mono">{p}</span>
              <CopyButton value={p} />
            </div>
          ))}
      </Card>
    </>
  );
}
