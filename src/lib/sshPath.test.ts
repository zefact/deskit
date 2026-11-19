import { describe, expect, it } from "vitest";
import { privateKeyPath, toConfigPath } from "./sshPath";

describe("toConfigPath", () => {
  it("ホームの中は ~/ で書く", () => {
    expect(toConfigPath("/Users/taro/.ssh/id_ed25519_work", "/Users/taro")).toBe("~/.ssh/id_ed25519_work");
    expect(toConfigPath("/Users/taro/keys/server.pem", "/Users/taro/")).toBe("~/keys/server.pem");
  });

  it("ホームの外や、名前が似ているだけのフォルダはそのまま", () => {
    expect(toConfigPath("/opt/keys/id_rsa", "/Users/taro")).toBe("/opt/keys/id_rsa");
    expect(toConfigPath("/Users/taro2/.ssh/id_rsa", "/Users/taro")).toBe("/Users/taro2/.ssh/id_rsa");
  });

  it("Windows のパスは区切りを / にする", () => {
    expect(toConfigPath("C:\\Users\\taro\\.ssh\\id_ed25519", "C:\\Users\\taro")).toBe("~/.ssh/id_ed25519");
    expect(toConfigPath("c:\\users\\TARO\\.ssh\\id_ed25519", "C:\\Users\\taro")).toBe("~/.ssh/id_ed25519");
    expect(toConfigPath("D:\\keys\\id_rsa", "C:\\Users\\taro")).toBe("D:/keys/id_rsa");
  });
});

describe("privateKeyPath", () => {
  it(".pub を外す", () => {
    expect(privateKeyPath("~/.ssh/id_ed25519.pub")).toEqual({ path: "~/.ssh/id_ed25519", wasPublic: true });
    expect(privateKeyPath("~/.ssh/id_ed25519")).toEqual({ path: "~/.ssh/id_ed25519", wasPublic: false });
  });
});
