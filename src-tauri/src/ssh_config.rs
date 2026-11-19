//! ~/.ssh/config の Host (別名) の一覧を読む。
//!
//! 複数の GitHub アカウントは、ふつう「Host github-work / HostName github.com /
//! IdentityFile ~/.ssh/id_work」のような別名で鍵を使い分けている。その別名を拾う

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshHost {
    /// Host に書いた名前 (git@<これ>:org/repo.git の部分)
    pub alias: String,
    pub host_name: Option<String>,
    pub user: Option<String>,
    pub port: Option<String>,
    pub identity_file: Option<String>,
    pub identities_only: Option<String>,
    /// ~/.ssh/config 本体に `Host 別名` と1つだけ書かれていて、このアプリで書き換えられるか
    /// (Include 先のファイルや `Host a b` の節は読むだけ)
    pub editable: bool,
}

/// 1行を「キーワード」と「値」に分ける (`Key value` と `Key=value` のどちらも読む)
pub(crate) fn split_line(line: &str) -> Option<(String, String)> {
    let t = line.trim();
    if t.is_empty() || t.starts_with('#') {
        return None;
    }
    let idx = t.find(|c: char| c.is_whitespace() || c == '=')?;
    let key = t[..idx].to_ascii_lowercase();
    let rest = t[idx..].trim_start_matches(|c: char| c.is_whitespace() || c == '=');
    let value = rest.trim().trim_matches('"').to_string();
    Some((key, value))
}

fn expand_home(p: &str, home: &Path) -> PathBuf {
    if let Some(rest) = p.strip_prefix("~/") {
        home.join(rest)
    } else {
        PathBuf::from(p)
    }
}

/// `*` と `?` だけのかんたんなワイルドカード
fn wildcard(pattern: &str, name: &str) -> bool {
    fn go(p: &[char], n: &[char]) -> bool {
        match (p.first(), n.first()) {
            (None, None) => true,
            (Some('*'), _) => go(&p[1..], n) || (!n.is_empty() && go(p, &n[1..])),
            (Some('?'), Some(_)) => go(&p[1..], &n[1..]),
            (Some(a), Some(b)) if a == b => go(&p[1..], &n[1..]),
            _ => false,
        }
    }
    let p: Vec<char> = pattern.chars().collect();
    let n: Vec<char> = name.chars().collect();
    go(&p, &n)
}

/// Include で読むファイル (ファイル名の部分のワイルドカードに対応)
fn include_files(pattern: &str, ssh_dir: &Path, home: &Path) -> Vec<PathBuf> {
    let p = expand_home(pattern, home);
    let p = if p.is_absolute() { p } else { ssh_dir.join(p) };
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
    if !name.contains(['*', '?']) {
        return vec![p];
    }
    let dir = p.parent().map(Path::to_path_buf).unwrap_or_default();
    let mut out: Vec<PathBuf> = std::fs::read_dir(&dir)
        .map(|rd| {
            rd.filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|f| f.file_name().and_then(|n| n.to_str()).is_some_and(|n| wildcard(&name, n)))
                .collect()
        })
        .unwrap_or_default();
    out.sort();
    out
}

/// 設定の文章から Host の一覧を作る。
/// ワイルドカード (`Host *` など) と Match の節は、特定の別名ではないので除く
pub fn parse(text: &str, ssh_dir: &Path, home: &Path, depth: u8, out: &mut Vec<SshHost>) {
    // いま読んでいる Host の節に書かれた別名 (out の中での位置)
    let mut current: Vec<usize> = Vec::new();
    for line in text.lines() {
        let Some((key, value)) = split_line(line) else {
            continue;
        };
        match key.as_str() {
            "host" => {
                current.clear();
                let editable = depth == 0 && value.split_whitespace().count() == 1;
                for alias in value.split_whitespace() {
                    if alias.contains(['*', '?', '!']) {
                        continue;
                    }
                    if out.iter().any(|h| h.alias == alias) {
                        continue;
                    }
                    out.push(SshHost {
                        alias: alias.to_string(),
                        host_name: None,
                        user: None,
                        port: None,
                        identity_file: None,
                        identities_only: None,
                        editable,
                    });
                    current.push(out.len() - 1);
                }
            }
            "match" => current.clear(),
            "include" if depth < 4 => {
                for pattern in value.split_whitespace() {
                    for f in include_files(pattern, ssh_dir, home) {
                        if let Ok(t) = std::fs::read_to_string(&f) {
                            parse(&t, ssh_dir, home, depth + 1, out);
                        }
                    }
                }
            }
            _ => {
                // ssh の設定は「最初に書いた値が使われる」ので、まだ無いときだけ入れる
                for &i in &current {
                    let h = &mut out[i];
                    let slot = match key.as_str() {
                        "hostname" => &mut h.host_name,
                        "user" => &mut h.user,
                        "port" => &mut h.port,
                        "identityfile" => &mut h.identity_file,
                        "identitiesonly" => &mut h.identities_only,
                        _ => continue,
                    };
                    if slot.is_none() {
                        *slot = Some(value.clone());
                    }
                }
            }
        }
    }
}

pub fn config_path() -> Result<PathBuf, String> {
    Ok(crate::cmd::home_dir()?.join(".ssh").join("config"))
}

/// ~/.ssh/config を読む (無ければ空)
pub fn load() -> Result<Vec<SshHost>, String> {
    let home = crate::cmd::home_dir()?;
    let path = config_path()?;
    let mut out = Vec::new();
    if let Ok(text) = std::fs::read_to_string(&path) {
        parse(&text, &home.join(".ssh"), &home, 0, &mut out);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_and_options() {
        let text = "\
Host *
  AddKeysToAgent yes

# 仕事用
Host github-work gh-work
  HostName github.com
  IdentityFile ~/.ssh/id_work
  User git
  IdentityFile ~/.ssh/ignored

Host=github-personal
  HostName=github.com
  IdentityFile \"~/.ssh/id personal\"

Match host foo
  User nobody

Host server
  HostName 10.0.0.1
  Port 2222
";
        let mut out = Vec::new();
        parse(text, Path::new("/tmp"), Path::new("/home/u"), 0, &mut out);
        let aliases: Vec<&str> = out.iter().map(|h| h.alias.as_str()).collect();
        assert_eq!(aliases, vec!["github-work", "gh-work", "github-personal", "server"]);
        assert_eq!(out[0].host_name.as_deref(), Some("github.com"));
        assert_eq!(out[0].identity_file.as_deref(), Some("~/.ssh/id_work"));
        assert_eq!(out[1].identity_file.as_deref(), Some("~/.ssh/id_work"));
        assert_eq!(out[2].identity_file.as_deref(), Some("~/.ssh/id personal"));
        assert_eq!(out[3].port.as_deref(), Some("2222"));
        // Match の節の User は、直前の Host に混ざらない
        assert_eq!(out[2].user, None);
        // 1つだけ書かれた Host だけが書き換えられる
        let editable: Vec<bool> = out.iter().map(|h| h.editable).collect();
        assert_eq!(editable, vec![false, false, true, true]);
    }

    #[test]
    fn include_with_wildcard() {
        let dir = tempfile::tempdir().unwrap();
        let ssh = dir.path().join(".ssh");
        std::fs::create_dir_all(ssh.join("conf.d")).unwrap();
        std::fs::write(ssh.join("conf.d/a.conf"), "Host inc-a\n  HostName github.com\n").unwrap();
        std::fs::write(ssh.join("conf.d/b.txt"), "Host inc-b\n").unwrap();
        let mut out = Vec::new();
        parse("Include conf.d/*.conf\nHost main\n", &ssh, dir.path(), 0, &mut out);
        let aliases: Vec<&str> = out.iter().map(|h| h.alias.as_str()).collect();
        assert_eq!(aliases, vec!["inc-a", "main"]);
        // Include 先は読むだけ
        assert!(!out[0].editable);
        assert!(out[1].editable);
    }

    #[test]
    fn wildcard_match() {
        assert!(wildcard("*.conf", "a.conf"));
        assert!(wildcard("a?c", "abc"));
        assert!(!wildcard("*.conf", "a.txt"));
    }
}
