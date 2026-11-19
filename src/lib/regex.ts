/** 正規表現テスターの照合 */

export interface RegexGroup {
  name: string;
  value: string | undefined;
}

export interface RegexMatch {
  index: number;
  end: number;
  text: string;
  groups: RegexGroup[];
}

export const MATCH_LIMIT = 5000;

export function buildRegex(pattern: string, flags: string): RegExp {
  try {
    return new RegExp(pattern, flags);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg.replace(/^Invalid regular expression: /, ""), { cause: e });
  }
}

/**
 * グループの値。番号付き ($1, $2…) を並べたあとに名前付き (<name>) を並べる
 * (置換で使える書き方そのままの名前にしておく)
 */
function groupsOf(m: RegExpExecArray): RegexGroup[] {
  const out: RegexGroup[] = [];
  for (let i = 1; i < m.length; i++) out.push({ name: `$${i}`, value: m[i] });
  for (const [k, v] of Object.entries(m.groups ?? {})) out.push({ name: `<${k}>`, value: v });
  return out;
}

/** 一致した箇所をすべて (g フラグが無ければ最初の1つだけ) 返す */
export function findMatches(re: RegExp, text: string, limit = MATCH_LIMIT) {
  const matches: RegexMatch[] = [];
  let truncated = false;
  if (!re.global && !re.sticky) {
    const m = re.exec(text);
    if (m) matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups: groupsOf(m) });
    return { matches, truncated };
  }
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    matches.push({ index: m.index, end: m.index + m[0].length, text: m[0], groups: groupsOf(m) });
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
    // 長さ0の一致で止まらないよう、1文字 (サロゲートペアは2) 進める
    if (m[0].length === 0) {
      const cp = text.codePointAt(r.lastIndex);
      const wide = /[uv]/.test(re.flags) && cp !== undefined && cp > 0xffff;
      r.lastIndex += wide ? 2 : 1;
    }
  }
  return { matches, truncated };
}
