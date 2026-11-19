//! 外部コマンド (git / ssh / aws) の実行と、設定ファイルの安全な書き込み。
//!
//! Finder やスタートメニューから起動したアプリは、ターミナルと違って PATH が最小限になる
//! (macOS では /usr/bin:/bin:/usr/sbin:/sbin だけ)。
//! そのままだと Homebrew で入れた git や aws が見つからないので、よく使われる場所を足して実行する

use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;

pub fn home_dir() -> Result<PathBuf, String> {
    dirs::home_dir().ok_or_else(|| "ホームフォルダが見つかりません".to_string())
}

/// 子プロセスに渡す PATH (今の PATH に、よく使われるインストール先を足したもの)
pub fn search_path() -> OsString {
    let mut list: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    let mut extra: Vec<PathBuf> = Vec::new();
    #[cfg(not(windows))]
    {
        for d in [
            "/opt/homebrew/bin",
            "/opt/homebrew/sbin",
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
            "/usr/sbin",
            "/sbin",
        ] {
            extra.push(PathBuf::from(d));
        }
        if let Some(h) = dirs::home_dir() {
            extra.push(h.join(".local/bin"));
            extra.push(h.join("bin"));
        }
    }
    #[cfg(windows)]
    {
        // AWS CLI v2 と Git for Windows の既定のインストール先
        extra.push(PathBuf::from(r"C:\Program Files\Amazon\AWSCLIV2"));
        extra.push(PathBuf::from(r"C:\Program Files\Git\cmd"));
    }
    for d in extra {
        if !list.contains(&d) {
            list.push(d);
        }
    }
    std::env::join_paths(list).unwrap_or_default()
}

/// 実行の準備をしたコマンド (標準入力なし・出力は受け取る・止めたら終わらせる)
pub fn command(program: &str) -> tokio::process::Command {
    let mut c = tokio::process::Command::new(program);
    c.env("PATH", search_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    // Windows でコマンドを実行するたびに黒い窓が一瞬出ないようにする
    #[cfg(windows)]
    c.creation_flags(0x0800_0000);
    c
}

pub struct CmdOutput {
    pub code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
}

impl CmdOutput {
    pub fn success(&self) -> bool {
        self.code == Some(0)
    }

    /// エラーとして見せる文 (標準エラーの最後の数行)
    pub fn error_text(&self) -> String {
        let text = if self.stderr.trim().is_empty() {
            &self.stdout
        } else {
            &self.stderr
        };
        let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
        let start = lines.len().saturating_sub(3);
        lines[start..].join("\n")
    }
}

/// コマンドを実行して終わるまで待つ。時間内に終わらなければ止めてエラーにする
pub async fn run(
    mut cmd: tokio::process::Command,
    program: &str,
    timeout: Duration,
) -> Result<CmdOutput, String> {
    let child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("{program} コマンドが見つかりません。インストールされているか確認してください")
        } else {
            format!("{program} を実行できませんでした: {e}")
        }
    })?;
    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(out)) => Ok(CmdOutput {
            code: out.status.code(),
            stdout: String::from_utf8_lossy(&out.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&out.stderr).into_owned(),
        }),
        Ok(Err(e)) => Err(format!("{program} の実行中にエラーが起きました: {e}")),
        Err(_) => Err(format!(
            "{program} が {} 秒以内に終わらなかったので止めました",
            timeout.as_secs()
        )),
    }
}

/// 設定ファイルを書き換える前に、アプリのデータフォルダへ控えを取る (古いものは消す)
pub fn backup(backup_dir: &Path, src: &Path, label: &str) -> Result<Option<PathBuf>, String> {
    if !src.exists() {
        return Ok(None);
    }
    std::fs::create_dir_all(backup_dir)
        .map_err(|e| format!("バックアップのフォルダを作れませんでした: {e}"))?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S-%3f");
    let dest = backup_dir.join(format!("{label}-{stamp}.bak"));
    std::fs::copy(src, &dest).map_err(|e| format!("バックアップを取れませんでした: {e}"))?;
    // 認証情報が入っていることがあるので、本人だけが読めるようにする
    restrict_permissions(&dest);
    prune_backups(backup_dir, label, 30);
    Ok(Some(dest))
}

fn prune_backups(dir: &Path, label: &str, keep: usize) {
    let prefix = format!("{label}-");
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<PathBuf> = rd
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".bak"))
        })
        .collect();
    // 名前に日時が入っているので、名前順 = 古い順
    files.sort();
    if files.len() > keep {
        for p in &files[..files.len() - keep] {
            let _ = std::fs::remove_file(p);
        }
    }
}

#[cfg(unix)]
pub fn restrict_permissions(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
pub fn restrict_permissions(_path: &Path) {}

/// 途中で止まっても中途半端なファイルが残らないよう、一時ファイルに書いてから置き換える。
/// `private` なら本人だけが読める権限にする (認証情報のファイル用)
pub fn write_atomic(path: &Path, contents: &str, private: bool) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("フォルダを作れませんでした: {e}"))?;
    }
    let tmp = path.with_extension("deskit-tmp");
    std::fs::write(&tmp, contents).map_err(|e| format!("書き込めませんでした: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        // もとのファイルの権限を引き継ぐ
        if let Ok(meta) = std::fs::metadata(path) {
            let _ = std::fs::set_permissions(&tmp, meta.permissions());
        }
        if private {
            let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600));
        }
    }
    #[cfg(not(unix))]
    let _ = private;
    std::fs::rename(&tmp, path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("ファイルを置き換えられませんでした: {e}")
    })
}

/// 画面から受け取った値の確認 (改行や制御文字が入っていない・長すぎない)
pub fn check_plain(value: &str, label: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{label}を入力してください"));
    }
    if value.chars().any(|c| c.is_control()) {
        return Err(format!("{label}に改行や制御文字は使えません"));
    }
    if value.len() > 512 {
        return Err(format!("{label}が長すぎます"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_has_homebrew() {
        let p = search_path();
        let list: Vec<PathBuf> = std::env::split_paths(&p).collect();
        #[cfg(not(windows))]
        assert!(list.contains(&PathBuf::from("/opt/homebrew/bin")));
        assert!(!list.is_empty());
    }

    #[test]
    fn backup_and_prune() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("config");
        std::fs::write(&src, "a").unwrap();
        let bdir = dir.path().join("backups");
        for _ in 0..3 {
            backup(&bdir, &src, "aws-config").unwrap();
            std::thread::sleep(Duration::from_millis(3));
        }
        prune_backups(&bdir, "aws-config", 2);
        assert_eq!(std::fs::read_dir(&bdir).unwrap().count(), 2);
        assert!(backup(&bdir, &dir.path().join("none"), "x").unwrap().is_none());
    }

    #[test]
    fn atomic_write_keeps_private() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("sub/credentials");
        write_atomic(&p, "[x]\n", true).unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "[x]\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&p).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600);
        }
    }

    #[test]
    fn plain_values() {
        assert!(check_plain("Taro", "名前").is_ok());
        assert!(check_plain("  ", "名前").is_err());
        assert!(check_plain("a\nb", "名前").is_err());
    }

    #[tokio::test(flavor = "current_thread")]
    async fn missing_command() {
        let err = run(command("deskit-no-such-cmd"), "deskit-no-such-cmd", Duration::from_secs(2))
            .await
            .err()
            .unwrap();
        assert!(err.contains("見つかりません"));
    }
}
