/** パスワードの生成 */

/** 先頭の文字: 指定なし / 英字 / 英字か数字 */
export type FirstChar = "any" | "letter" | "alnum";

export interface PasswordOptions {
  length: number;
  lower: boolean;
  upper: boolean;
  digits: boolean;
  symbols: boolean;
  /** 使う記号 (SYMBOL_CHOICES の中から) */
  symbolSet: string;
  first: FirstChar;
  /** 同じ文字を続けない (aa や 11 を作らない) */
  noRepeat: boolean;
  /** 見間違えやすい英数字 (AMBIGUOUS) を使わない。記号は選んだとおりに使う */
  excludeAmbiguous: boolean;
  /** 使わない文字 (自由に入力) */
  exclude: string;
}

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
/** 見間違えやすい英数字 (0 と O と o、1 と l と I) */
export const AMBIGUOUS = "0Oo1lI";

/** 選べる記号 (ASCII の記号すべて) */
export const SYMBOL_CHOICES = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";

/** 記号のよく使う組み合わせ */
export const SYMBOL_PRESETS = [
  { id: "common", label: "よく使われる8種", hint: "!@#$%^&* だけ。多くのサービスで使える", chars: "!#$%&*@^" },
  {
    id: "wide",
    label: "26種",
    hint: "引用符・\\ ・| ・` ・, を除いたもの。シェルや CSV に貼っても困りにくい",
    chars: "!#$%&()*+-./:;<=>?@[]^_{}~",
  },
  { id: "all", label: "すべて", hint: "ASCII の記号32種すべて", chars: SYMBOL_CHOICES },
] as const;

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  symbolSet: SYMBOL_PRESETS[0].chars,
  first: "any",
  noRepeat: true,
  excludeAmbiguous: true,
  exclude: "",
};

/** 記号を、選べる記号の並び順にそろえる (選べない文字・重複は捨てる) */
export function normalizeSymbols(chars: string): string {
  return [...SYMBOL_CHOICES].filter((c) => chars.includes(c)).join("");
}

/** 使わない文字 (見間違えやすい英数字と、自分で入れた文字) */
export function blockedChars(opts: PasswordOptions): Set<string> {
  const out = new Set([...opts.exclude].filter((c) => c.trim() !== ""));
  if (opts.excludeAmbiguous) [...AMBIGUOUS].forEach((c) => out.add(c));
  return out;
}

export type GroupKind = "lower" | "upper" | "digits" | "symbols";

export interface CharGroup {
  kind: GroupKind;
  chars: string;
}

export const GROUP_LABEL: Record<GroupKind, string> = { lower: "小文字", upper: "大文字", digits: "数字", symbols: "記号" };

/** 使う文字の組 (種類ごと。除いた結果が空の組も返す) */
export function charGroups(opts: PasswordOptions): CharGroup[] {
  const blocked = blockedChars(opts);
  const pick = (set: string) => [...set].filter((c) => !blocked.has(c)).join("");
  const groups: CharGroup[] = [];
  if (opts.lower) groups.push({ kind: "lower", chars: pick(LOWER) });
  if (opts.upper) groups.push({ kind: "upper", chars: pick(UPPER) });
  if (opts.digits) groups.push({ kind: "digits", chars: pick(DIGITS) });
  if (opts.symbols) groups.push({ kind: "symbols", chars: pick(normalizeSymbols(opts.symbolSet)) });
  return groups;
}

/** 先頭に置ける種類 */
function firstKinds(first: FirstChar): GroupKind[] | null {
  if (first === "letter") return ["lower", "upper"];
  if (first === "alnum") return ["lower", "upper", "digits"];
  return null;
}

/** 条件どおりに作れないときの理由 (作れるなら null) */
export function optionProblem(opts: PasswordOptions): string | null {
  const groups = charGroups(opts);
  if (groups.length === 0) return "文字の種類を1つ以上選んでください";
  if (opts.symbols && normalizeSymbols(opts.symbolSet) === "") return "使う記号を1つ以上選んでください";
  const empty = groups.find((g) => g.chars.length === 0);
  if (empty) return `${GROUP_LABEL[empty.kind]}に使える文字が残っていません (除く文字を見直してください)`;
  const kinds = firstKinds(opts.first);
  if (kinds && !groups.some((g) => kinds.includes(g.kind))) {
    return opts.first === "letter"
      ? "先頭を英字にするには、小文字か大文字を使ってください"
      : "先頭を英字か数字にするには、小文字・大文字・数字のどれかを使ってください";
  }
  if (groups.length > opts.length) return `使う文字の種類 (${groups.length}種類) が、長さ (${opts.length}文字) より多くなっています`;
  if (opts.noRepeat && opts.length > 1 && groups.reduce((n, g) => n + g.chars.length, 0) < 2) {
    return "同じ文字を続けないには、使える文字が2つ以上必要です";
  }
  return null;
}

/** 0 以上 max 未満の整数を偏りなく選ぶ */
export function secureRandomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

interface Slot {
  c: string;
  /** groups の何番目の種類か */
  g: number;
}

function tryOnce(opts: PasswordOptions, groups: CharGroup[], randomInt: (max: number) => number): string | null {
  const all = groups.map((g) => g.chars).join("");
  const groupOf = new Map<string, number>();
  groups.forEach((g, gi) => [...g.chars].forEach((c) => groupOf.set(c, gi)));

  // 1. 使う種類から1文字ずつ入れ、残りは全体から選ぶ
  const slots: Slot[] = groups.map((g, gi) => ({ c: g.chars[randomInt(g.chars.length)], g: gi }));
  while (slots.length < opts.length) {
    const c = all[randomInt(all.length)];
    slots.push({ c, g: groupOf.get(c)! });
  }

  // 2. 種類ごとに先頭へ並んだままにしないよう混ぜる
  for (let i = slots.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }

  // 3. 先頭に置けない文字なら、置ける文字のどれかと入れ替える
  const kinds = firstKinds(opts.first);
  if (kinds && !kinds.includes(groups[slots[0].g].kind)) {
    const ok = slots.flatMap((s, i) => (kinds.includes(groups[s.g].kind) ? [i] : []));
    if (ok.length === 0) return null;
    const j = ok[randomInt(ok.length)];
    [slots[0], slots[j]] = [slots[j], slots[0]];
  }

  // 4. 前と同じ文字が続いたら、前後と違う文字に引き直す
  //    (前の文字が同じ種類なので、引き直しても「使う種類を必ず入れる」は崩れない)
  if (opts.noRepeat) {
    for (let i = 1; i < slots.length; i++) {
      if (slots[i].c !== slots[i - 1].c) continue;
      const next = slots[i + 1]?.c;
      const choices = [...all].filter((c) => c !== slots[i - 1].c && c !== next);
      if (choices.length === 0) return null;
      const c = choices[randomInt(choices.length)];
      slots[i] = { c, g: groupOf.get(c)! };
    }
  }
  return slots.map((s) => s.c).join("");
}

/**
 * 条件どおりのパスワードを作る。作れないときは ""。
 * 使う種類はそれぞれ必ず1文字以上含める
 * (「英大文字・数字を必ず含める」というよくある条件を満たすため)
 */
export function generatePassword(
  opts: PasswordOptions,
  randomInt: (max: number) => number = secureRandomInt,
): string {
  if (opts.length <= 0 || optionProblem(opts)) return "";
  const groups = charGroups(opts);
  // 使える文字が少なく、続けずに並べられない組み合わせは、引き直しても作れないことがある
  for (let attempt = 0; attempt < 50; attempt++) {
    const out = tryOnce(opts, groups, randomInt);
    if (out !== null) return out;
  }
  return "";
}

/** 推測にかかる手間の目安 (ビット) */
export function entropyBits(opts: PasswordOptions): number {
  if (opts.length <= 0 || optionProblem(opts)) return 0;
  const groups = charGroups(opts);
  const size = groups.reduce((n, g) => n + g.chars.length, 0);
  if (size <= 1) return 0;
  const kinds = firstKinds(opts.first);
  const firstSize = kinds
    ? groups.filter((g) => kinds.includes(g.kind)).reduce((n, g) => n + g.chars.length, 0)
    : size;
  const rest = opts.noRepeat ? size - 1 : size;
  return Math.log2(firstSize) + (opts.length - 1) * Math.log2(rest);
}

export type Strength = "weak" | "fair" | "good" | "strong";

export function strengthOf(bits: number): Strength {
  if (bits < 40) return "weak";
  if (bits < 64) return "fair";
  if (bits < 100) return "good";
  return "strong";
}

const BOOL_KEYS = ["lower", "upper", "digits", "symbols", "noRepeat", "excludeAmbiguous"] as const;

/** 保存してあった設定として使えるか */
export function isPasswordOptions(v: unknown): v is PasswordOptions {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    BOOL_KEYS.every((k) => typeof o[k] === "boolean") &&
    typeof o.length === "number" &&
    Number.isFinite(o.length) &&
    typeof o.symbolSet === "string" &&
    typeof o.exclude === "string" &&
    (o.first === "any" || o.first === "letter" || o.first === "alnum")
  );
}
