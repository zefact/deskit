import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { FileUp, LoaderCircle } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Button, Card, InputPane, Notice, Opt, OptBar, Segmented, Switch, TextInput, ValueRow } from "../components/ui";
import { digest, HASH_ALGOS, type HashAlgo, hmac, toHex } from "../lib/hash";
import { inTauri } from "../platform";
import type { ToolProps } from "./registry";
import { errorMessage, fmtBytes, PaneFoot } from "./common";

type Mode = "text" | "file";

interface FileHashes {
  name: string;
  size: number;
  md5: string;
  sha1: string;
  sha256: string;
  sha384: string;
  sha512: string;
}

const FILE_KEY: Record<HashAlgo, keyof FileHashes> = {
  MD5: "md5",
  "SHA-1": "sha1",
  "SHA-256": "sha256",
  "SHA-384": "sha384",
  "SHA-512": "sha512",
};

export default function HashTool({ active }: ToolProps) {
  const [mode, setMode] = useState<Mode>("text");
  const [upper, setUpper] = useState(false);
  const [useHmac, setUseHmac] = useState(false);
  const [key, setKey] = useState("");
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [textHashes, setTextHashes] = useState<Partial<Record<HashAlgo, string>>>({});
  const [file, setFile] = useState<FileHashes | null>(null);
  const [fileBusy, setFileBusy] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const deferred = useDeferredValue(input);

  // テキストのハッシュ (非同期なので、古い結果で上書きしないよう印を持つ)
  useEffect(() => {
    let alive = true;
    const bytes = new TextEncoder().encode(deferred);
    const keyBytes = new TextEncoder().encode(key);
    Promise.all(
      HASH_ALGOS.map(async (a) => [a, toHex(useHmac ? await hmac(a, keyBytes, bytes) : await digest(a, bytes))] as const),
    ).then((pairs) => {
      if (alive) setTextHashes(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [deferred, useHmac, key]);

  const hashFile = async (path: string) => {
    setMode("file");
    setFileError(null);
    setFileBusy(path.split(/[\\/]/).pop() ?? path);
    try {
      setFile(await invoke<FileHashes>("hash_file", { path }));
    } catch (e) {
      setFile(null);
      setFileError(errorMessage(e));
    } finally {
      setFileBusy(null);
    }
  };

  // ウィンドウへのファイルのドロップ (このツールを開いているときだけ受け付ける)
  useEffect(() => {
    if (!inTauri || !active) return;
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type === "drop" && e.payload.paths[0]) hashFile(e.payload.paths[0]);
    });
    return () => {
      un.then((f) => f());
    };
  }, [active]);

  const pick = async () => {
    const path = await open({ multiple: false, directory: false });
    if (typeof path === "string") hashFile(path);
  };

  const values = useMemo(() => {
    const out: Partial<Record<HashAlgo, string>> = {};
    for (const a of HASH_ALGOS) {
      const v = mode === "text" ? (deferred === "" && !useHmac ? "" : textHashes[a]) : file?.[FILE_KEY[a]];
      if (typeof v === "string") out[a] = upper ? v.toUpperCase() : v;
    }
    return out;
  }, [mode, deferred, useHmac, textHashes, file, upper]);

  const want = expected.trim().toLowerCase().replace(/\s+/g, "");
  const matched = want ? HASH_ALGOS.find((a) => values[a]?.toLowerCase() === want) : undefined;

  const results = (
    <div className="stack">
      <Card title={mode === "text" && useHmac ? "HMAC" : "ハッシュ値"}>
        {HASH_ALGOS.map((a) => (
          <ValueRow
            key={a}
            label={a}
            value={values[a] ?? ""}
            wrap
            highlight={want ? (matched === a ? "ok" : "ng") : undefined}
          />
        ))}
      </Card>
      <Card title="照合">
        <div className="card-pad">
          <TextInput value={expected} onChange={setExpected} placeholder="比べたいハッシュ値を貼り付け (配布元のチェックサムなど)" />
          {want && (
            <div className="match-result">
              {matched ? (
                <Notice kind="ok">{matched} と一致しました</Notice>
              ) : (
                <Notice kind="error">どのハッシュ値とも一致しません</Notice>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  );

  return (
    <>
      <OptBar>
        <Opt label="対象">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "text", label: "テキスト" },
              { value: "file", label: "ファイル" },
            ]}
          />
        </Opt>
        <Switch checked={upper} onChange={setUpper} label="大文字" />
        {mode === "text" && (
          <>
            <Switch checked={useHmac} onChange={setUseHmac} label="HMAC" />
            {useHmac && (
              <Opt label="鍵">
                <TextInput value={key} onChange={setKey} placeholder="秘密鍵 (UTF-8)" className="hmac-key" />
              </Opt>
            )}
          </>
        )}
      </OptBar>
      <div className="split">
        {mode === "text" ? (
          <InputPane
            title="テキスト"
            value={input}
            onChange={setInput}
            placeholder="ハッシュ値を求めるテキスト (UTF-8 として計算します)"
            footer={deferred ? <PaneFoot>{fmtBytes(new TextEncoder().encode(deferred).length)}</PaneFoot> : null}
          />
        ) : (
          <div className="dropzone">
            {fileBusy ? (
              <>
                <LoaderCircle size={34} className="spin" />
                <div className="dropzone-title">計算しています…</div>
                <div className="dropzone-sub">{fileBusy}</div>
              </>
            ) : (
              <>
                <div className="dropzone-icon">
                  <FileUp size={28} />
                </div>
                <div className="dropzone-title">ファイルをここへドロップ</div>
                <div className="dropzone-sub">数GBのファイルでも、少しずつ読みながら計算します</div>
                {inTauri ? (
                  <Button variant="primary" onClick={pick}>
                    ファイルを選択
                  </Button>
                ) : (
                  <Notice kind="warn">ファイルのハッシュはアプリ版でのみ使えます</Notice>
                )}
                {file && (
                  <div className="dropzone-file">
                    <strong>{file.name}</strong> · {fmtBytes(file.size)}
                  </div>
                )}
                {fileError && <Notice kind="error">{fileError}</Notice>}
              </>
            )}
          </div>
        )}
        {results}
      </div>
    </>
  );
}
