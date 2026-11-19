//! Git アカウントの確認と切り替え。
//!
//! - グローバル設定 (~/.gitconfig) の user.name / user.email を読み書きする
//! - SSH の別名ごとに、GitHub などへ「どのユーザーとして」つながるかを確かめる
//! - リポジトリごとの user.name / user.email と、リモートURL (どの別名を使うか) を切り替える
//!
//! アカウントの一覧 (表示名と、名前・メール・別名の組) は画面側で保存する

use crate::cmd::{self, check_plain, command, run};
use crate::ssh_config::{self, SshHost};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

const GIT_TIMEOUT: Duration = Duration::from_secs(15);
const SSH_TIMEOUT: Duration = Duration::from_secs(20);

pub(crate) fn backup_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups"))
}

/// `git config` で1つの値を読む (設定されていなければ None)
async fn git_get(args: &[&str]) -> Result<Option<String>, String> {
    let mut c = command("git");
    c.args(args);
    let out = run(c, "git", GIT_TIMEOUT).await?;
    if out.success() {
        let v = out.stdout.trim().to_string();
        Ok(if v.is_empty() { None } else { Some(v) })
    } else if out.code == Some(1) {
        // 「その設定は無い」
        Ok(None)
    } else {
        Err(out.error_text())
    }
}

async fn git_run(args: &[&str]) -> Result<String, String> {
    let mut c = command("git");
    c.args(args);
    let out = run(c, "git", GIT_TIMEOUT).await?;
    if out.success() {
        Ok(out.stdout)
    } else {
        Err(out.error_text())
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitOverview {
    pub git_version: Option<String>,
    pub git_error: Option<String>,
    pub global_name: Option<String>,
    pub global_email: Option<String>,
    /// HTTPS の認証情報の保存先 (credential.helper。osxkeychain・manager など)
    pub credential_helper: Option<String>,
    pub ssh_hosts: Vec<SshHost>,
    pub ssh_config_path: String,
}

#[tauri::command]
pub async fn git_overview() -> Result<GitOverview, String> {
    let ssh_hosts = ssh_config::load()?;
    let ssh_config_path = ssh_config::config_path()?.display().to_string();
    let version = git_run(&["--version"]).await;
    let (git_version, git_error) = match version {
        Ok(v) => (Some(v.trim().trim_start_matches("git version ").to_string()), None),
        Err(e) => (None, Some(e)),
    };
    let (global_name, global_email, credential_helper) = if git_version.is_some() {
        (
            git_get(&["config", "--global", "--get", "user.name"]).await?,
            git_get(&["config", "--global", "--get", "user.email"]).await?,
            // 読めなくても画面の表示が減るだけなので、エラーにはしない
            git_run(&["config", "--get-all", "credential.helper"]).await.ok().and_then(|t| credential_helpers(&t)),
        )
    } else {
        (None, None, None)
    };
    Ok(GitOverview {
        git_version,
        git_error,
        global_name,
        global_email,
        credential_helper,
        ssh_hosts,
        ssh_config_path,
    })
}

/// `git config --get-all credential.helper` の値を、実際に使われる順につなぐ。
/// 空の値は「それまでの設定を取り消す」意味なので、そこから数え直す
fn credential_helpers(text: &str) -> Option<String> {
    let mut list: Vec<&str> = Vec::new();
    for v in text.lines().map(str::trim) {
        if v.is_empty() {
            list.clear();
        } else {
            list.push(v);
        }
    }
    (!list.is_empty()).then(|| list.join(", "))
}

/// ssh の宛先として安全な名前か (先頭の `-` でオプションとして読まれないようにする)
pub(crate) fn check_host(host: &str) -> Result<(), String> {
    let ok = !host.is_empty()
        && host.len() <= 253
        && host.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if ok {
        Ok(())
    } else {
        Err(format!("ホスト名として使えない文字が含まれています: {host}"))
    }
}

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshTest {
    pub ok: bool,
    /// 認証されたユーザー名 (GitHub / GitLab / Bitbucket)
    pub user: Option<String>,
    pub message: String,
    /// 失敗の種類。画面で次の手 (ホストの鍵の登録など) を出すのに使う。
    /// unknownHost: 初めての相手で鍵が未登録 / hostChanged: 記録と違う鍵 /
    /// denied: 公開鍵で認証できない / dns: 名前を解決できない / network: つながらない / other
    pub reason: Option<&'static str>,
}

fn between<'a>(text: &'a str, start: &str, end: &[char]) -> Option<&'a str> {
    let i = text.find(start)? + start.len();
    let rest = &text[i..];
    let j = rest.find(end).unwrap_or(rest.len());
    let s = rest[..j].trim();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// `ssh -T git@host` の返事を読む
fn interpret_ssh(text: &str, host: &str) -> SshTest {
    // GitHub: "Hi octocat! You've successfully authenticated, but GitHub does not provide shell access."
    // GitLab: "Welcome to GitLab, @octocat!"
    // Bitbucket (以前): "authenticated via ssh key. ... logged in as octocat."
    let user = between(text, "Hi ", &['!'])
        .or_else(|| between(text, "Welcome to GitLab, @", &['!']))
        .or_else(|| between(text, "logged in as ", &[' ', '.', '\n']));
    if let Some(u) = user {
        return SshTest {
            ok: true,
            user: Some(u.to_string()),
            message: format!("{u} として認証されました"),
            reason: None,
        };
    }
    // 認証には成功したが、ユーザー名を返さない応答
    // Bitbucket (いま): "authenticated via ssh key.\n\nYou can use git to connect to Bitbucket. Shell access is disabled"
    // Azure DevOps: "remote: Shell access is not supported."
    let service = if text.contains("authenticated via") || text.contains("You can use git to connect to Bitbucket") {
        Some("Bitbucket")
    } else if text.contains("Shell access is not supported") {
        Some("Azure DevOps")
    } else {
        None
    };
    if let Some(service) = service {
        return SshTest {
            ok: true,
            user: None,
            message: format!(
                "{service} に接続できます ({service} は応答にユーザー名を含めないため、どのアカウントかは表示できません)"
            ),
            reason: None,
        };
    }
    let (reason, message) = if text.contains("REMOTE HOST IDENTIFICATION HAS CHANGED") {
        // 記録と違う鍵。なりすましの可能性もあるので、アプリからは登録し直さない
        (
            "hostChanged",
            format!(
                "{host} の接続先の鍵が、known_hosts に記録されている鍵と違うため、接続を止めました。\
                 なりすましの可能性もあります。サービスが鍵を変えたと確かめられた場合だけ、\
                 ターミナルで `ssh-keygen -R ホスト名` を実行して古い記録を消してから、登録し直してください"
            ),
        )
    } else if text.contains("Permission denied") {
        (
            "denied",
            "公開鍵で認証できませんでした (鍵がサービスに登録されていない、ssh-agent に鍵が読み込まれていない など)".to_string(),
        )
    } else if text.contains("Host key verification failed")
        || text.contains("host key is known for")
        || text.contains("No RSA host key is known")
    {
        (
            "unknownHost",
            "このホストは、まだ known_hosts に登録されていません (初めて接続する相手です)。\
             「ホストの鍵を登録」から、相手の鍵を確かめて登録できます"
                .to_string(),
        )
    } else if text.contains("Could not resolve hostname") {
        ("dns", "ホスト名を解決できません (ネットワークや HostName の設定を確認してください)".to_string())
    } else if text.contains("timed out") || text.contains("Connection refused") {
        ("network", "接続できませんでした (ネットワークを確認してください)".to_string())
    } else {
        let last: Vec<&str> = text
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with("Warning:"))
            .collect();
        let message = if last.is_empty() {
            "応答からユーザー名を読み取れませんでした".to_string()
        } else {
            last[last.len().saturating_sub(2)..].join(" / ")
        };
        ("other", message)
    };
    SshTest {
        ok: false,
        user: None,
        message,
        reason: Some(reason),
    }
}

/// SSH の別名で接続して、どのユーザーとして認証されるかを確かめる。
/// パスワードの入力待ちで止まらないよう BatchMode にする (未登録のホスト鍵も自動では受け入れない)
#[tauri::command]
pub async fn git_ssh_test(host: String) -> Result<SshTest, String> {
    check_host(&host)?;
    let mut c = command("ssh");
    c.args([
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        &format!("git@{host}"),
    ]);
    let out = run(c, "ssh", SSH_TIMEOUT).await?;
    // GitHub は認証に成功しても終了コード 1 を返すので、終了コードではなく文面で判断する
    Ok(interpret_ssh(&format!("{}\n{}", out.stdout, out.stderr), &host))
}

#[tauri::command]
pub async fn git_set_global_identity(app: tauri::AppHandle, name: String, email: String) -> Result<(), String> {
    check_plain(&name, "名前")?;
    check_plain(&email, "メールアドレス")?;
    let gitconfig = cmd::home_dir()?.join(".gitconfig");
    cmd::backup(&backup_dir(&app)?, &gitconfig, "gitconfig")?;
    git_run(&["config", "--global", "user.name", name.trim()]).await?;
    git_run(&["config", "--global", "user.email", email.trim()]).await?;
    Ok(())
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Remote {
    pub name: String,
    pub url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub root: String,
    pub branch: Option<String>,
    pub local_name: Option<String>,
    pub local_email: Option<String>,
    pub remotes: Vec<Remote>,
}

/// `git remote -v` の出力から、取得 (fetch) 用のURLを読む
fn parse_remotes(text: &str) -> Vec<Remote> {
    let mut out: Vec<Remote> = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let (Some(name), Some(url), Some(kind)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        if kind == "(fetch)" && !out.iter().any(|r| r.name == name) {
            out.push(Remote {
                name: name.to_string(),
                url: url.to_string(),
            });
        }
    }
    out
}

fn path_arg(path: &str) -> Result<&str, String> {
    if path.trim().is_empty() || !Path::new(path).is_dir() {
        return Err("フォルダが見つかりません".into());
    }
    Ok(path)
}

async fn inspect(path: &str) -> Result<RepoInfo, String> {
    let path = path_arg(path)?;
    let root = git_run(&["-C", path, "rev-parse", "--show-toplevel"])
        .await
        .map_err(|_| "Git のリポジトリではありません (git init / git clone したフォルダを選んでください)".to_string())?
        .trim()
        .to_string();
    let r = root.as_str();
    let branch = git_get(&["-C", r, "symbolic-ref", "--short", "-q", "HEAD"]).await.ok().flatten();
    let local_name = git_get(&["-C", r, "config", "--local", "--get", "user.name"]).await?;
    let local_email = git_get(&["-C", r, "config", "--local", "--get", "user.email"]).await?;
    let remotes = parse_remotes(&git_run(&["-C", r, "remote", "-v"]).await?);
    Ok(RepoInfo {
        root,
        branch,
        local_name,
        local_email,
        remotes,
    })
}

#[tauri::command]
pub async fn git_inspect_repo(path: String) -> Result<RepoInfo, String> {
    inspect(&path).await
}

/// リポジトリの設定ファイル (.git/config) の控えを取る
async fn backup_repo_config(app: &tauri::AppHandle, root: &str) -> Result<(), String> {
    let common = git_run(&["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"]).await?;
    let config = PathBuf::from(common.trim()).join("config");
    cmd::backup(&backup_dir(app)?, &config, "repo-config")?;
    Ok(())
}

fn check_remote(r: &Remote) -> Result<(), String> {
    let name_ok = !r.name.is_empty()
        && !r.name.starts_with('-')
        && r.name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'));
    if !name_ok {
        return Err(format!("リモート名として使えません: {}", r.name));
    }
    check_plain(&r.url, "リモートURL")?;
    if r.url.starts_with('-') || r.url.chars().any(char::is_whitespace) {
        return Err(format!("リモートURLとして使えません: {}", r.url));
    }
    Ok(())
}

/// リポジトリにアカウントを当てはめる (名前・メールをローカル設定にし、リモートURLを書き換える)
#[tauri::command]
pub async fn git_apply_repo(
    app: tauri::AppHandle,
    path: String,
    name: String,
    email: String,
    remotes: Vec<Remote>,
) -> Result<RepoInfo, String> {
    check_plain(&name, "名前")?;
    check_plain(&email, "メールアドレス")?;
    for r in &remotes {
        check_remote(r)?;
    }
    let info = inspect(&path).await?;
    let root = info.root.as_str();
    backup_repo_config(&app, root).await?;
    git_run(&["-C", root, "config", "--local", "user.name", name.trim()]).await?;
    git_run(&["-C", root, "config", "--local", "user.email", email.trim()]).await?;
    for r in &remotes {
        git_run(&["-C", root, "remote", "set-url", &r.name, &r.url]).await?;
    }
    inspect(root).await
}

/// リポジトリのローカル設定の名前・メールを消して、グローバル設定に任せる
#[tauri::command]
pub async fn git_clear_repo_identity(app: tauri::AppHandle, path: String) -> Result<RepoInfo, String> {
    let info = inspect(&path).await?;
    let root = info.root.as_str();
    backup_repo_config(&app, root).await?;
    for key in ["user.name", "user.email"] {
        // 設定が無いとき (終了コード 5) は気にしない
        let mut c = command("git");
        c.args(["-C", root, "config", "--local", "--unset-all", key]);
        run(c, "git", GIT_TIMEOUT).await?;
    }
    inspect(root).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ssh_replies() {
        let gh = interpret_ssh(
            "Hi octo-cat! You've successfully authenticated, but GitHub does not provide shell access.",
            "github-work",
        );
        assert_eq!(gh.user.as_deref(), Some("octo-cat"));
        assert!(gh.ok);
        assert_eq!(
            interpret_ssh("Welcome to GitLab, @taro!", "gitlab.com").user.as_deref(),
            Some("taro")
        );
        assert_eq!(
            interpret_ssh("authenticated via ssh key.\n\nYou can use git to connect to Bitbucket. Shell access is disabled\nlogged in as hanako.", "bitbucket.org")
                .user
                .as_deref(),
            Some("hanako")
        );
        // いまの Bitbucket は、成功してもユーザー名を返さない
        let bb = interpret_ssh(
            "authenticated via ssh key.\n\nYou can use git to connect to Bitbucket. Shell access is disabled\n",
            "bitbucket.org",
        );
        assert!(bb.ok);
        assert_eq!(bb.user, None);
        assert_eq!(bb.reason, None);
        assert!(bb.message.contains("Bitbucket に接続できます"));
        let azure = interpret_ssh("remote: Shell access is not supported.\nshell request failed on channel 0\n", "ssh.dev.azure.com");
        assert!(azure.ok);
        let denied = interpret_ssh("git@github.com: Permission denied (publickey).", "github.com");
        assert!(!denied.ok);
        assert!(denied.message.contains("公開鍵"));
        assert_eq!(denied.reason, Some("denied"));
        let unknown = interpret_ssh(
            "No ED25519 host key is known for bitbucket.org and you have requested strict checking.\nHost key verification failed.",
            "bitbucket.org",
        );
        assert_eq!(unknown.reason, Some("unknownHost"));
        assert!(unknown.message.contains("ホストの鍵を登録"));
        let changed = interpret_ssh(
            "@@@@@@@@\n@    WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!     @\n@@@@@@@@\nHost key verification failed.",
            "github.com",
        );
        assert_eq!(changed.reason, Some("hostChanged"));
    }

    #[test]
    fn helpers() {
        assert_eq!(credential_helpers("osxkeychain\n").as_deref(), Some("osxkeychain"));
        assert_eq!(credential_helpers("osxkeychain\n\nmanager\n").as_deref(), Some("manager"));
        assert_eq!(credential_helpers("cache\nstore\n").as_deref(), Some("cache, store"));
        assert_eq!(credential_helpers(""), None);
    }

    #[test]
    fn host_names() {
        assert!(check_host("github-work").is_ok());
        assert!(check_host("github.com").is_ok());
        assert!(check_host("-oProxyCommand=x").is_err());
        assert!(check_host("a b").is_err());
        assert!(check_host("").is_err());
    }

    #[test]
    fn remotes() {
        let text = "origin\tgit@github-work:org/app.git (fetch)\norigin\tgit@github-work:org/app.git (push)\nupstream\thttps://github.com/up/app.git (fetch)\n";
        assert_eq!(
            parse_remotes(text),
            vec![
                Remote { name: "origin".into(), url: "git@github-work:org/app.git".into() },
                Remote { name: "upstream".into(), url: "https://github.com/up/app.git".into() },
            ]
        );
        assert!(check_remote(&Remote { name: "origin".into(), url: "git@a:b/c.git".into() }).is_ok());
        assert!(check_remote(&Remote { name: "-x".into(), url: "u".into() }).is_err());
        assert!(check_remote(&Remote { name: "o".into(), url: "--upload-pack=x".into() }).is_err());
    }

    /// 実際の git でリポジトリを作り、アカウントの当てはめ・解除を確かめる
    #[tokio::test(flavor = "current_thread")]
    async fn inspect_real_repo() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().to_str().unwrap();
        git_run(&["-C", p, "init", "-q"]).await.unwrap();
        git_run(&["-C", p, "remote", "add", "origin", "https://github.com/org/app.git"]).await.unwrap();
        let info = inspect(p).await.unwrap();
        assert_eq!(info.local_name, None);
        assert_eq!(info.remotes[0].url, "https://github.com/org/app.git");

        // AppHandle を使わない部分 (設定とリモートの書き換え) を直接確かめる
        git_run(&["-C", &info.root, "config", "--local", "user.name", "Work User"]).await.unwrap();
        git_run(&["-C", &info.root, "remote", "set-url", "origin", "git@github-work:org/app.git"]).await.unwrap();
        let after = inspect(p).await.unwrap();
        assert_eq!(after.local_name.as_deref(), Some("Work User"));
        assert_eq!(after.remotes[0].url, "git@github-work:org/app.git");

        assert!(inspect(dir.path().join("none").to_str().unwrap()).await.is_err());
        let plain = tempfile::tempdir().unwrap();
        let err = inspect(plain.path().to_str().unwrap()).await.err().unwrap();
        assert!(err.contains("リポジトリではありません"));
    }
}
