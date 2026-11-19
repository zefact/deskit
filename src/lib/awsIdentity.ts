/**
 * aws sts get-caller-identity の結果を、画面で読みやすい形にする。
 *
 * - Account: AWS アカウントの12桁の番号 (アカウントID)
 * - Arn: 認証された相手 (IAM ユーザー・引き受けたロール・ルートユーザーなど)
 */

/** 1234-5678-9012 の形 (AWS コンソールでの見え方にそろえる) */
export function formatAccountId(id: string): string {
  return /^\d{12}$/.test(id) ? `${id.slice(0, 4)}-${id.slice(4, 8)}-${id.slice(8)}` : id;
}

export interface Principal {
  /** 種類の表示名 (IAMユーザー・ロール など)。読み取れないときは空 */
  kind: string;
  /** ユーザー名・ロール名など */
  name: string;
  /** ロールを引き受けたときのセッション名 */
  session?: string;
}

/**
 * ARN から「誰として認証されたか」を取り出す。
 *  arn:aws:iam::123456789012:user/dev/taro              → IAMユーザー taro
 *  arn:aws:sts::123456789012:assumed-role/Admin/taro    → ロール Admin (セッション taro)
 *  arn:aws:iam::123456789012:root                       → ルートユーザー
 */
export function describePrincipal(arn: string): Principal {
  const resource = arn.split(":").slice(5).join(":");
  const [type, ...rest] = resource.split("/");
  switch (type) {
    case "user":
      return { kind: "IAMユーザー", name: rest[rest.length - 1] ?? "" };
    case "assumed-role":
      return { kind: "ロール", name: rest[0] ?? "", session: rest.slice(1).join("/") || undefined };
    case "federated-user":
      return { kind: "フェデレーションユーザー", name: rest.join("/") };
    case "root":
      return { kind: "ルートユーザー", name: "" };
    default:
      return { kind: "", name: resource || arn };
  }
}
