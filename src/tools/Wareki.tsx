/**
 * 西暦・和暦・年齢。
 *
 * 生年月日 (西暦・和暦)・年・年齢のどれを入れても、和暦・干支・年齢と、
 * 小学校から大学までの入学と卒業の年を出す。下に年齢の早見表も出す
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, Notice, Opt, OptBar, Segmented, TextInput, ValueRow } from "../components/ui";
import {
  ageOn,
  cmpYmd,
  diffDays,
  elementaryEntryYear,
  eraChangeNote,
  ERAS,
  erasOfYear,
  type EraName,
  eto,
  formatSeireki,
  formatSlash,
  formatWareki,
  formatWarekiMonth,
  formatWarekiShort,
  formatWarekiYear,
  gradeOn,
  isEarlyBorn,
  kazoe,
  nextBirthday,
  parseDate,
  parseInput,
  schoolTerms,
  todayYmd,
  type Ymd,
} from "../lib/wareki";
import { errorMessage, fmtNum, SampleButton } from "./common";
import type { ToolProps } from "./registry";

const SAMPLE = "平成2年4月5日";
/** 早見表に出す年数 (基準日の年からさかのぼる) */
const TABLE_YEARS = 120;

/** 1990年 (平成2年) の形 */
function yearWithWareki(y: number): string {
  const w = formatWarekiYear(y);
  return w ? `${y}年 (${w})` : `${y}年`;
}

export default function Wareki({ active }: ToolProps) {
  const [input, setInput] = useState("");
  const [today, setToday] = useState(todayYmd);
  const [asOfMode, setAsOfMode] = useState<"today" | "custom">("today");
  const [asOfInput, setAsOfInput] = useState("");
  // 年だけを入れたときは、早生まれかどうかが分からないので選んでもらう
  const [early, setEarly] = useState(false);

  // 開くたびに今日の日付を取り直す (日をまたいで開いたままのとき)
  useEffect(() => {
    if (active) setToday(todayYmd());
  }, [active]);

  const parsed = useMemo(() => {
    if (!input.trim()) return null;
    try {
      return parseInput(input);
    } catch (e) {
      return { kind: "error" as const, error: errorMessage(e) };
    }
  }, [input]);

  const asOf = useMemo((): { date: Ymd } | { error: string } => {
    if (asOfMode === "today") return { date: today };
    try {
      return { date: parseDate(asOfInput) };
    } catch (e) {
      return { error: errorMessage(e) };
    }
  }, [asOfMode, asOfInput, today]);

  const on = "date" in asOf ? asOf.date : null;

  // 早見表で目立たせる年
  const hitYears =
    parsed?.kind === "date"
      ? [parsed.date.y]
      : parsed?.kind === "year"
        ? [parsed.year]
        : parsed?.kind === "age" && on
          ? [on.y - parsed.age, on.y - parsed.age - 1]
          : [];

  return (
    <>
      <OptBar>
        <Opt label="生年月日・年・年齢">
          <TextInput
            value={input}
            onChange={setInput}
            placeholder="1990/4/5・平成2年4月5日・H2.4.5・S60・36歳"
            className="wk-input"
          />
          <SampleButton onClick={() => setInput(SAMPLE)} />
        </Opt>
        <Opt label="基準日">
          <Segmented<"today" | "custom">
            value={asOfMode}
            onChange={(v) => {
              if (v === "custom" && !asOfInput) setAsOfInput(formatSlash(today));
              setAsOfMode(v);
            }}
            options={[
              { value: "today", label: "今日" },
              { value: "custom", label: "日付を指定" },
            ]}
          />
          {asOfMode === "custom" && <TextInput value={asOfInput} onChange={setAsOfInput} placeholder="2026/4/1" className="wk-asof" />}
        </Opt>
      </OptBar>

      {"error" in asOf && <Notice kind="error">基準日: {asOf.error}</Notice>}
      {!parsed && (
        <Notice>
          生年月日 (西暦・和暦)、年、年齢 (36歳) のどれかを入れると、和暦・干支・年齢と、小学校から大学までの入学・卒業の年を出します。下の早見表の行を押しても入れられます。
        </Notice>
      )}
      {parsed?.kind === "error" && <Notice kind="error">{parsed.error}</Notice>}
      {parsed && "notes" in parsed && parsed.notes.map((n) => <Notice key={n} kind="warn">{n}</Notice>)}

      {on && parsed?.kind === "date" && <DateResult birth={parsed.date} on={on} />}
      {on && parsed?.kind === "year" && <YearResult year={parsed.year} on={on} early={early} onEarly={setEarly} />}
      {on && parsed?.kind === "age" && <AgeResult age={parsed.age} on={on} />}

      {on && <QuickTable on={on} hitYears={hitYears} onPick={(y) => setInput(String(y))} />}
    </>
  );
}

function EtoRow({ y }: { y: number }) {
  const e = eto(y);
  return <ValueRow label="干支" hint="元日で区切っています" value={`${e.kanji} (${e.kana})・${e.animal}`} copy={e.kanji} mono={false} />;
}

/** 生年月日を入れたとき */
function DateResult({ birth, on }: { birth: Ymd; on: Ymd }) {
  const born = cmpYmd(birth, on) <= 0;
  const next = nextBirthday(birth, on);
  const early = isEarlyBorn(birth);
  return (
    <div className="ts-grid">
      <Card title="西暦・和暦">
        <ValueRow label="西暦" value={formatSeireki(birth)} copy={`${birth.y}年${birth.m}月${birth.d}日`} mono={false} />
        <ValueRow label="西暦 (数字)" value={formatSlash(birth)} />
        <ValueRow label="和暦" value={formatWareki(birth)} mono={false} />
        <ValueRow label="和暦 (略)" value={formatWarekiShort(birth)} />
        <EtoRow y={birth.y} />
      </Card>
      <Card title={`年齢 (${formatSlash(on)} の時点)`}>
        {born ? (
          <>
            <ValueRow label="満年齢" value={`${ageOn(birth, on)}歳`} mono={false} />
            <ValueRow label="数え年" hint="生まれた年を1歳とし、元日ごとに1つ足す" value={`${kazoe(birth.y, on)}歳`} mono={false} />
            <ValueRow
              label="次の誕生日"
              hint={birth.m === 2 && birth.d === 29 && next.date.m === 3 ? "うるう年でない年は、3月1日に年をとります" : undefined}
              value={
                next.days === 0
                  ? `今日が誕生日 (${next.age}歳になりました)`
                  : `${formatSeireki(next.date)} に ${next.age}歳 (あと ${fmtNum(next.days)}日)`
              }
              copy={formatSlash(next.date)}
              mono={false}
            />
            <ValueRow label="生まれてから" value={`${fmtNum(diffDays(on, birth))}日`} mono={false} />
          </>
        ) : (
          <ValueRow label="満年齢" value={`まだ生まれていません (あと ${fmtNum(diffDays(birth, on))}日)`} mono={false} />
        )}
      </Card>
      <SchoolCard entry={elementaryEntryYear(birth.y, early)} on={on} early={early} />
    </div>
  );
}

/** 年だけを入れたとき */
function YearResult({ year, on, early, onEarly }: { year: number; on: Ymd; early: boolean; onEarly: (v: boolean) => void }) {
  const after = on.y - year;
  return (
    <div className="ts-grid">
      <Card title="西暦・和暦">
        <ValueRow label="西暦" value={`${year}年`} mono={false} />
        <ValueRow label="和暦" hint={eraChangeNote(year) ?? undefined} value={formatWarekiYear(year)} mono={false} />
        <EtoRow y={year} />
      </Card>
      <Card title={`年齢 (${formatSlash(on)} の時点)`}>
        {after < 0 ? (
          <ValueRow label="満年齢" value="まだ生まれていません" mono={false} />
        ) : (
          <>
            <ValueRow label="誕生日を過ぎた人" hint={`${on.y}年の誕生日を迎えた人`} value={`${after}歳`} mono={false} />
            <ValueRow
              label="誕生日がまだの人"
              hint={`${on.y}年の誕生日をまだ迎えていない人`}
              value={after >= 1 ? `${after - 1}歳` : "まだ生まれていません"}
              mono={false}
            />
            <ValueRow label="数え年" hint="生まれた年を1歳とし、元日ごとに1つ足す" value={`${kazoe(year, on)}歳`} mono={false} />
          </>
        )}
      </Card>
      <SchoolCard entry={elementaryEntryYear(year, early)} on={on} early={early} onEarly={onEarly} />
    </div>
  );
}

/** 年齢を入れたとき */
function AgeResult({ age, on }: { age: number; on: Ymd }) {
  const passed = on.y - age;
  const notYet = on.y - age - 1;
  return (
    <div className="ts-grid">
      <Card title={`${age}歳の人の生まれ年 (${formatSlash(on)} の時点)`}>
        <ValueRow label="誕生日を過ぎた人" hint={`${on.y}年の誕生日を迎えた人`} value={`${yearWithWareki(passed)} 生まれ`} copy={String(passed)} mono={false} />
        <ValueRow label="誕生日がまだの人" hint={`${on.y}年の誕生日をまだ迎えていない人`} value={`${yearWithWareki(notYet)} 生まれ`} copy={String(notYet)} mono={false} />
      </Card>
    </div>
  );
}

const ym = (y: number, m: number) => (
  <>
    <span className="mono">
      {y}年{m}月
    </span>
    <span className="wk-sub">{formatWarekiMonth(y, m)}</span>
  </>
);

/** 小学校から大学までの入学と卒業の年 */
function SchoolCard({ entry, on, early, onEarly }: { entry: number; on: Ymd; early: boolean; onEarly?: (v: boolean) => void }) {
  const schoolYear = on.m >= 4 ? on.y : on.y - 1;
  return (
    <Card
      className="wk-span"
      title={
        <>
          学校の入学・卒業 <span className="wk-card-sub">浪人・留年をしないとき</span>
        </>
      }
      actions={
        onEarly ? (
          <Segmented<"late" | "early">
            value={early ? "early" : "late"}
            onChange={(v) => onEarly(v === "early")}
            options={[
              { value: "late", label: "4月2日〜12月31日生まれ" },
              { value: "early", label: "1月1日〜4月1日生まれ (早生まれ)" },
            ]}
          />
        ) : (
          early && (
            <span className="badge" data-tip="1月1日〜4月1日生まれは、前の年の4月2日以降に生まれた人と同じ学年になります">
              早生まれ
            </span>
          )
        )
      }
    >
      <table className="wk-table wk-school">
        <thead>
          <tr>
            <th>学校</th>
            <th>入学</th>
            <th>卒業</th>
          </tr>
        </thead>
        <tbody>
          {schoolTerms(entry).map((t) => (
            <tr key={t.stage.name} className={t.entry <= schoolYear && schoolYear < t.graduate ? "is-now" : ""}>
              <td>{t.stage.name}</td>
              <td>{ym(t.entry, 4)}</td>
              <td>{ym(t.graduate, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="wk-grade">
        {formatSlash(on)} の時点: <strong>{gradeOn(entry, on)}</strong>
      </div>
    </Card>
  );
}

type EraFilter = "all" | EraName;

/** 年齢の早見表 */
function QuickTable({ on, hitYears, onPick }: { on: Ymd; hitYears: number[]; onPick: (y: number) => void }) {
  const [era, setEra] = useState<EraFilter>("all");
  const wrapRef = useRef<HTMLDivElement>(null);

  const years = useMemo(() => {
    const out: number[] = [];
    for (let y = on.y; y >= on.y - TABLE_YEARS; y--) {
      if (era === "all" || erasOfYear(y).some((e) => e.name === era)) out.push(y);
    }
    return out;
  }, [on.y, era]);

  // 入力した年が表の真ん中に見えるようにする
  const hitKey = hitYears.join(",");
  useEffect(() => {
    const wrap = wrapRef.current;
    const row = hitYears.length ? wrap?.querySelector<HTMLElement>(`[data-year="${hitYears[0]}"]`) : null;
    if (!wrap || !row) return;
    const r = row.getBoundingClientRect();
    const w = wrap.getBoundingClientRect();
    wrap.scrollTop += r.top - w.top - (wrap.clientHeight - r.height) / 2;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitKey, years]);

  return (
    <Card
      title="早見表"
      className="wk-quick-card"
      actions={
        <Segmented<EraFilter>
          value={era}
          onChange={setEra}
          options={[{ value: "all", label: "すべて" }, ...[...ERAS].reverse().map((e) => ({ value: e.name, label: e.name }))]}
        />
      }
    >
      <div className="wk-quick-wrap" ref={wrapRef}>
        <table className="wk-table wk-quick">
          <thead>
            <tr>
              <th>西暦</th>
              <th>和暦</th>
              <th>干支</th>
              <th className="num">誕生日の後</th>
              <th className="num">誕生日の前</th>
            </tr>
          </thead>
          <tbody>
            {years.map((y) => {
              const e = eto(y);
              const after = on.y - y;
              return (
                <tr key={y} data-year={y} className={hitYears.includes(y) ? "is-hit" : ""} onClick={() => onPick(y)}>
                  <td>
                    <button type="button" className="wk-year-btn" onClick={(ev) => (ev.stopPropagation(), onPick(y))}>
                      {y}年
                    </button>
                  </td>
                  <td>{formatWarekiYear(y)}</td>
                  <td>
                    {e.kanji}
                    <span className="wk-sub">{e.kana}</span>
                  </td>
                  <td className="num">{after}歳</td>
                  <td className="num">{after >= 1 ? `${after - 1}歳` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="wk-quick-foot faint">
        年齢は {formatSlash(on)} の時点で、{on.y}年の誕生日を過ぎた人と、まだの人です。行を押すと、その年を上に入れます。
      </div>
    </Card>
  );
}
