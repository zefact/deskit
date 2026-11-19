/** ツールの検索 (名前・英語名・キーワードから探す) */

import { kataToHira } from "./zenhan";

export interface Searchable {
  name: string;
  en: string;
  keywords: string[];
  description: string;
}

/** 全角英数を半角に、カタカナをひらがなに、大文字を小文字にそろえる */
export function normalize(s: string): string {
  return kataToHira(s.normalize("NFKC").toLowerCase());
}

/**
 * 一致の度合い (高いほど上に出す)。一致しなければ 0。
 * 空白で区切った語はすべて含まれている必要がある
 */
export function scoreTool(tool: Searchable, query: string): number {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 1;
  const name = normalize(tool.name);
  const en = normalize(tool.en);
  const keywords = tool.keywords.map(normalize);
  const desc = normalize(tool.description);
  let score = 0;
  for (const t of terms) {
    if (name.startsWith(t) || en.startsWith(t)) score += 100;
    else if (keywords.some((k) => k.startsWith(t))) score += 60;
    else if (name.includes(t) || en.includes(t)) score += 40;
    else if (keywords.some((k) => k.includes(t))) score += 25;
    else if (desc.includes(t)) score += 10;
    else return 0;
  }
  return score;
}

export function searchTools<T extends Searchable>(tools: T[], query: string): T[] {
  if (query.trim() === "") return tools;
  return tools
    .map((t, i) => ({ t, i, s: scoreTool(t, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.t);
}
