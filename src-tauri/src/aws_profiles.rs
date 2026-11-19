//! AWS CLI のプロファイルの確認・追加・編集・切り替え。
//!
//! - ~/.aws/config と ~/.aws/credentials を読み書きする (コメントや並びは崩さない)
//! - シークレットアクセスキーとセッショントークンは、画面へ返さない
//! - 「切り替え」は ~/.aws/deskit_profile にプロファイル名を書き、
//!   シェルの設定 (~/.zshrc) に足した数行で、新しく開いたターミナルの AWS_PROFILE にする

use crate::cmd::{self, check_plain, command, run};
use crate::ini::Ini;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

const AWS_TIMEOUT: Duration = Duration::from_secs(25);

/// 画面へ返さない (伏せる) 値
const SECRET_KEYS: [&str; 2] = ["aws_secret_access_key", "aws_session_token"];

const MARK_BEGIN: &str = "# >>> deskit aws-profile >>>";
const MARK_END: &str = "# <<< deskit aws-profile <<<";

struct Paths {
    config: PathBuf,
    credentials: PathBuf,
    /// Deskit で選んだプロファイル名を入れておくファイル
    selected: PathBuf,
}

fn paths() -> Result<Paths, String> {
    let aws = cmd::home_dir()?.join(".aws");
    let env_path = |name: &str| std::env::var_os(name).filter(|v| !v.is_empty()).map(PathBuf::from);
    Ok(Paths {
        config: env_path("AWS_CONFIG_FILE").unwrap_or_else(|| aws.join("config")),
        credentials: env_path("AWS_SHARED_CREDENTIALS_FILE").unwrap_or_else(|| aws.join("credentials")),
        selected: aws.join("deskit_profile"),
    })
}

fn backup_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("backups"))
}

fn read_ini(path: &Path) -> Ini {
    Ini::parse(&std::fs::read_to_string(path).unwrap_or_default())
}

/// config の見出しからプロファイル名を取り出す (`default` / `profile xxx` 以外は対象外)
fn profile_of_config_section(section: &str) -> Option<String> {
    if section == "default" {
        return Some("default".into());
    }
    section.strip_prefix("profile ").map(|s| s.trim().to_string())
}

fn config_section(name: &str) -> String {
    if name == "default" {
        "default".into()
    } else {
        format!("profile {name}")
    }
}

/// アクセスキーIDの途中を伏せる (AKIA************WXYZ → AKIA…WXYZ)
fn mask(id: &str) -> String {
    let chars: Vec<char> = id.chars().collect();
    if chars.len() <= 8 {
        return "••••".into();
    }
    let head: String = chars[..4].iter().collect();
    let tail: String = chars[chars.len() - 4..].iter().collect();
    format!("{head}••••{tail}")
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInfo {
    pub name: String,
    pub region: Option<String>,
    pub output: Option<String>,
    /// 伏せたアクセスキーID
    pub access_key: Option<String>,
    pub has_secret: bool,
    pub has_session_token: bool,
    pub in_config: bool,
    pub in_credentials: bool,
    /// 認証のしかた ("keys" / "sso" / "role" / "process" / "none")
    pub kind: String,
    /// そのほかの設定 (role_arn・sso_start_url など。秘密の値は含めない)
    pub extra: Vec<(String, String)>,
}

fn collect_profiles(config: &Ini, credentials: &Ini) -> Vec<ProfileInfo> {
    let mut names: Vec<String> = Vec::new();
    for s in config.sections() {
        if let Some(n) = profile_of_config_section(&s) {
            if !names.contains(&n) {
                names.push(n);
            }
        }
    }
    for s in credentials.sections() {
        if !names.contains(&s) {
            names.push(s);
        }
    }
    // default を先頭に
    names.sort_by_key(|n| n != "default");

    names
        .into_iter()
        .map(|name| {
            let conf = config.entries(&config_section(&name));
            let cred = credentials.entries(&name);
            let get = |k: &str| {
                cred.iter()
                    .chain(conf.iter())
                    .find(|(key, _)| key == k)
                    .map(|(_, v)| v.clone())
            };
            let access = get("aws_access_key_id");
            let kind = if access.is_some() {
                "keys"
            } else if conf.iter().any(|(k, _)| k.starts_with("sso_")) {
                "sso"
            } else if conf.iter().any(|(k, _)| k == "role_arn") {
                "role"
            } else if conf.iter().any(|(k, _)| k == "credential_process") {
                "process"
            } else {
                "none"
            };
            let extra = conf
                .iter()
                .filter(|(k, _)| {
                    !matches!(k.as_str(), "region" | "output" | "aws_access_key_id")
                        && !SECRET_KEYS.contains(&k.as_str())
                        && !k.contains("secret")
                })
                .cloned()
                .collect();
            ProfileInfo {
                region: conf.iter().find(|(k, _)| k == "region").map(|(_, v)| v.clone()),
                output: conf.iter().find(|(k, _)| k == "output").map(|(_, v)| v.clone()),
                access_key: access.as_deref().map(mask),
                has_secret: get("aws_secret_access_key").is_some(),
                has_session_token: get("aws_session_token").is_some(),
                in_config: !conf.is_empty() || config.has_section(&config_section(&name)),
                in_credentials: credentials.has_section(&name),
                kind: kind.into(),
                extra,
                name,
            }
        })
        .collect()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Integration {
    /// このOS・シェルで「ターミナル連携」が使えるか
    pub supported: bool,
    pub shell: Option<String>,
    pub rc_path: Option<String>,
    pub installed: bool,
    /// シェルの設定に足す内容 (確認のために画面へ出す)
    pub snippet: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AwsOverview {
    pub config_path: String,
    pub credentials_path: String,
    pub profiles: Vec<ProfileInfo>,
    /// Deskit で選んでいるプロファイル (未選択なら default が使われる)
    pub selected: Option<String>,
    pub integration: Integration,
}

/// ターミナル連携で書き足すシェルの設定ファイル
fn rc_file() -> Option<(String, PathBuf)> {
    if cfg!(windows) {
        return None;
    }
    let home = dirs::home_dir()?;
    let shell = std::env::var("SHELL").unwrap_or_else(|_| {
        if cfg!(target_os = "macos") { "/bin/zsh".into() } else { "/bin/bash".into() }
    });
    let name = Path::new(&shell).file_name()?.to_str()?.to_string();
    match name.as_str() {
        "zsh" => {
            let dir = std::env::var_os("ZDOTDIR").map(PathBuf::from).unwrap_or(home);
            Some((name, dir.join(".zshrc")))
        }
        "bash" if cfg!(target_os = "macos") => Some((name, home.join(".bash_profile"))),
        "bash" => Some((name, home.join(".bashrc"))),
        _ => None,
    }
}

fn snippet() -> String {
    format!(
        "{MARK_BEGIN}\n\
# Deskit の「AWSプロファイル」で選んだプロファイルを、新しく開いたターミナルで使う\n\
if [ -s \"$HOME/.aws/deskit_profile\" ]; then export AWS_PROFILE=\"$(cat \"$HOME/.aws/deskit_profile\")\"; fi\n\
{MARK_END}"
    )
}

fn has_block(text: &str) -> bool {
    text.lines().any(|l| l.trim() == MARK_BEGIN)
}

/// 目印で囲んだ部分を取り除く (前の空行もひとつ消す)
fn remove_block(text: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    let mut inside = false;
    for line in text.lines() {
        if line.trim() == MARK_BEGIN {
            inside = true;
            if out.last().is_some_and(|l| l.trim().is_empty()) {
                out.pop();
            }
            continue;
        }
        if inside {
            if line.trim() == MARK_END {
                inside = false;
            }
            continue;
        }
        out.push(line);
    }
    let mut s = out.join("\n");
    if !s.is_empty() {
        s.push('\n');
    }
    s
}

fn add_block(text: &str) -> String {
    let mut s = text.to_string();
    if !s.is_empty() && !s.ends_with('\n') {
        s.push('\n');
    }
    if !s.is_empty() {
        s.push('\n');
    }
    s.push_str(&snippet());
    s.push('\n');
    s
}

fn read_selected(path: &Path) -> Option<String> {
    let s = std::fs::read_to_string(path).ok()?;
    let s = s.trim();
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

fn overview() -> Result<AwsOverview, String> {
    let p = paths()?;
    let config = read_ini(&p.config);
    let credentials = read_ini(&p.credentials);
    let rc = rc_file();
    let installed = rc
        .as_ref()
        .and_then(|(_, path)| std::fs::read_to_string(path).ok())
        .is_some_and(|t| has_block(&t));
    Ok(AwsOverview {
        config_path: p.config.display().to_string(),
        credentials_path: p.credentials.display().to_string(),
        profiles: collect_profiles(&config, &credentials),
        selected: read_selected(&p.selected),
        integration: Integration {
            supported: rc.is_some(),
            shell: rc.as_ref().map(|(s, _)| s.clone()),
            rc_path: rc.as_ref().map(|(_, p)| p.display().to_string()),
            installed,
            snippet: snippet(),
        },
    })
}

#[tauri::command]
pub async fn aws_overview() -> Result<AwsOverview, String> {
    overview()
}

#[tauri::command]
pub async fn aws_cli_version() -> Result<String, String> {
    let mut c = command("aws");
    c.arg("--version").env("AWS_PAGER", "");
    let out = run(c, "aws", AWS_TIMEOUT).await?;
    if out.success() {
        Ok(out.stdout.split_whitespace().next().unwrap_or("").to_string())
    } else {
        Err(out.error_text())
    }
}

fn check_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '@' | '+'));
    if ok {
        Ok(())
    } else {
        Err("プロファイル名には英数字と - _ . @ + だけが使えます".into())
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInput {
    /// 編集のときの元の名前 (新規なら None)
    pub original: Option<String>,
    pub name: String,
    pub region: String,
    pub output: String,
    /// 空なら変えない
    pub access_key_id: String,
    /// 空なら変えない
    pub secret_access_key: String,
}

/// 保存の中身 (ファイルの読み書きと分けて、テストできるようにする)
fn apply_save(config: &mut Ini, credentials: &mut Ini, input: &SaveInput) -> Result<(), String> {
    let name = input.name.trim();
    check_name(name)?;
    let exists = |n: &str| config.has_section(&config_section(n)) || credentials.has_section(n);
    let key_id = input.access_key_id.trim();
    let secret = input.secret_access_key.trim();
    for (v, label) in [(key_id, "アクセスキーID"), (secret, "シークレットアクセスキー")] {
        if !v.is_empty() && (v.chars().any(|c| c.is_whitespace() || c.is_control()) || v.len() > 256) {
            return Err(format!("{label}に空白や改行は使えません"));
        }
    }
    for (v, label) in [(input.region.trim(), "リージョン"), (input.output.trim(), "出力形式")] {
        if !v.is_empty() {
            check_plain(v, label)?;
        }
    }

    match input.original.as_deref() {
        None => {
            if exists(name) {
                return Err(format!("「{name}」というプロファイルはすでにあります"));
            }
            if key_id.is_empty() || secret.is_empty() {
                return Err("新しいプロファイルには、アクセスキーIDとシークレットアクセスキーが必要です".into());
            }
        }
        Some(orig) if orig != name => {
            if orig == "default" || name == "default" {
                return Err("default の名前は変えられません".into());
            }
            if exists(name) {
                return Err(format!("「{name}」というプロファイルはすでにあります"));
            }
            config.rename_section(&config_section(orig), &config_section(name));
            credentials.rename_section(orig, name);
        }
        Some(_) => {}
    }

    // 認証情報 (credentials)
    if !key_id.is_empty() {
        let changed = credentials.get(name, "aws_access_key_id").as_deref() != Some(key_id);
        credentials.set(name, "aws_access_key_id", key_id);
        // キーを変えたら、前のキーの一時トークンは使えないので消す
        if changed {
            credentials.remove_key(name, "aws_session_token");
        }
    }
    if !secret.is_empty() {
        credentials.set(name, "aws_secret_access_key", secret);
    }

    // 設定 (config)
    let section = config_section(name);
    for (key, value) in [("region", input.region.trim()), ("output", input.output.trim())] {
        if value.is_empty() {
            config.remove_key(&section, key);
        } else {
            config.set(&section, key, value);
        }
    }
    Ok(())
}

fn write_both(app: &tauri::AppHandle, p: &Paths, config: &Ini, credentials: &Ini) -> Result<(), String> {
    let dir = backup_dir(app)?;
    cmd::backup(&dir, &p.config, "aws-config")?;
    cmd::backup(&dir, &p.credentials, "aws-credentials")?;
    cmd::write_atomic(&p.config, &config.to_text(), false)?;
    cmd::write_atomic(&p.credentials, &credentials.to_text(), true)?;
    Ok(())
}

#[tauri::command]
pub async fn aws_save_profile(app: tauri::AppHandle, input: SaveInput) -> Result<AwsOverview, String> {
    let p = paths()?;
    let mut config = read_ini(&p.config);
    let mut credentials = read_ini(&p.credentials);
    apply_save(&mut config, &mut credentials, &input)?;
    write_both(&app, &p, &config, &credentials)?;
    // 名前を変えたプロファイルを選んでいたら、選択も新しい名前にする
    if let Some(orig) = &input.original {
        if read_selected(&p.selected).as_deref() == Some(orig.as_str()) && orig != input.name.trim() {
            cmd::write_atomic(&p.selected, &format!("{}\n", input.name.trim()), false)?;
        }
    }
    overview()
}

#[tauri::command]
pub async fn aws_delete_profile(app: tauri::AppHandle, name: String) -> Result<AwsOverview, String> {
    let p = paths()?;
    let mut config = read_ini(&p.config);
    let mut credentials = read_ini(&p.credentials);
    config.remove_section(&config_section(&name));
    credentials.remove_section(&name);
    write_both(&app, &p, &config, &credentials)?;
    if read_selected(&p.selected).as_deref() == Some(name.as_str()) {
        let _ = std::fs::remove_file(&p.selected);
    }
    overview()
}

/// ターミナルで使うプロファイルを選ぶ (None または "default" で選択を外す)
#[tauri::command]
pub async fn aws_select_profile(name: Option<String>) -> Result<AwsOverview, String> {
    let p = paths()?;
    match name.as_deref().map(str::trim) {
        None | Some("") | Some("default") => {
            if p.selected.exists() {
                std::fs::remove_file(&p.selected).map_err(|e| format!("選択を外せませんでした: {e}"))?;
            }
        }
        Some(n) => {
            check_name(n)?;
            cmd::write_atomic(&p.selected, &format!("{n}\n"), false)?;
        }
    }
    overview()
}

#[tauri::command]
pub async fn aws_install_integration(app: tauri::AppHandle) -> Result<AwsOverview, String> {
    let (_, rc) = rc_file().ok_or("このシェルではターミナル連携を使えません (zsh / bash に対応)")?;
    let text = std::fs::read_to_string(&rc).unwrap_or_default();
    if !has_block(&text) {
        cmd::backup(&backup_dir(&app)?, &rc, "shell-rc")?;
        cmd::write_atomic(&rc, &add_block(&text), false)?;
    }
    overview()
}

#[tauri::command]
pub async fn aws_uninstall_integration(app: tauri::AppHandle) -> Result<AwsOverview, String> {
    let (_, rc) = rc_file().ok_or("このシェルではターミナル連携を使えません")?;
    let text = std::fs::read_to_string(&rc).unwrap_or_default();
    if has_block(&text) {
        cmd::backup(&backup_dir(&app)?, &rc, "shell-rc")?;
        cmd::write_atomic(&rc, &remove_block(&text), false)?;
    }
    overview()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub account: String,
    pub arn: String,
    pub user_id: String,
    /// アカウントの別名 (IAM のアカウントエイリアス)
    pub alias: NameLookup,
    /// アカウント名 (コンソールや Organizations で付けた名前)
    pub account_name: NameLookup,
}

/// アカウントの名前を読みにいった結果。読めなかったときは、その理由を画面に出す
#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NameLookup {
    /// found: 読めた / none: 付いていない / denied: 読む権限がない /
    /// unsupported: AWS CLI が古くて読めない / error: そのほかの失敗
    pub status: &'static str,
    pub value: Option<String>,
    /// 読めなかったときの aws の応答 (画面ではヒントに出す)
    pub detail: Option<String>,
}

impl NameLookup {
    fn from_value(value: Option<String>) -> Self {
        match value.filter(|v| !v.trim().is_empty()) {
            Some(v) => Self { status: "found", value: Some(v), detail: None },
            None => Self { status: "none", value: None, detail: None },
        }
    }

    /// aws コマンドが失敗したときの応答から、理由を見分ける
    fn failed(text: String) -> Self {
        let status = if text.contains("AccessDenied")
            || text.contains("not authorized to perform")
            || text.contains("UnauthorizedOperation")
        {
            "denied"
        } else if text.contains("Invalid choice") || text.contains("invalid choice") {
            "unsupported"
        } else {
            "error"
        };
        Self { status, value: None, detail: Some(text) }
    }
}

/// iam list-account-aliases の応答から、最初の別名
fn parse_alias(stdout: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(stdout).ok()?;
    v.get("AccountAliases")?.get(0)?.as_str().map(str::to_string)
}

/// account get-account-information の応答から、アカウント名
fn parse_account_name(stdout: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(stdout).ok()?;
    v.get("AccountName")?.as_str().map(str::to_string)
}

/// 名前を読みにいく (権限が無いなどで読めなくても、接続確認そのものは失敗にしない)
async fn lookup(profile: &str, args: &[&str], parse: fn(&str) -> Option<String>) -> NameLookup {
    match run(aws_command(profile, args), "aws", AWS_TIMEOUT).await {
        Ok(o) if o.success() => NameLookup::from_value(parse(&o.stdout)),
        Ok(o) => NameLookup::failed(o.error_text()),
        Err(e) => NameLookup::failed(e),
    }
}

/// プロファイルで AWS に問い合わせるコマンド。
/// アプリ自身の環境変数の認証情報が混ざらないよう、AWS_ で始まる変数は渡さない
fn aws_command(profile: &str, args: &[&str]) -> tokio::process::Command {
    let mut c = command("aws");
    for (k, _) in std::env::vars_os() {
        if k.to_string_lossy().starts_with("AWS_") {
            c.env_remove(k);
        }
    }
    c.args(args)
        .args(["--profile", profile, "--output", "json", "--no-cli-pager"])
        .env("AWS_PAGER", "");
    c
}

fn json_str(v: &serde_json::Value, key: &str) -> String {
    v.get(key).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

#[tauri::command]
pub async fn aws_identity(profile: String) -> Result<Identity, String> {
    check_name(&profile)?;
    let out = run(aws_command(&profile, &["sts", "get-caller-identity"]), "aws", AWS_TIMEOUT).await?;
    if !out.success() {
        return Err(out.error_text());
    }
    let v: serde_json::Value =
        serde_json::from_str(&out.stdout).map_err(|_| "aws の応答を読めませんでした".to_string())?;
    // 別名 (iam:ListAccountAliases) とアカウント名 (account:GetAccountInformation) は、
    // 別々の権限が要る。同時に問い合わせて、読めなかった理由もそれぞれ返す
    let (alias, account_name) = tokio::join!(
        lookup(&profile, &["iam", "list-account-aliases"], parse_alias),
        lookup(&profile, &["account", "get-account-information"], parse_account_name),
    );
    Ok(Identity {
        account: json_str(&v, "Account"),
        arn: json_str(&v, "Arn"),
        user_id: json_str(&v, "UserId"),
        alias,
        account_name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const CONFIG: &str = "[default]\nregion = ap-northeast-1\n\n[profile dev]\nregion = us-east-1\noutput = json\n\n[profile sso-dev]\nsso_start_url = https://x.awsapps.com/start\nsso_role_name = Admin\n\n[sso-session x]\nsso_region = us-east-1\n";
    const CREDS: &str = "[default]\naws_access_key_id = AKIAAAAAAAAAAAAADEF1\naws_secret_access_key = secret-default\n\n[dev]\naws_access_key_id = AKIABBBBBBBBBBBBDEV2\naws_secret_access_key = secret-dev\naws_session_token = token\n\n[keys-only]\naws_access_key_id = AKIACCCCCCCCCCCCKEY3\naws_secret_access_key = s3\n";

    fn input(original: Option<&str>, name: &str, key: &str, secret: &str) -> SaveInput {
        SaveInput {
            original: original.map(str::to_string),
            name: name.into(),
            region: "ap-northeast-1".into(),
            output: "json".into(),
            access_key_id: key.into(),
            secret_access_key: secret.into(),
        }
    }

    #[test]
    fn lists_profiles_without_secrets() {
        let list = collect_profiles(&Ini::parse(CONFIG), &Ini::parse(CREDS));
        let names: Vec<&str> = list.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, vec!["default", "dev", "sso-dev", "keys-only"]);
        let dev = &list[1];
        assert_eq!(dev.access_key.as_deref(), Some("AKIA••••DEV2"));
        assert!(dev.has_secret && dev.has_session_token);
        assert_eq!(dev.kind, "keys");
        assert_eq!(list[2].kind, "sso");
        assert!(list[2].extra.iter().any(|(k, _)| k == "sso_start_url"));
        assert!(list[3].in_credentials && !list[3].in_config);
        // シークレットの値はどこにも出てこない
        let dump = format!("{list:?}");
        assert!(!dump.contains("secret-dev") && !dump.contains("token\""));
    }

    #[test]
    fn add_new_profile() {
        let mut config = Ini::parse(CONFIG);
        let mut creds = Ini::parse(CREDS);
        apply_save(&mut config, &mut creds, &input(None, "stg", "AKIASTG", "sec")).unwrap();
        assert!(creds.to_text().ends_with("[stg]\naws_access_key_id = AKIASTG\naws_secret_access_key = sec\n"));
        assert_eq!(config.get("profile stg", "region").as_deref(), Some("ap-northeast-1"));
        // 既存の名前・キーなしは断る
        assert!(apply_save(&mut config, &mut creds, &input(None, "dev", "A", "B")).is_err());
        assert!(apply_save(&mut config, &mut creds, &input(None, "new", "", "")).is_err());
        assert!(apply_save(&mut config, &mut creds, &input(None, "bad name", "A", "B")).is_err());
    }

    #[test]
    fn edit_keeps_secret_when_blank_and_drops_old_token() {
        let mut config = Ini::parse(CONFIG);
        let mut creds = Ini::parse(CREDS);
        // キーを空のまま保存 → 認証情報は変わらない
        let mut i = input(Some("dev"), "dev", "", "");
        i.region = "eu-west-1".into();
        i.output = "".into();
        apply_save(&mut config, &mut creds, &i).unwrap();
        assert_eq!(creds.get("dev", "aws_secret_access_key").as_deref(), Some("secret-dev"));
        assert_eq!(creds.get("dev", "aws_session_token").as_deref(), Some("token"));
        assert_eq!(config.get("profile dev", "region").as_deref(), Some("eu-west-1"));
        assert_eq!(config.get("profile dev", "output"), None);
        // キーを変えると古いトークンは消える
        apply_save(&mut config, &mut creds, &input(Some("dev"), "dev", "AKIANEW", "")).unwrap();
        assert_eq!(creds.get("dev", "aws_access_key_id").as_deref(), Some("AKIANEW"));
        assert_eq!(creds.get("dev", "aws_session_token"), None);
        assert_eq!(creds.get("dev", "aws_secret_access_key").as_deref(), Some("secret-dev"));
    }

    #[test]
    fn rename_profile() {
        let mut config = Ini::parse(CONFIG);
        let mut creds = Ini::parse(CREDS);
        apply_save(&mut config, &mut creds, &input(Some("dev"), "develop", "", "")).unwrap();
        assert!(config.has_section("profile develop") && !config.has_section("profile dev"));
        assert_eq!(creds.get("develop", "aws_secret_access_key").as_deref(), Some("secret-dev"));
        assert!(apply_save(&mut config, &mut creds, &input(Some("default"), "main", "", "")).is_err());
        assert!(apply_save(&mut config, &mut creds, &input(Some("develop"), "keys-only", "", "")).is_err());
    }

    #[test]
    fn shell_block() {
        let rc = "export PATH=/x\n";
        let added = add_block(rc);
        assert!(has_block(&added));
        assert!(added.starts_with("export PATH=/x\n\n# >>> deskit aws-profile >>>\n"));
        assert_eq!(remove_block(&added), rc);
        assert_eq!(add_block(""), format!("{}\n", snippet()));
        assert!(!has_block(rc));
    }

    /// 手元の実際の設定を読めるか確かめる (件数と種類だけ表示し、値は出さない)。
    /// `cargo test real_files -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_files() {
        let ov = overview().unwrap();
        let kinds: Vec<&str> = ov.profiles.iter().map(|p| p.kind.as_str()).collect();
        println!(
            "aws: profiles={} kinds={kinds:?} with_region={} selected={} integration={}/{}",
            ov.profiles.len(),
            ov.profiles.iter().filter(|p| p.region.is_some()).count(),
            ov.selected.is_some(),
            ov.integration.supported,
            ov.integration.installed
        );
        let hosts = crate::ssh_config::load().unwrap();
        println!(
            "ssh: hosts={} git_hosts={} with_key={}",
            hosts.len(),
            hosts.iter().filter(|h| h.host_name.as_deref() == Some("github.com")).count(),
            hosts.iter().filter(|h| h.identity_file.is_some()).count()
        );
    }

    #[test]
    fn masks_keys() {
        assert_eq!(mask("AKIAIOSFODNN7EXAMPLE"), "AKIA••••MPLE");
        assert_eq!(mask("short"), "••••");
    }

    #[test]
    fn reads_account_names() {
        assert_eq!(parse_alias(r#"{"AccountAliases":["example-main"]}"#).as_deref(), Some("example-main"));
        assert_eq!(parse_alias(r#"{"AccountAliases":[]}"#), None);
        assert_eq!(
            parse_account_name(r#"{"AccountId":"111122223333","AccountName":"Example Prod","AccountCreatedDate":"2020-01-01T00:00:00Z"}"#)
                .as_deref(),
            Some("Example Prod")
        );
        assert_eq!(parse_account_name("not json"), None);

        assert_eq!(NameLookup::from_value(Some("x".into())).status, "found");
        assert_eq!(NameLookup::from_value(None).status, "none");
        assert_eq!(NameLookup::from_value(Some("  ".into())).status, "none");
    }

    #[test]
    fn tells_why_names_are_missing() {
        let denied = NameLookup::failed(
            "An error occurred (AccessDenied) when calling the ListAccountAliases operation: User: arn:aws:iam::111122223333:user/taro is not authorized to perform: iam:ListAccountAliases".into(),
        );
        assert_eq!(denied.status, "denied");
        assert!(denied.detail.unwrap().contains("ListAccountAliases"));

        let denied2 = NameLookup::failed(
            "An error occurred (AccessDeniedException) when calling the GetAccountInformation operation: User is not authorized to perform: account:GetAccountInformation".into(),
        );
        assert_eq!(denied2.status, "denied");

        let old_cli = NameLookup::failed(
            "aws: error: argument operation: Invalid choice, valid choices are:\nget-alternate-contact | put-alternate-contact".into(),
        );
        assert_eq!(old_cli.status, "unsupported");

        assert_eq!(NameLookup::failed("Could not connect to the endpoint URL".into()).status, "error");
    }
}
