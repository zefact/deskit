//! INI 形式のファイル (~/.aws/config・~/.aws/credentials) を、元の書き方を崩さずに書き換える。
//!
//! 読み直して組み立て直すのではなく、行のまま持って必要な行だけ差し替える。
//! 利用者が書いたコメント・空行・並び順・知らない設定はそのまま残す

/// 見出し `[ profile  dev ]` の中身を、空白をそろえた形 (`profile dev`) にする
fn normalize(name: &str) -> String {
    name.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn header_of(line: &str) -> Option<String> {
    let t = line.trim();
    if t.starts_with('[') && t.ends_with(']') && t.len() >= 2 {
        Some(normalize(&t[1..t.len() - 1]))
    } else {
        None
    }
}

/// `key = value` の行なら (key, value)。
/// 字下げした行は前のキーの続き (s3 の入れ子の設定など) なので、キーとしては扱わない
fn entry_of(line: &str) -> Option<(String, String)> {
    if line.starts_with([' ', '\t']) {
        return None;
    }
    let t = line.trim();
    if t.is_empty() || t.starts_with('#') || t.starts_with(';') || t.starts_with('[') {
        return None;
    }
    let (k, v) = t.split_once('=')?;
    let k = k.trim();
    if k.is_empty() {
        return None;
    }
    Some((k.to_string(), v.trim().to_string()))
}

pub struct Ini {
    lines: Vec<String>,
    crlf: bool,
}

impl Ini {
    pub fn parse(text: &str) -> Self {
        Ini {
            lines: text.lines().map(str::to_string).collect(),
            crlf: text.contains("\r\n"),
        }
    }

    pub fn to_text(&self) -> String {
        if self.lines.is_empty() {
            return String::new();
        }
        let nl = if self.crlf { "\r\n" } else { "\n" };
        let mut s = self.lines.join(nl);
        s.push_str(nl);
        s
    }

    /// 見出しの一覧 (書かれた順)
    pub fn sections(&self) -> Vec<String> {
        self.lines.iter().filter_map(|l| header_of(l)).collect()
    }

    /// 見出しの行の位置と、その節の終わり (次の見出しの手前) を返す
    fn range(&self, section: &str) -> Option<(usize, usize)> {
        let want = normalize(section);
        let start = self
            .lines
            .iter()
            .position(|l| header_of(l).as_deref() == Some(want.as_str()))?;
        let end = self.lines[start + 1..]
            .iter()
            .position(|l| header_of(l).is_some())
            .map(|i| start + 1 + i)
            .unwrap_or(self.lines.len());
        Some((start, end))
    }

    pub fn has_section(&self, section: &str) -> bool {
        self.range(section).is_some()
    }

    /// 節の中のキーと値 (字下げした続きの行は含めない)
    pub fn entries(&self, section: &str) -> Vec<(String, String)> {
        match self.range(section) {
            Some((s, e)) => self.lines[s + 1..e].iter().filter_map(|l| entry_of(l)).collect(),
            None => Vec::new(),
        }
    }

    pub fn get(&self, section: &str, key: &str) -> Option<String> {
        self.entries(section)
            .into_iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v)
    }

    /// 値を設定する。キーがあれば書き換え、無ければ節の最後に足す。節が無ければ末尾に作る
    pub fn set(&mut self, section: &str, key: &str, value: &str) {
        let line = format!("{key} = {value}");
        match self.range(section) {
            Some((s, e)) => {
                if let Some(i) = (s + 1..e).find(|&i| entry_of(&self.lines[i]).is_some_and(|(k, _)| k == key)) {
                    self.lines[i] = line;
                } else {
                    // 節の後ろの空行より前に入れる (節どうしの区切りの空行を保つ)
                    let last = (s..e).rev().find(|&i| !self.lines[i].trim().is_empty()).unwrap_or(s);
                    self.lines.insert(last + 1, line);
                }
            }
            None => {
                if self.lines.last().is_some_and(|l| !l.trim().is_empty()) {
                    self.lines.push(String::new());
                }
                self.lines.push(format!("[{}]", normalize(section)));
                self.lines.push(line);
            }
        }
    }

    /// キーを消す (字下げした続きの行もいっしょに消す)
    pub fn remove_key(&mut self, section: &str, key: &str) {
        let Some((s, e)) = self.range(section) else {
            return;
        };
        let Some(i) = (s + 1..e).find(|&i| entry_of(&self.lines[i]).is_some_and(|(k, _)| k == key)) else {
            return;
        };
        let mut j = i + 1;
        while j < e && self.lines[j].starts_with([' ', '\t']) && !self.lines[j].trim().is_empty() {
            j += 1;
        }
        self.lines.drain(i..j);
    }

    /// 節ごと消す
    pub fn remove_section(&mut self, section: &str) {
        let Some((s, e)) = self.range(section) else {
            return;
        };
        self.lines.drain(s..e);
        // 消したあとに空行が2つ続かないようにする
        if s > 0 && self.lines[s - 1].trim().is_empty() && (s >= self.lines.len() || self.lines[s].trim().is_empty()) {
            self.lines.remove(s - 1);
        }
        while self.lines.last().is_some_and(|l| l.trim().is_empty()) {
            self.lines.pop();
        }
    }

    /// 見出しの名前を変える (中身はそのまま)
    pub fn rename_section(&mut self, from: &str, to: &str) {
        if let Some((s, _)) = self.range(from) {
            self.lines[s] = format!("[{}]", normalize(to));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SRC: &str = "# 会社のアカウント\n[default]\nregion = ap-northeast-1\n\n[profile dev]\nregion=us-east-1\ns3 =\n  max_concurrent_requests = 20\noutput = json\n\n[ profile  prod ]\n; 本番\nregion = ap-northeast-1\n";

    #[test]
    fn reads_sections_and_entries() {
        let ini = Ini::parse(SRC);
        assert_eq!(ini.sections(), vec!["default", "profile dev", "profile prod"]);
        assert_eq!(ini.get("profile dev", "region").as_deref(), Some("us-east-1"));
        assert_eq!(ini.get("profile  prod", "region").as_deref(), Some("ap-northeast-1"));
        // 字下げした入れ子の行はキーにしない
        let keys: Vec<String> = ini.entries("profile dev").into_iter().map(|(k, _)| k).collect();
        assert_eq!(keys, vec!["region", "s3", "output"]);
    }

    #[test]
    fn untouched_text_round_trips() {
        assert_eq!(Ini::parse(SRC).to_text(), SRC);
        let crlf = "[a]\r\nk = v\r\n";
        assert_eq!(Ini::parse(crlf).to_text(), crlf);
    }

    #[test]
    fn set_updates_inserts_and_creates() {
        let mut ini = Ini::parse(SRC);
        ini.set("profile dev", "region", "eu-west-1");
        ini.set("default", "output", "table");
        ini.set("profile stg", "region", "ap-northeast-3");
        let text = ini.to_text();
        assert!(text.contains("[profile dev]\nregion = eu-west-1\ns3 =\n  max_concurrent_requests = 20\noutput = json\n"));
        // 空行の前に足される
        assert!(text.contains("[default]\nregion = ap-northeast-1\noutput = table\n\n[profile dev]"));
        assert!(text.ends_with("region = ap-northeast-1\n\n[profile stg]\nregion = ap-northeast-3\n"));
        // コメントは残る
        assert!(text.starts_with("# 会社のアカウント\n"));
        assert!(text.contains("; 本番\n"));
    }

    #[test]
    fn remove_key_with_nested_lines() {
        let mut ini = Ini::parse(SRC);
        ini.remove_key("profile dev", "s3");
        assert!(ini.to_text().contains("[profile dev]\nregion=us-east-1\noutput = json\n"));
        ini.remove_key("profile dev", "nothing");
        ini.remove_key("nothing", "region");
    }

    #[test]
    fn remove_and_rename_sections() {
        let mut ini = Ini::parse(SRC);
        ini.remove_section("profile dev");
        assert_eq!(
            ini.to_text(),
            "# 会社のアカウント\n[default]\nregion = ap-northeast-1\n\n[ profile  prod ]\n; 本番\nregion = ap-northeast-1\n"
        );
        ini.rename_section("profile prod", "profile production");
        assert!(ini.has_section("profile production"));
        ini.remove_section("profile production");
        assert_eq!(ini.to_text(), "# 会社のアカウント\n[default]\nregion = ap-northeast-1\n");
    }

    #[test]
    fn empty_file() {
        let mut ini = Ini::parse("");
        assert_eq!(ini.to_text(), "");
        ini.set("dev", "aws_access_key_id", "AKIA");
        assert_eq!(ini.to_text(), "[dev]\naws_access_key_id = AKIA\n");
    }
}
