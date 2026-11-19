/**
 * 登録した Gitアカウントの一覧 (アプリの中に保存する)。
 * 「SSH接続」でも、どの別名をどのアカウントが使っているかを出すために読む
 */

import type { GitAccount } from "../lib/accountTypes";
import { isHttps } from "../lib/gitRemote";
import { createStore } from "../store";

const isAccountList = (v: unknown): v is GitAccount[] =>
  Array.isArray(v) &&
  v.every(
    (a) =>
      a && typeof a === "object" && ["id", "label", "name", "email", "sshHost"].every((k) => typeof (a as Record<string, unknown>)[k] === "string"),
  );

export const gitAccountsStore = createStore<GitAccount[]>("git-accounts", [], isAccountList);

/** この別名を使っている (SSH の) アカウント */
export const accountsUsing = (accounts: GitAccount[], alias: string) =>
  accounts.filter((a) => !isHttps(a) && a.sshHost === alias);
