//! ~/.ssh/config の Host (別名) を追加・編集・削除する。
//!
//! ほかの行 (コメント・空行・ほかの Host・知らないオプション) はそのまま残し、
//! 書き換えるのは選んだ Host の節の、決まった項目の行だけにする。
//! 書き換えられるのは ~/.ssh/config 本体に `Host 別名` と1つだけ書かれた節。
//! Include で読み込んだファイルや、`Host a b` のように複数書かれた節は読むだけにする

use crate::cmd;
use crate::ssh_config::{self, split_line};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 画面から受け取る Host の内容
#[derive(Deserialize, Debug, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct HostInput {
    pub alias: String,
    pub host_name: String,
    pub user: Option<String>,
    pub port: Option<String>,
    pub identity_file: Option<String>,
    pub identities_only: bool,
}

/// ~/.ssh にある鍵 (公開鍵 .pub と組になっている秘密鍵)
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    /// ~/.ssh/id_ed25519_work のような、設定に書く形のパス
    pub path: String,
    pub key_type: String,
    /// 公開鍵の最後のコメント (ふつうはメールアドレス)
    pub comment: Option<String>,
}

const NEW_HOST_KEYS: [(&str, &str); 5] = [
    ("hostname", "HostName"),
    ("user", "User"),
    ("port", "Port"),
    ("identityfile", "IdentityFile"),
    ("identitiesonly", "IdentitiesOnly"),
];

fn is_valid_alias(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 64
        && s.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// 画面から受け取った値を確かめて、書き込む形 (値の並び) にする
fn values_of(h: &HostInput) -> Result<[Option<String>; 5], String> {
    if !is_valid_alias(h.alias.trim()) {
        return Err("別名は、英数字・ . ・ _ ・ - で入力してください (例: github-work)".into());
    }
    let host = h.host_name.trim();
    let host_ok = !host.is_empty()
        && host.len() <= 253
        && host.chars().next().is_some_and(|c| c.is_ascii_alphanumeric())
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'));
    if !host_ok {
        return Err("接続先を github.com のような形で入力してください".into());
    }
    let opt = |v: &Option<String>| v.as_deref().map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    let user = opt(&h.user);
    if let Some(u) = &user {
        if !u.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-')) || u.len() > 64 {
            return Err("ユーザーは、英数字・ . ・ _ ・ - で入力してください (GitHub などは git)".into());
        }
    }
    let port = opt(&h.port);
    if let Some(p) = &port {
        if !p.parse::<u16>().is_ok_and(|n| n > 0) {
            return Err("ポートは 1〜65535 の数で入力してください".into());
        }
    }
    let key = opt(&h.identity_file);
    if let Some(k) = &key {
        cmd::check_plain(k, "鍵ファイル")?;
        if k.contains('"') {
            return Err("鍵ファイルのパスに \" は使えません".into());
        }
    }
    // 空白を含むパスは "…" で囲む
    let key = key.map(|k| if k.contains(char::is_whitespace) { format!("\"{k}\"") } else { k });
    Ok([
        Some(host.to_string()),
        user,
        port,
        key,
        h.identities_only.then(|| "yes".to_string()),
    ])
}

/// 改行の形 (Windows で作ったファイルなら \r\n) を引き継ぐ
fn eol_of(text: &str) -> &'static str {
    if text.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    }
}

fn join_lines(lines: &[String], eol: &str) -> String {
    let mut out = lines.join(eol);
    if !out.is_empty() {
        out.push_str(eol);
    }
    out
}

fn leading_ws(line: &str) -> &str {
    &line[..line.len() - line.trim_start().len()]
}

/// その行が節の始まり (Host / Match) か
fn section_start(line: &str) -> bool {
    matches!(split_line(line), Some((k, _)) if k == "host" || k == "match")
}

/// ファイルの中で使われている字下げ (無ければ空白2つ)
fn indent_of(lines: &[String]) -> String {
    lines
        .iter()
        .find(|l| !l.trim().is_empty() && !leading_ws(l).is_empty() && split_line(l).is_some())
        .map(|l| leading_ws(l).to_string())
        .unwrap_or_else(|| "  ".into())
}

/// `Host 別名` の節の範囲 [始まり, 最後の設定の次の行)。
/// 節の最後のコメントや空行は、次の節の見出しのことが多いので含めない
fn block_range(lines: &[String], alias: &str) -> Result<(usize, usize), String> {
    for (i, line) in lines.iter().enumerate() {
        let Some((key, value)) = split_line(line) else { continue };
        if key != "host" {
            continue;
        }
        let patterns: Vec<&str> = value.split_whitespace().collect();
        if !patterns.contains(&alias) {
            continue;
        }
        if patterns.len() > 1 {
            return Err(format!(
                "「{alias}」は、ほかの名前といっしょに Host に書かれているため、ここでは書き換えられません。~/.ssh/config を直接編集してください"
            ));
        }
        let mut end = i + 1;
        for (j, l) in lines.iter().enumerate().skip(i + 1) {
            if section_start(l) {
                break;
            }
            if split_line(l).is_some() {
                end = j + 1;
            }
        }
        return Ok((i, end));
    }
    Err(format!(
        "~/.ssh/config に「{alias}」が見つかりません (Include で読み込んでいるファイルにあるときは、ここでは書き換えられません)"
    ))
}

/// 新しい Host をどこに入れるか。
/// ssh は「最初に見つかった値」を使うので、`Host *` や Match の節より前に入れる
/// (後ろに入れると `Host *` の IdentityFile などが先に効いてしまう)
fn insert_at(lines: &[String]) -> usize {
    let wild = lines.iter().position(|l| match split_line(l) {
        Some((k, v)) if k == "host" => v.split_whitespace().any(|p| p.contains(['*', '?', '!'])),
        Some((k, _)) => k == "match",
        None => false,
    });
    let Some(mut at) = wild else { return lines.len() };
    // すぐ上のコメント (その節の見出し) とは離さない
    while at > 0 && lines[at - 1].trim_start().starts_with('#') {
        at -= 1;
    }
    at
}

/// 新しい Host の節を足した文章
pub fn add_host(text: &str, h: &HostInput) -> Result<String, String> {
    let values = values_of(h)?;
    let eol = eol_of(text);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    let indent = indent_of(&lines);
    let mut block = vec![format!("Host {}", h.alias.trim())];
    for ((_, name), v) in NEW_HOST_KEYS.iter().zip(values) {
        if let Some(v) = v {
            block.push(format!("{indent}{name} {v}"));
        }
    }
    let at = insert_at(&lines);
    // 前後の節とのあいだに空行を1つ置く
    if at < lines.len() && !lines[at].trim().is_empty() {
        block.push(String::new());
    }
    if at > 0 && !lines[at - 1].trim().is_empty() {
        block.insert(0, String::new());
    }
    lines.splice(at..at, block);
    Ok(join_lines(&lines, eol))
}

/// 既にある Host の節の、決まった項目だけを書き換えた文章 (ほかの行はそのまま)
pub fn update_host(text: &str, h: &HostInput) -> Result<String, String> {
    let values = values_of(h)?;
    let eol = eol_of(text);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    let (start, end) = block_range(&lines, h.alias.trim())?;
    let mut block: Vec<String> = lines[start..end].to_vec();
    let indent = block
        .iter()
        .skip(1)
        .find(|l| split_line(l).is_some())
        .map(|l| leading_ws(l).to_string())
        .unwrap_or_else(|| indent_of(&lines));
    for ((key, name), value) in NEW_HOST_KEYS.iter().zip(values) {
        let found = block
            .iter()
            .enumerate()
            .skip(1)
            .find(|(_, l)| split_line(l).is_some_and(|(k, _)| k == *key))
            .map(|(i, _)| i);
        match (found, value) {
            (Some(i), Some(v)) => block[i] = format!("{}{name} {v}", leading_ws(&block[i])),
            (Some(i), None) => {
                block.remove(i);
            }
            (None, Some(v)) => block.push(format!("{indent}{name} {v}")),
            (None, None) => {}
        }
    }
    lines.splice(start..end, block);
    Ok(join_lines(&lines, eol))
}

/// Host の節を消した文章 (前後の空行が2つ続かないようにする)
pub fn delete_host(text: &str, alias: &str) -> Result<String, String> {
    let eol = eol_of(text);
    let mut lines: Vec<String> = text.lines().map(str::to_string).collect();
    let (start, end) = block_range(&lines, alias)?;
    lines.drain(start..end);
    let blank = |i: usize, lines: &[String]| lines.get(i).is_some_and(|l| l.trim().is_empty());
    if blank(start, &lines) && (start == 0 || blank(start - 1, &lines)) {
        lines.remove(start);
    } else if start == lines.len() && start > 0 && blank(start - 1, &lines) {
        lines.remove(start - 1);
    }
    Ok(join_lines(&lines, eol))
}

/// 公開鍵 (.pub) の中身から、種類とコメントを読む
fn read_pub(text: &str) -> Option<(String, Option<String>)> {
    let mut parts = text.split_whitespace();
    let key_type = parts.next()?;
    parts.next()?;
    let comment = parts.collect::<Vec<_>>().join(" ");
    Some((crate::host_keys::type_label(key_type), (!comment.is_empty()).then_some(comment)))
}

/// ~/.ssh の鍵の一覧 (公開鍵と組になっている秘密鍵だけ)
pub fn list_keys(ssh_dir: &Path) -> Vec<SshKey> {
    let Ok(rd) = std::fs::read_dir(ssh_dir) else { return Vec::new() };
    let mut out: Vec<SshKey> = rd
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "pub"))
        .filter_map(|pubf| {
            let private = pubf.with_extension("");
            if !private.is_file() {
                return None;
            }
            let name = private.file_name()?.to_str()?.to_string();
            let (key_type, comment) = std::fs::read_to_string(&pubf).ok().and_then(|t| read_pub(&t))?;
            Some(SshKey { path: format!("~/.ssh/{name}"), key_type, comment })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

/// 書き込む先 (dotfiles などでリンクにしているときは、リンク先のファイル)
fn target_path() -> Result<PathBuf, String> {
    let path = ssh_config::config_path()?;
    Ok(std::fs::canonicalize(&path).unwrap_or(path))
}

fn write(app: &tauri::AppHandle, path: &Path, before: Option<&str>, after: &str) -> Result<(), String> {
    if before == Some(after) {
        return Ok(());
    }
    cmd::backup(&crate::git_accounts::backup_dir(app)?, path, "ssh-config")?;
    if before.is_none() {
        // ~/.ssh も無いときは、本人だけが入れるフォルダとして作る
        if let Some(dir) = path.parent() {
            if !dir.exists() {
                std::fs::create_dir_all(dir).map_err(|e| format!("~/.ssh を作れませんでした: {e}"))?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
                }
            }
        }
    }
    // 新しく作るときは本人だけが読める権限に。既にあるファイルは今の権限を引き継ぐ
    cmd::write_atomic(path, after, before.is_none())
}

/// 「SSH接続」の画面に出す内容
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SshOverview {
    pub hosts: Vec<ssh_config::SshHost>,
    pub config_path: String,
}

#[tauri::command]
pub async fn ssh_overview() -> Result<SshOverview, String> {
    Ok(SshOverview {
        hosts: ssh_config::load()?,
        config_path: ssh_config::config_path()?.display().to_string(),
    })
}

#[tauri::command]
pub async fn ssh_list_keys() -> Result<Vec<SshKey>, String> {
    Ok(list_keys(&cmd::home_dir()?.join(".ssh")))
}

/// Host を追加する (`is_new`) か、既にある Host を書き換える
#[tauri::command]
pub async fn ssh_save_host(app: tauri::AppHandle, input: HostInput, is_new: bool) -> Result<(), String> {
    let path = target_path()?;
    let before = std::fs::read_to_string(&path).ok();
    let text = before.clone().unwrap_or_default();
    let after = if is_new {
        // Include 先も含めて、同じ別名が無いか確かめる
        if ssh_config::load()?.iter().any(|h| h.alias == input.alias.trim()) {
            return Err(format!("「{}」という別名は、もうあります", input.alias.trim()));
        }
        add_host(&text, &input)?
    } else {
        update_host(&text, &input)?
    };
    write(&app, &path, before.as_deref(), &after)
}

#[tauri::command]
pub async fn ssh_delete_host(app: tauri::AppHandle, alias: String) -> Result<(), String> {
    let path = target_path()?;
    let before = std::fs::read_to_string(&path).map_err(|e| format!("~/.ssh/config を読めませんでした: {e}"))?;
    let after = delete_host(&before, alias.trim())?;
    write(&app, &path, Some(&before), &after)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(alias: &str) -> HostInput {
        HostInput {
            alias: alias.into(),
            host_name: "github.com".into(),
            user: Some("git".into()),
            port: None,
            identity_file: Some("~/.ssh/id_ed25519_work".into()),
            identities_only: true,
        }
    }

    #[test]
    fn adds_before_wildcard_host() {
        let text = "Host github-me\n  HostName github.com\n\n# みんな共通\nHost *\n  AddKeysToAgent yes\n";
        let out = add_host(text, &input("github-work")).unwrap();
        assert_eq!(
            out,
            "Host github-me\n  HostName github.com\n\nHost github-work\n  HostName github.com\n  User git\n  IdentityFile ~/.ssh/id_ed25519_work\n  IdentitiesOnly yes\n\n# みんな共通\nHost *\n  AddKeysToAgent yes\n"
        );
    }

    #[test]
    fn adds_to_end_and_empty_file() {
        let out = add_host("Host a\n    HostName a.example.com", &input("github-work")).unwrap();
        // ファイルの字下げ (空白4つ) に合わせ、空行で区切る
        assert!(out.starts_with("Host a\n    HostName a.example.com\n\nHost github-work\n    HostName github.com\n"));
        assert!(out.ends_with("IdentitiesOnly yes\n"));
        let empty = add_host("", &HostInput { identity_file: Some("~/my keys/id".into()), identities_only: false, ..input("x") }).unwrap();
        assert_eq!(empty, "Host x\n  HostName github.com\n  User git\n  IdentityFile \"~/my keys/id\"\n");
    }

    #[test]
    fn updates_only_known_lines() {
        let text = "\
# 仕事用
Host github-work
  HostName=github.com
  AddKeysToAgent yes
  IdentityFile ~/.ssh/old
  Port 22
# 次の節の見出し

Host other
  HostName example.com
";
        let h = HostInput { port: None, identity_file: Some("~/.ssh/new".into()), ..input("github-work") };
        let out = update_host(text, &h).unwrap();
        assert_eq!(
            out,
            "\
# 仕事用
Host github-work
  HostName github.com
  AddKeysToAgent yes
  IdentityFile ~/.ssh/new
  User git
  IdentitiesOnly yes
# 次の節の見出し

Host other
  HostName example.com
"
        );
    }

    #[test]
    fn keeps_crlf() {
        let out = update_host("Host a\r\n  HostName old.example.com\r\n", &HostInput { user: None, identity_file: None, identities_only: false, ..input("a") }).unwrap();
        assert_eq!(out, "Host a\r\n  HostName github.com\r\n");
    }

    #[test]
    fn deletes_block_and_blank_line() {
        let text = "Host a\n  HostName a.com\n\nHost b\n  HostName b.com\n\nHost c\n  HostName c.com\n";
        assert_eq!(delete_host(text, "b").unwrap(), "Host a\n  HostName a.com\n\nHost c\n  HostName c.com\n");
        assert_eq!(delete_host(text, "c").unwrap(), "Host a\n  HostName a.com\n\nHost b\n  HostName b.com\n");
        assert_eq!(delete_host(text, "a").unwrap(), "Host b\n  HostName b.com\n\nHost c\n  HostName c.com\n");
    }

    #[test]
    fn refuses_shared_or_missing_hosts() {
        let text = "Host a b\n  HostName x.com\n";
        assert!(delete_host(text, "a").unwrap_err().contains("ほかの名前といっしょ"));
        assert!(delete_host(text, "zzz").unwrap_err().contains("見つかりません"));
    }

    #[test]
    fn checks_values() {
        assert!(add_host("", &input("bad alias")).is_err());
        assert!(add_host("", &HostInput { host_name: "github.com\nHost evil".into(), ..input("a") }).is_err());
        assert!(add_host("", &HostInput { port: Some("70000".into()), ..input("a") }).is_err());
        assert!(add_host("", &HostInput { identity_file: Some("~/.ssh/a\"b".into()), ..input("a") }).is_err());
    }

    #[test]
    fn lists_keys_with_pub() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("id_work"), "PRIVATE").unwrap();
        std::fs::write(dir.path().join("id_work.pub"), "ssh-ed25519 AAAAC3Nz taro@example.com\n").unwrap();
        // 公開鍵だけ・秘密鍵だけのものは出さない
        std::fs::write(dir.path().join("only.pub"), "ssh-rsa AAAA\n").unwrap();
        std::fs::write(dir.path().join("config"), "Host a\n").unwrap();
        assert_eq!(
            list_keys(dir.path()),
            vec![SshKey { path: "~/.ssh/id_work".into(), key_type: "ED25519".into(), comment: Some("taro@example.com".into()) }]
        );
    }
}
