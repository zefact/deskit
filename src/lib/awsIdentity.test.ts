import { describe, expect, it } from "vitest";
import { describePrincipal, formatAccountId } from "./awsIdentity";

describe("formatAccountId", () => {
  it("12桁は4桁ずつ区切る", () => {
    expect(formatAccountId("111122223333")).toBe("1111-2222-3333");
  });

  it("12桁の数字でなければそのまま", () => {
    expect(formatAccountId("1234")).toBe("1234");
    expect(formatAccountId("")).toBe("");
  });
});

describe("describePrincipal", () => {
  it("IAMユーザー (パスつきでも最後の名前)", () => {
    expect(describePrincipal("arn:aws:iam::111122223333:user/taro")).toEqual({ kind: "IAMユーザー", name: "taro" });
    expect(describePrincipal("arn:aws:iam::111122223333:user/dev/team/taro")).toEqual({ kind: "IAMユーザー", name: "taro" });
  });

  it("引き受けたロールとセッション名", () => {
    expect(describePrincipal("arn:aws:sts::111122223333:assumed-role/AdminRole/taro@example.com")).toEqual({
      kind: "ロール",
      name: "AdminRole",
      session: "taro@example.com",
    });
    expect(describePrincipal("arn:aws:sts::111122223333:assumed-role/AdminRole")).toEqual({
      kind: "ロール",
      name: "AdminRole",
      session: undefined,
    });
  });

  it("ルートユーザー・フェデレーションユーザー", () => {
    expect(describePrincipal("arn:aws:iam::111122223333:root")).toEqual({ kind: "ルートユーザー", name: "" });
    expect(describePrincipal("arn:aws:sts::111122223333:federated-user/taro")).toEqual({
      kind: "フェデレーションユーザー",
      name: "taro",
    });
  });

  it("読み取れない形は、そのまま名前に入れる", () => {
    expect(describePrincipal("arn:aws:sts::111122223333:something/else")).toEqual({ kind: "", name: "something/else" });
    expect(describePrincipal("not-an-arn")).toEqual({ kind: "", name: "not-an-arn" });
  });
});
