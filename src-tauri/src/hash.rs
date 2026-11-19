//! ファイルのハッシュ値 (チェックサム) を求める。
//!
//! テキストのハッシュは画面側 (Web Crypto) で求めるが、
//! ファイルは数GBになることもあるので、Rust側で少しずつ読みながら計算する。
//! 1回読むだけで全アルゴリズムを同時に更新し、ファイルを何度も読まない

use md5::Md5;
use serde::Serialize;
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha384, Sha512};
use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

/// 1回に読む大きさ。大きすぎるとメモリを食い、小さすぎると遅い
const CHUNK: usize = 1024 * 1024;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileHashes {
    /// 画面に出すファイル名 (パスの最後の部分)
    pub name: String,
    pub size: u64,
    pub md5: String,
    pub sha1: String,
    pub sha256: String,
    pub sha384: String,
    pub sha512: String,
}

/// 指定したファイルのハッシュ値をまとめて求める。
///
/// 読み込みは重いので、非同期の実行環境を止めないよう別スレッドで行う
#[tauri::command]
pub async fn hash_file(path: String) -> Result<FileHashes, String> {
    tauri::async_runtime::spawn_blocking(move || hash_path(Path::new(&path)))
        .await
        .map_err(|e| e.to_string())?
}

fn hash_path(path: &Path) -> Result<FileHashes, String> {
    let file = File::open(path).map_err(|e| format!("ファイルを開けませんでした: {e}"))?;
    let meta = file
        .metadata()
        .map_err(|e| format!("ファイルの情報を読めませんでした: {e}"))?;
    if meta.is_dir() {
        return Err("フォルダのハッシュは求められません".into());
    }
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut hashes = hash_reader(BufReader::with_capacity(CHUNK, file))
        .map_err(|e| format!("ファイルを読めませんでした: {e}"))?;
    hashes.name = name;
    Ok(hashes)
}

/// 読み込み元から最後まで読み、全アルゴリズムのハッシュ値を返す (name は空のまま)
fn hash_reader<R: Read>(mut reader: R) -> std::io::Result<FileHashes> {
    let mut md5 = Md5::new();
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut sha384 = Sha384::new();
    let mut sha512 = Sha512::new();
    let mut buf = vec![0u8; CHUNK];
    let mut size: u64 = 0;
    loop {
        let n = match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        };
        let chunk = &buf[..n];
        md5.update(chunk);
        sha1.update(chunk);
        sha256.update(chunk);
        sha384.update(chunk);
        sha512.update(chunk);
        size += n as u64;
    }
    Ok(FileHashes {
        name: String::new(),
        size,
        md5: hex(&md5.finalize()),
        sha1: hex(&sha1.finalize()),
        sha256: hex(&sha256.finalize()),
        sha384: hex(&sha384.finalize()),
        sha512: hex(&sha512.finalize()),
    })
}

/// バイト列を小文字の16進文字列にする
fn hex(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(DIGITS[(b >> 4) as usize] as char);
        s.push(DIGITS[(b & 0x0f) as usize] as char);
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn empty_input() {
        let h = hash_reader(&b""[..]).unwrap();
        assert_eq!(h.size, 0);
        assert_eq!(h.md5, "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(h.sha1, "da39a3ee5e6b4b0d3255bfef95601890afd80709");
        assert_eq!(
            h.sha256,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn known_vectors() {
        let h = hash_reader(&b"abc"[..]).unwrap();
        assert_eq!(h.size, 3);
        assert_eq!(h.md5, "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(h.sha1, "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(
            h.sha256,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            h.sha384,
            "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7"
        );
        assert_eq!(
            h.sha512,
            "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f"
        );
    }

    /// 読み込みの区切り (1MiB) をまたぐ大きさでも、一度に計算したのと同じ値になる
    #[test]
    fn spans_multiple_chunks() {
        let data: Vec<u8> = (0..(CHUNK * 2 + 123)).map(|i| (i % 251) as u8).collect();
        let h = hash_reader(&data[..]).unwrap();
        assert_eq!(h.size, data.len() as u64);
        assert_eq!(h.sha256, hex(&Sha256::digest(&data)));
        assert_eq!(h.md5, hex(&Md5::digest(&data)));
    }

    #[test]
    fn file_name_and_errors() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("hello.txt");
        File::create(&p).unwrap().write_all(b"abc").unwrap();
        let h = hash_path(&p).unwrap();
        assert_eq!(h.name, "hello.txt");
        assert_eq!(h.md5, "900150983cd24fb0d6963f7d28e17f72");

        assert!(hash_path(dir.path()).is_err());
        assert!(hash_path(&dir.path().join("missing")).is_err());
    }
}
