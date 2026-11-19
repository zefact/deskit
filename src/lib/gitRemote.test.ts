import { describe, expect, it } from "vitest";
import {
  accountOfRemote,
  maskUrl,
  parseRemote,
  planRemoteChanges,
  realHost,
  serviceName,
} from "./gitRemote";

const hosts = [
  { alias: "github-work", hostName: "github.com" },
  { alias: "github-me", hostName: "github.com" },
  { alias: "server", hostName: "10.0.0.1" },
];
const work = { id: "w", sshHost: "github-work" };
const me = { id: "m", sshHost: "github-me" };
const plain = { id: "p", sshHost: "github.com" };
// HTTPS のアカウント (URLにユーザー名を入れて使い分ける)
const webWork = { id: "hw", sshHost: "", protocol: "https" as const, httpsUser: "taro-work", httpsHost: "github.com" };
const webMe = { id: "hm", sshHost: "", protocol: "https" as const, httpsUser: "taro-dev", httpsHost: "github.com" };

describe("parseRemote", () => {
  it("いろいろな形を読む", () => {
    expect(parseRemote("git@github-work:org/app.git")).toEqual({
      kind: "scp",
      user: "git",
      host: "github-work",
      path: "org/app.git",
    });
    expect(parseRemote("ssh://git@github.com:22/org/app.git")).toMatchObject({ kind: "ssh", host: "github.com", port: "22" });
    expect(parseRemote("https://github.com/org/app")).toMatchObject({ kind: "https", host: "github.com", path: "org/app" });
    expect(parseRemote("https://token@github.com/org/app.git/")).toMatchObject({ path: "org/app.git" });
    expect(parseRemote("https://taro-work@github.com/org/app.git")).toMatchObject({ user: "taro-work" });
    // 「ユーザー名:トークン@」のトークンは読まない
    expect(parseRemote("https://taro:ghp_secret@github.com/org/app.git")?.user).toBe("taro");
    expect(parseRemote("C:\\repo")).toBeNull();
    expect(parseRemote("../local/repo")).toBeNull();
  });

  it("別名の本当の接続先", () => {
    expect(realHost("github-work", hosts)).toBe("github.com");
    expect(realHost("GitHub.com", hosts)).toBe("github.com");
  });
});

describe("accountOfRemote", () => {
  it("別名からアカウントを見つける", () => {
    expect(accountOfRemote("git@github-work:org/app.git", [work, me])).toBe(work);
    expect(accountOfRemote("git@github.com:org/app.git", [work, plain])).toBe(plain);
    expect(accountOfRemote("https://github.com/org/app.git", [work, plain])).toBeUndefined();
  });

  it("HTTPS はURLのユーザー名から見つける", () => {
    expect(accountOfRemote("https://taro-work@github.com/org/app.git", [work, webWork, webMe])).toBe(webWork);
    expect(accountOfRemote("https://Taro-Dev@github.com/org/app.git", [webWork, webMe])).toBe(webMe);
    // ユーザー名の無い HTTPS・別のサービス・SSH の別名は、HTTPS のアカウントに当てはめない
    expect(accountOfRemote("https://github.com/org/app.git", [webWork])).toBeUndefined();
    expect(accountOfRemote("https://taro-work@gitlab.com/org/app.git", [webWork])).toBeUndefined();
    expect(accountOfRemote("git@github-work:org/app.git", [webWork])).toBeUndefined();
  });
});

describe("planRemoteChanges", () => {
  const remotes = [
    { name: "origin", url: "git@github-work:org/app.git" },
    { name: "upstream", url: "https://github.com/up/app" },
    { name: "deploy", url: "git@server:srv/app.git" },
    { name: "gitlab", url: "git@gitlab.com:x/app.git" },
  ];

  it("同じサービスのリモートだけを別名に変える", () => {
    expect(planRemoteChanges(remotes, me, hosts)).toEqual([
      { name: "origin", from: "git@github-work:org/app.git", to: "git@github-me:org/app.git", change: null },
      { name: "upstream", from: "https://github.com/up/app", to: "git@github-me:up/app.git", change: "toSsh" },
    ]);
  });

  it("すでにそのアカウントなら変更なし", () => {
    expect(planRemoteChanges(remotes.slice(0, 1), work, hosts)).toEqual([]);
  });

  it("既定の github.com に戻す", () => {
    expect(planRemoteChanges(remotes.slice(0, 1), plain, hosts)[0].to).toBe("git@github.com:org/app.git");
  });

  it("HTTPS のアカウントでは、ユーザー名入りの HTTPS にする", () => {
    expect(planRemoteChanges(remotes, webMe, hosts)).toEqual([
      { name: "origin", from: "git@github-work:org/app.git", to: "https://taro-dev@github.com/org/app.git", change: "toHttps" },
      // HTTPS どうしはパスをそのまま使う (.git を足さない)
      { name: "upstream", from: "https://github.com/up/app", to: "https://taro-dev@github.com/up/app", change: null },
    ]);
    const web = [{ name: "origin", url: "https://taro-work@github.com/org/app.git" }];
    expect(planRemoteChanges(web, webMe, hosts)).toEqual([
      { name: "origin", from: "https://taro-work@github.com/org/app.git", to: "https://taro-dev@github.com/org/app.git", change: null },
    ]);
    expect(planRemoteChanges(web, webWork, hosts)).toEqual([]);
  });
});

describe("maskUrl", () => {
  it("URLの中のトークンを伏せる", () => {
    expect(maskUrl("https://taro:ghp_abc123@github.com/org/app.git")).toBe("https://taro:••••@github.com/org/app.git");
    expect(maskUrl("https://ghp_abc123@github.com/org/app.git")).toBe("https://••••@github.com/org/app.git");
    expect(maskUrl("https://oauth2:glpat-xyz@gitlab.com/g/app.git")).toBe("https://oauth2:••••@gitlab.com/g/app.git");
    // ユーザー名だけ・SSH はそのまま
    expect(maskUrl("https://taro-work@github.com/org/app.git")).toBe("https://taro-work@github.com/org/app.git");
    expect(maskUrl("git@github-work:org/app.git")).toBe("git@github-work:org/app.git");
  });
});

describe("serviceName", () => {
  it("サービスの名前", () => {
    expect(serviceName("github.com")).toBe("GitHub");
    expect(serviceName("GitLab.com")).toBe("GitLab");
    expect(serviceName("git.example.co.jp")).toBe("git.example.co.jp");
  });
});
