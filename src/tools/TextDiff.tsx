/**
 * テキスト比較。
 *
 * CodeMirror の MergeView で左右に並べ、違う行・文字に色を付ける。
 * 左右どちらも編集でき、編集するとその場で比較し直す
 */

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { syntaxHighlighting } from "@codemirror/language";
import { MergeView } from "@codemirror/merge";
import type { Text } from "@codemirror/state";
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { ArrowLeftRight, ClipboardPaste, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pasteText } from "../clipboard";
import { editorTheme, highlight } from "../components/CodeEditor";
import { Button, IconButton, OptBar, Switch } from "../components/ui";
import { fmtNum, SampleButton } from "./common";

const SAMPLE_A = `{
  "name": "deskit",
  "version": "0.1.0",
  "tools": ["json", "yaml", "base64"],
  "theme": "dark",
  "window": { "width": 1200, "height": 800 }
}`;
const SAMPLE_B = `{
  "name": "deskit",
  "version": "0.2.0",
  "tools": ["json", "yaml", "base64", "diff"],
  "theme": "system",
  "window": { "width": 1240, "height": 820 }
}`;

interface Stats {
  added: number;
  removed: number;
  chunks: number;
}

function lineSpan(doc: Text, from: number, to: number): number {
  if (to <= from) return 0;
  return doc.lineAt(to - 1).number - doc.lineAt(from).number + 1;
}

export default function TextDiff() {
  const host = useRef<HTMLDivElement>(null);
  const mv = useRef<MergeView | null>(null);
  const [stats, setStats] = useState<Stats>({ added: 0, removed: 0, chunks: 0 });
  const [hasText, setHasText] = useState(false);
  const [collapse, setCollapse] = useState(false);

  useEffect(() => {
    let timer = 0;
    const refresh = () => {
      window.clearTimeout(timer);
      // MergeView が差分を計算し終えてから数える
      timer = window.setTimeout(() => {
        const v = mv.current;
        if (!v) return;
        let added = 0;
        let removed = 0;
        for (const c of v.chunks) {
          removed += lineSpan(v.a.state.doc, c.fromA, c.toA);
          added += lineSpan(v.b.state.doc, c.fromB, c.toB);
        }
        setStats({ added, removed, chunks: v.chunks.length });
        setHasText(v.a.state.doc.length > 0 || v.b.state.doc.length > 0);
      }, 30);
    };
    const extensions = [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      syntaxHighlighting(highlight),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      editorTheme,
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) refresh();
      }),
    ];
    const view = new MergeView({
      parent: host.current!,
      a: { doc: "", extensions },
      b: { doc: "", extensions },
      highlightChanges: true,
      gutter: true,
    });
    mv.current = view;
    return () => {
      window.clearTimeout(timer);
      view.destroy();
      mv.current = null;
    };
  }, []);

  useEffect(() => {
    mv.current?.reconfigure({ collapseUnchanged: collapse ? { margin: 3, minSize: 4 } : undefined });
  }, [collapse]);

  const setDoc = (side: "a" | "b", text: string) => {
    const v = mv.current?.[side];
    if (!v) return;
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
  };

  const swap = () => {
    const v = mv.current;
    if (!v) return;
    const a = v.a.state.doc.toString();
    const b = v.b.state.doc.toString();
    setDoc("a", b);
    setDoc("b", a);
  };

  const paste = (side: "a" | "b") => {
    pasteText()
      .then((t) => setDoc(side, t))
      .catch(() => {});
  };

  return (
    <>
      <OptBar>
        <div className="diff-stats">
          {!hasText ? (
            <span className="faint">左右にテキストを入力すると、違う箇所に色が付きます</span>
          ) : stats.chunks === 0 ? (
            <span className="diff-same">違いはありません</span>
          ) : (
            <>
              <span className="diff-del">−{fmtNum(stats.removed)} 行</span>
              <span className="diff-add">+{fmtNum(stats.added)} 行</span>
              <span className="faint">{fmtNum(stats.chunks)} か所</span>
            </>
          )}
        </div>
        <div className="optbar-spacer" />
        <Switch checked={collapse} onChange={setCollapse} label="同じ部分を畳む" />
        <SampleButton
          onClick={() => {
            setDoc("a", SAMPLE_A);
            setDoc("b", SAMPLE_B);
          }}
        />
        <Button icon={ArrowLeftRight} onClick={swap}>
          入れ替え
        </Button>
      </OptBar>
      <section className="pane grow diff-pane">
        <header className="diff-head">
          <div className="diff-side">
            <span className="pane-title">比較元</span>
            <IconButton icon={ClipboardPaste} label="貼り付け" onClick={() => paste("a")} />
            <IconButton icon={Trash2} label="クリア" onClick={() => setDoc("a", "")} />
          </div>
          <div className="diff-side">
            <span className="pane-title">比較先</span>
            <IconButton icon={ClipboardPaste} label="貼り付け" onClick={() => paste("b")} />
            <IconButton icon={Trash2} label="クリア" onClick={() => setDoc("b", "")} />
          </div>
        </header>
        <div className="pane-body">
          <div className="diff-host" ref={host} />
        </div>
      </section>
    </>
  );
}
