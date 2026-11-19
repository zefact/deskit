/** JWT (JSON Web Token) の中身を読む。署名の検証はしない */

import { base64ToBytes } from "./base64";

export interface DecodedJwt {
  header: Record<string, unknown>;
  payload: unknown;
  signature: string;
}

function decodePart(part: string, label: string): unknown {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(base64ToBytes(part));
  } catch {
    throw new Error(`${label}を Base64URL としてデコードできません`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}が JSON ではありません`);
  }
}

export function decodeJwt(token: string): DecodedJwt {
  const t = token.trim().replace(/^Bearer\s+/i, "");
  const parts = t.split(".");
  if (parts.length === 5) throw new Error("暗号化された JWT (JWE) は読めません");
  if (parts.length !== 3) {
    throw new Error("JWT は「ヘッダー.ペイロード.署名」の3つを「.」でつないだ形です");
  }
  const header = decodePart(parts[0], "ヘッダー");
  if (typeof header !== "object" || header === null || Array.isArray(header)) {
    throw new Error("ヘッダーが JSON のオブジェクトではありません");
  }
  return {
    header: header as Record<string, unknown>,
    payload: decodePart(parts[1], "ペイロード"),
    signature: parts[2],
  };
}

export interface TimeClaim {
  key: "exp" | "iat" | "nbf";
  label: string;
  date: Date;
}

const TIME_CLAIMS = [
  ["iat", "発行日時"],
  ["nbf", "有効開始"],
  ["exp", "有効期限"],
] as const;

/** 日時を表すクレーム (exp / iat / nbf) を取り出す */
export function timeClaims(payload: unknown): TimeClaim[] {
  if (typeof payload !== "object" || payload === null) return [];
  const p = payload as Record<string, unknown>;
  const out: TimeClaim[] = [];
  for (const [key, label] of TIME_CLAIMS) {
    const v = p[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push({ key, label, date: new Date(v * 1000) });
    }
  }
  return out;
}

export type JwtStatus = "valid" | "expired" | "notYet" | "unknown";

export function jwtStatus(payload: unknown, now = Date.now()): JwtStatus {
  const claims = timeClaims(payload);
  const exp = claims.find((c) => c.key === "exp");
  const nbf = claims.find((c) => c.key === "nbf");
  if (nbf && nbf.date.getTime() > now) return "notYet";
  if (exp) return exp.date.getTime() <= now ? "expired" : "valid";
  return "unknown";
}
