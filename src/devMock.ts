/**
 * ブラウザで画面だけ確かめるときの、Rust コマンドの見本の応答 (開発中のみ使う)。
 * 値はすべて架空のもの
 */

import type {
  AwsIdentity,
  AwsOverview,
  AwsSaveInput,
  GitOverview,
  HostInput,
  HostKeys,
  NameLookup,
  RepoInfo,
  SshKey,
  SshOverview,
  SshTest,
} from "./lib/accountTypes";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

const git: GitOverview = {
  gitVersion: "2.56.0",
  gitError: null,
  globalName: "Taro Yamada",
  globalEmail: "taro@example.com",
  credentialHelper: "osxkeychain",
  sshConfigPath: "~/.ssh/config",
  sshHosts: [
    { alias: "github-work", hostName: "github.com", user: "git", port: null, identityFile: "~/.ssh/id_ed25519_work", identitiesOnly: "yes", editable: true },
    { alias: "github-private", hostName: "github.com", user: "git", port: null, identityFile: "~/.ssh/id_ed25519_private", identitiesOnly: "yes", editable: true },
    { alias: "dev-server", hostName: "10.0.0.12", user: "ec2-user", port: null, identityFile: "~/.ssh/dev.pem", identitiesOnly: null, editable: true },
    // Include で読み込んだファイルにある Host (読むだけ)
    { alias: "gitlab-team", hostName: "gitlab.com", user: "git", port: null, identityFile: "~/.ssh/id_ed25519_team", identitiesOnly: null, editable: false },
  ],
};

let repo: RepoInfo = {
  root: "/Users/you/git/sample-app",
  branch: "main",
  localName: null,
  localEmail: null,
  remotes: [
    { name: "origin", url: "git@github-private:example-org/sample-app.git" },
    { name: "upstream", url: "https://github.com/upstream-org/sample-app" },
  ],
};

let aws: AwsOverview = {
  configPath: "~/.aws/config",
  credentialsPath: "~/.aws/credentials",
  selected: "dev",
  integration: {
    supported: true,
    shell: "zsh",
    rcPath: "~/.zshrc",
    installed: false,
    snippet:
      '# >>> deskit aws-profile >>>\n# Deskit の「AWSプロファイル」で選んだプロファイルを、新しく開いたターミナルで使う\nif [ -s "$HOME/.aws/deskit_profile" ]; then export AWS_PROFILE="$(cat "$HOME/.aws/deskit_profile")"; fi\n# <<< deskit aws-profile <<<',
  },
  profiles: [
    { name: "default", region: "ap-northeast-1", output: "json", accessKey: "AKIA••••DEF1", hasSecret: true, hasSessionToken: false, inConfig: true, inCredentials: true, kind: "keys", extra: [] },
    { name: "dev", region: "ap-northeast-1", output: "json", accessKey: "AKIA••••DEV2", hasSecret: true, hasSessionToken: false, inConfig: true, inCredentials: true, kind: "keys", extra: [] },
    { name: "prod", region: "ap-northeast-1", output: null, accessKey: "AKIA••••PRD3", hasSecret: true, hasSessionToken: false, inConfig: true, inCredentials: true, kind: "keys", extra: [] },
    { name: "client-a", region: "us-east-1", output: "table", accessKey: "AKIA••••CLA4", hasSecret: true, hasSessionToken: false, inConfig: true, inCredentials: true, kind: "keys", extra: [] },
  ],
};

const found = (value: string): NameLookup => ({ status: "found", value, detail: null });
const denied = (action: string): NameLookup => ({
  status: "denied",
  value: null,
  detail: `An error occurred (AccessDenied) when calling the operation: User is not authorized to perform: ${action}`,
});
const none: NameLookup = { status: "none", value: null, detail: null };

// 名前が両方読める / 別名だけ読める / どちらも読めない、の3とおりを見本にする
const identities: Record<string, AwsIdentity> = {
  default: {
    account: "111122223333",
    arn: "arn:aws:iam::111122223333:user/taro",
    userId: "AIDAEXAMPLE1",
    alias: found("example-main"),
    accountName: found("Example Main"),
  },
  dev: {
    account: "444455556666",
    arn: "arn:aws:iam::444455556666:user/taro-dev",
    userId: "AIDAEXAMPLE2",
    alias: found("example-dev"),
    accountName: denied("account:GetAccountInformation"),
  },
  prod: {
    account: "777788889999",
    arn: "arn:aws:iam::777788889999:user/deploy",
    userId: "AIDAEXAMPLE3",
    alias: none,
    accountName: denied("account:GetAccountInformation"),
  },
};

/** 「ホストの鍵を登録」で登録した接続先 */
const trustedHosts = new Set<string>();

/** Bitbucket が公開しているホスト鍵の指紋 */
const BITBUCKET_KEYS = [
  { keyType: "ED25519", fingerprint: "SHA256:ybgmFkzwOSotHTHLJgHO0QN8L0xErw6vd0VhFA9m3SM" },
  { keyType: "ECDSA", fingerprint: "SHA256:FC73VB6C4OQLSCrjEayhMp9UMxS97caD/Yyi2bhW/J0" },
  { keyType: "RSA", fingerprint: "SHA256:46OSHA1Rmj8E8ERTC6xkNcmGOw9oFxYr0WF6zWW8l1E" },
];

export async function mockInvoke(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
  await wait(150);
  switch (cmd) {
    case "git_overview":
      return structuredClone(git);
    case "git_ssh_test": {
      await wait(500);
      const host = String(args.host);
      if (host === "github-work") return { ok: true, user: "taro-work", message: "taro-work として認証されました", reason: null } satisfies SshTest;
      if (host === "github-private") return { ok: true, user: "taro-dev", message: "taro-dev として認証されました", reason: null } satisfies SshTest;
      // bitbucket.org は「初めての相手」として、ホストの鍵の登録を試せるようにする
      if (host === "bitbucket.org")
        return trustedHosts.has(host)
          ? ({ ok: true, user: "taro-bb", message: "taro-bb として認証されました", reason: null } satisfies SshTest)
          : ({
              ok: false,
              user: null,
              reason: "unknownHost",
              message:
                "このホストは、まだ known_hosts に登録されていません (初めて接続する相手です)。「ホストの鍵を登録」から、相手の鍵を確かめて登録できます",
            } satisfies SshTest);
      return { ok: false, user: null, reason: "denied", message: "公開鍵で認証できませんでした (鍵がサービスに登録されていない、ssh-agent に鍵が読み込まれていない など)" } satisfies SshTest;
    }
    case "git_host_keys": {
      await wait(600);
      const host = String(args.host);
      const hostName = git.sshHosts.find((h) => h.alias === host)?.hostName ?? host;
      const known = hostName === "bitbucket.org";
      return {
        host,
        hostName,
        port: 22,
        keys: known ? BITBUCKET_KEYS : [{ keyType: "ED25519", fingerprint: "SHA256:EXAMPLEexampleEXAMPLEexampleEXAMPLEexample00" }],
        service: known ? "Bitbucket" : null,
        verdict: known ? "verified" : "unknown",
        registered: 0,
        knownHostsPath: "~/.ssh/known_hosts",
      } satisfies HostKeys;
    }
    case "git_trust_host":
      await wait(400);
      trustedHosts.add(String(args.host));
      return 3;
    case "ssh_overview":
      return { hosts: structuredClone(git.sshHosts), configPath: git.sshConfigPath } satisfies SshOverview;
    case "ssh_list_keys":
      return [
        { path: "~/.ssh/id_ed25519_private", keyType: "ED25519", comment: "taro.dev@example.net" },
        { path: "~/.ssh/id_ed25519_work", keyType: "ED25519", comment: "taro@example.com" },
        { path: "~/.ssh/id_rsa", keyType: "RSA", comment: null },
      ] satisfies SshKey[];
    case "ssh_save_host": {
      const input = args.input as HostInput;
      const host = {
        alias: input.alias,
        hostName: input.hostName,
        user: input.user,
        port: input.port,
        identityFile: input.identityFile,
        identitiesOnly: input.identitiesOnly ? "yes" : null,
        editable: true,
      };
      if (args.isNew) {
        if (git.sshHosts.some((h) => h.alias === input.alias)) throw `「${input.alias}」という別名は、もうあります`;
        git.sshHosts.push(host);
      } else {
        git.sshHosts = git.sshHosts.map((h) => (h.alias === input.alias ? host : h));
      }
      return null;
    }
    case "ssh_delete_host":
      git.sshHosts = git.sshHosts.filter((h) => h.alias !== args.alias);
      return null;
    case "git_set_global_identity":
      git.globalName = String(args.name);
      git.globalEmail = String(args.email);
      return null;
    case "git_inspect_repo":
      return structuredClone(repo);
    case "git_apply_repo": {
      const remotes = args.remotes as { name: string; url: string }[];
      repo = {
        ...repo,
        localName: String(args.name),
        localEmail: String(args.email),
        remotes: repo.remotes.map((r) => remotes.find((x) => x.name === r.name) ?? r),
      };
      return structuredClone(repo);
    }
    case "git_clear_repo_identity":
      repo = { ...repo, localName: null, localEmail: null };
      return structuredClone(repo);
    case "aws_overview":
      return structuredClone(aws);
    case "aws_cli_version":
      return "aws-cli/2.39.7";
    case "aws_identity": {
      await wait(700);
      const id = identities[String(args.profile)];
      if (!id) throw "An error occurred (InvalidClientTokenId) when calling the GetCallerIdentity operation: The security token included in the request is invalid.";
      return id;
    }
    case "aws_select_profile": {
      const n = args.name as string | null;
      aws = { ...aws, selected: !n || n === "default" ? null : n };
      return structuredClone(aws);
    }
    case "aws_save_profile": {
      const input = args.input as AwsSaveInput;
      const profiles = aws.profiles.filter((p) => p.name !== input.original);
      profiles.push({
        name: input.name,
        region: input.region || null,
        output: input.output || null,
        accessKey: input.accessKeyId ? `${input.accessKeyId.slice(0, 4)}••••${input.accessKeyId.slice(-4)}` : "AKIA••••XXXX",
        hasSecret: true,
        hasSessionToken: false,
        inConfig: true,
        inCredentials: true,
        kind: "keys",
        extra: [],
      });
      aws = { ...aws, profiles };
      return structuredClone(aws);
    }
    case "aws_delete_profile":
      aws = { ...aws, profiles: aws.profiles.filter((p) => p.name !== args.name) };
      return structuredClone(aws);
    case "aws_install_integration":
      aws = { ...aws, integration: { ...aws.integration, installed: true } };
      return structuredClone(aws);
    case "aws_uninstall_integration":
      aws = { ...aws, integration: { ...aws.integration, installed: false } };
      return structuredClone(aws);
    default:
      throw `見本の応答がありません: ${cmd}`;
  }
}
