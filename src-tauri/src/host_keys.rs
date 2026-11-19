//! SSH のホスト鍵 (~/.ssh/known_hosts) の確認と登録。
//!
//! 初めて接続する相手は、ssh が「本当にその相手か」を確かめるための鍵をまだ持っていない。
//! ターミナルなら `ssh -T` のときに yes と答えるところを、アプリでは
//! 相手の鍵を取ってきて指紋を見せ、公式に公開されている指紋と照らし合わせてから登録する

use crate::cmd::{self, command, run};
use crate::git_accounts::{backup_dir, check_host};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, STANDARD_NO_PAD};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::Duration;

const SSH_G_TIMEOUT: Duration = Duration::from_secs(10);
const SCAN_TIMEOUT: Duration = Duration::from_secs(25);

const GITHUB: &[&str] = &[
    "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU",
    "SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM",
    "SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s",
];
const GITLAB: &[&str] = &[
    "SHA256:eUXGGm1YGsMAS7vkcx6JOJdOGHPem5gQp4taiCfCLB8",
    "SHA256:HbW3g8zUjNSksFbqTiUWPWg2Bq1x8xdGUrliXFzSnUw",
    "SHA256:ROQFvPThGrW4RuWLoL9tq9I9zJ42fK4XywyRtbOz/EQ",
];
const BITBUCKET: &[&str] = &[
    "SHA256:ybgmFkzwOSotHTHLJgHO0QN8L0xErw6vd0VhFA9m3SM",
    "SHA256:FC73VB6C4OQLSCrjEayhMp9UMxS97caD/Yyi2bhW/J0",
    "SHA256:46OSHA1Rmj8E8ERTC6xkNcmGOw9oFxYr0WF6zWW8l1E",
];

/// 各サービスが公式ドキュメントで公開しているホスト鍵の指紋 (SHA256)。
/// 443番ポートで受け付ける別の入り口 (ssh.github.com など) も同じ鍵を使う
const OFFICIAL: &[(&str, &str, &[&str])] = &[
    ("github.com", "GitHub", GITHUB),
    ("ssh.github.com", "GitHub", GITHUB),
    ("gitlab.com", "GitLab", GITLAB),
    ("altssh.gitlab.com", "GitLab", GITLAB),
    ("bitbucket.org", "Bitbucket", BITBUCKET),
    ("altssh.bitbucket.org", "Bitbucket", BITBUCKET),
];

/// ssh が実際に使う接続先 (別名を ~/.ssh/config で解決したもの)
#[derive(Debug, PartialEq, Eq)]
struct Target {
    host_name: String,
    port: u16,
    /// known_hosts で使う名前 (HostKeyAlias があればそれ)
    key_name: String,
    known_hosts: PathBuf,
}

impl Target {
    /// known_hosts の行の先頭に書く名前 (22番以外は [host]:port の形)
    fn entry(&self) -> String {
        if self.port == 22 {
            self.key_name.clone()
        } else {
            format!("[{}]:{}", self.key_name, self.port)
        }
    }
}

/// `ssh -G 別名` の出力 (ssh が実際に使う設定) を読む
fn parse_ssh_g(text: &str, home: &Path) -> Result<Target, String> {
    let get = |key: &str| {
        text.lines().find_map(|l| {
            let (k, v) = l.split_once(' ')?;
            (k == key).then(|| v.trim().to_string())
        })
    };
    let host_name = get("hostname").filter(|h| !h.is_empty()).ok_or("接続先のホスト名を読み取れませんでした")?;
    let port = get("port").and_then(|p| p.parse().ok()).unwrap_or(22);
    let key_name = get("hostkeyalias").filter(|a| !a.is_empty() && a != "none").unwrap_or_else(|| host_name.clone());
    let known_hosts = get("userknownhostsfile")
        .and_then(|v| v.split_whitespace().next().map(str::to_string))
        .map(|p| match p.strip_prefix("~/") {
            Some(rest) => home.join(rest),
            None => PathBuf::from(p),
        })
        .unwrap_or_else(|| home.join(".ssh").join("known_hosts"));
    Ok(Target { host_name, port, key_name, known_hosts })
}

/// ssh-keyscan に渡してよいホスト名か (先頭の `-` でオプションとして読まれないようにする)
fn check_scan_host(host: &str) -> Result<(), String> {
    let ok = host.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | ':'));
    if ok {
        Ok(())
    } else {
        Err(format!("接続先のホスト名に使えない文字が含まれています: {host}"))
    }
}

async fn resolve(host: &str) -> Result<Target, String> {
    check_host(host)?;
    let mut c = command("ssh");
    c.args(["-G", host]);
    let out = run(c, "ssh", SSH_G_TIMEOUT).await?;
    if !out.success() {
        return Err(out.error_text());
    }
    let target = parse_ssh_g(&out.stdout, &cmd::home_dir()?)?;
    check_scan_host(&target.host_name)?;
    Ok(target)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ScannedKey {
    /// ssh-ed25519 / ecdsa-sha2-nistp256 / ssh-rsa など
    key_type: String,
    /// 鍵の本体 (base64)
    blob: String,
    fingerprint: String,
}

/// ssh-keygen -l と同じ形の指紋 (SHA256:… の base64 で、末尾の = は付けない)
fn fingerprint(blob: &[u8]) -> String {
    format!("SHA256:{}", STANDARD_NO_PAD.encode(Sha256::digest(blob)))
}

/// ssh-keyscan の出力 (「ホスト 種類 鍵」の行) を読む
fn parse_keyscan(text: &str) -> Vec<ScannedKey> {
    let mut out: Vec<ScannedKey> = Vec::new();
    for line in text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
        let mut parts = line.split_whitespace();
        let (Some(_host), Some(key_type), Some(blob)) = (parts.next(), parts.next(), parts.next()) else {
            continue;
        };
        if !(key_type.starts_with("ssh-") || key_type.starts_with("ecdsa-")) {
            continue;
        }
        let Ok(bytes) = STANDARD.decode(blob) else { continue };
        let key = ScannedKey { key_type: key_type.to_string(), blob: blob.to_string(), fingerprint: fingerprint(&bytes) };
        if !out.contains(&key) {
            out.push(key);
        }
    }
    out
}

async fn scan(t: &Target) -> Result<Vec<ScannedKey>, String> {
    let mut c = command("ssh-keyscan");
    c.args(["-T", "10", "-t", "ed25519,ecdsa,rsa", "-p", &t.port.to_string(), &t.host_name]);
    let out = run(c, "ssh-keyscan", SCAN_TIMEOUT).await?;
    let keys = parse_keyscan(&out.stdout);
    if keys.is_empty() {
        let why = out.error_text();
        return Err(if why.trim().is_empty() || why.lines().all(|l| l.starts_with('#')) {
            format!("{}:{} から鍵を取得できませんでした (ネットワークや接続先を確認してください)", t.host_name, t.port)
        } else {
            format!("{}:{} から鍵を取得できませんでした: {why}", t.host_name, t.port)
        });
    }
    Ok(keys)
}

/// 公式の指紋との照合結果: (サービス名, verified / mismatch / unknown)
fn verdict(host_name: &str, keys: &[ScannedKey]) -> (Option<&'static str>, &'static str) {
    match OFFICIAL.iter().find(|(h, _, _)| h.eq_ignore_ascii_case(host_name)) {
        None => (None, "unknown"),
        Some((_, service, prints)) => {
            let all = keys.iter().all(|k| prints.contains(&k.fingerprint.as_str()));
            (Some(*service), if all { "verified" } else { "mismatch" })
        }
    }
}

/// 鍵の種類の、画面に出す名前
pub(crate) fn type_label(key_type: &str) -> String {
    match key_type {
        "ssh-ed25519" => "ED25519".into(),
        "ssh-rsa" => "RSA".into(),
        t if t.starts_with("ecdsa-") => "ECDSA".into(),
        t => t.to_string(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKey {
    pub key_type: String,
    pub fingerprint: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeys {
    /// ~/.ssh/config の別名
    pub host: String,
    /// 実際の接続先
    pub host_name: String,
    pub port: u16,
    pub keys: Vec<HostKey>,
    /// 公式の指紋が分かるサービス (GitHub など)
    pub service: Option<&'static str>,
    /// verified: 公式の指紋と一致 / mismatch: 一致しない / unknown: 公式の指紋が分からない
    pub verdict: &'static str,
    /// すでに known_hosts に登録されている鍵の数
    pub registered: usize,
    pub known_hosts_path: String,
}

/// known_hosts のうち、この接続先の行
fn registered_lines<'a>(text: &'a str, entry: &str) -> Vec<&'a str> {
    text.lines()
        .filter(|l| {
            let l = l.trim();
            !l.starts_with('#') && l.split_whitespace().next().is_some_and(|names| names.split(',').any(|n| n == entry))
        })
        .collect()
}

/// 相手の鍵を取ってきて、指紋と照合結果を返す (まだ何も書き込まない)
#[tauri::command]
pub async fn git_host_keys(host: String) -> Result<HostKeys, String> {
    let t = resolve(&host).await?;
    let keys = scan(&t).await?;
    let (service, verdict) = verdict(&t.host_name, &keys);
    let current = std::fs::read_to_string(&t.known_hosts).unwrap_or_default();
    Ok(HostKeys {
        host,
        host_name: t.host_name.clone(),
        port: t.port,
        registered: registered_lines(&current, &t.entry()).len(),
        keys: keys
            .iter()
            .map(|k| HostKey { key_type: type_label(&k.key_type), fingerprint: k.fingerprint.clone() })
            .collect(),
        service,
        verdict,
        known_hosts_path: t.known_hosts.display().to_string(),
    })
}

/// known_hosts に足す行 (すでにある行は足さない)
fn lines_to_add(current: &str, entry: &str, keys: &[&ScannedKey]) -> Vec<String> {
    keys.iter()
        .map(|k| format!("{entry} {} {}", k.key_type, k.blob))
        .filter(|line| !current.lines().any(|l| l.trim() == line))
        .collect()
}

/// 画面で確かめた指紋の鍵を、known_hosts に登録する。
/// 確かめたあとで相手の鍵が変わっていないよう、もう一度取ってきて指紋を照らし合わせる
#[tauri::command]
pub async fn git_trust_host(app: tauri::AppHandle, host: String, fingerprints: Vec<String>) -> Result<usize, String> {
    let t = resolve(&host).await?;
    let keys = scan(&t).await?;
    if verdict(&t.host_name, &keys).1 == "mismatch" {
        return Err("公式に公開されている指紋と一致しないため、登録しません".into());
    }
    let chosen: Vec<&ScannedKey> = keys.iter().filter(|k| fingerprints.contains(&k.fingerprint)).collect();
    if chosen.is_empty() || chosen.len() != fingerprints.len() {
        return Err("確認したときと相手の鍵が変わりました。もう一度「ホストの鍵を登録」から確かめてください".into());
    }
    let current = std::fs::read_to_string(&t.known_hosts).unwrap_or_default();
    let add = lines_to_add(&current, &t.entry(), &chosen);
    if add.is_empty() {
        return Ok(0);
    }
    cmd::backup(&backup_dir(&app)?, &t.known_hosts, "known_hosts")?;
    let mut text = current;
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    for line in &add {
        text.push_str(line);
        text.push('\n');
    }
    cmd::write_atomic(&t.known_hosts, &text, false)?;
    Ok(add.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    // GitHub が公開している known_hosts の行 (鍵の本体)
    const GH_ED25519: &str = "AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl";

    #[test]
    fn fingerprint_matches_ssh_keygen() {
        let keys = parse_keyscan(&format!(
            "# github.com:22 SSH-2.0-babeld\ngithub.com ssh-ed25519 {GH_ED25519}\ngithub.com ssh-ed25519 {GH_ED25519}\nbroken line\n"
        ));
        assert_eq!(keys.len(), 1, "コメント・重複・壊れた行は除く");
        assert_eq!(keys[0].fingerprint, "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU");
        assert_eq!(verdict("github.com", &keys), (Some("GitHub"), "verified"));
        assert_eq!(verdict("GitHub.com", &keys).1, "verified");
        assert_eq!(verdict("git.example.co.jp", &keys), (None, "unknown"));
        // 公式の鍵と違う鍵は mismatch
        assert_eq!(verdict("bitbucket.org", &keys), (Some("Bitbucket"), "mismatch"));
    }

    #[test]
    fn reads_ssh_g() {
        let home = Path::new("/home/taro");
        let t = parse_ssh_g(
            "user git\nhostname github.com\nport 22\nuserknownhostsfile ~/.ssh/known_hosts ~/.ssh/known_hosts2\nhashknownhosts no\n",
            home,
        )
        .unwrap();
        assert_eq!(
            t,
            Target {
                host_name: "github.com".into(),
                port: 22,
                key_name: "github.com".into(),
                known_hosts: home.join(".ssh/known_hosts"),
            }
        );
        assert_eq!(t.entry(), "github.com");

        let t = parse_ssh_g("hostname ssh.github.com\nport 443\nhostkeyalias gh443\n", home).unwrap();
        assert_eq!(t.entry(), "[gh443]:443");
        assert_eq!(t.known_hosts, home.join(".ssh/known_hosts"));

        assert!(parse_ssh_g("port 22\n", home).is_err());
    }

    #[test]
    fn scan_host_names() {
        assert!(check_scan_host("github.com").is_ok());
        assert!(check_scan_host("10.0.0.1").is_ok());
        assert!(check_scan_host("-oProxyCommand=x").is_err());
        assert!(check_scan_host("a b").is_err());
    }

    /// 実際に GitHub・GitLab・Bitbucket から鍵を取ってきて、公式の指紋と一致するか (書き込みはしない)。
    /// `cargo test real_scan -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn real_scan() {
        for host in ["github.com", "gitlab.com", "bitbucket.org"] {
            let t = resolve(host).await.unwrap();
            let keys = scan(&t).await.unwrap();
            println!("{host}: {} keys -> {:?}", keys.len(), verdict(&t.host_name, &keys));
            assert_eq!(verdict(&t.host_name, &keys).1, "verified");
        }
    }

    #[test]
    fn adds_only_missing_lines() {
        let key = ScannedKey { key_type: "ssh-ed25519".into(), blob: GH_ED25519.into(), fingerprint: String::new() };
        let line = format!("github.com ssh-ed25519 {GH_ED25519}");
        assert_eq!(lines_to_add("", "github.com", &[&key]), vec![line.clone()]);
        assert!(lines_to_add(&format!("other.example ssh-rsa AAAA\n{line}\n"), "github.com", &[&key]).is_empty());
        assert_eq!(registered_lines(&format!("# comment\ngithub.com,1.2.3.4 ssh-rsa AAAA\n{line}\n[github.com]:443 ssh-rsa B\n"), "github.com").len(), 2);
    }
}
