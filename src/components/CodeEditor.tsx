/**
 * コードエディタ (CodeMirror 6)。
 *
 * 入力欄・出力欄のどちらにも使う。行番号・シンタックスハイライト・
 * 取り消し (⌘Z) が使え、正規表現の一致箇所などに色を付けられる
 */

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { json } from "@codemirror/lang-json";
import { sql } from "@codemirror/lang-sql";
import { yaml } from "@codemirror/lang-yaml";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Compartment, EditorState, type Extension, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
  WidgetType,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "react";

export type EditorLang = "json" | "yaml" | "sql" | "text";

export interface EditorMark {
  from: number;
  to: number;
  className: string;
}

interface Props {
  value: string;
  onChange?: (value: string) => void;
  lang?: EditorLang;
  readOnly?: boolean;
  placeholder?: string;
  wrap?: boolean;
  marks?: EditorMark[];
  /** 行番号を出すか (1行で使う短い欄では消す) */
  gutter?: boolean;
  autoFocus?: boolean;
}

/** 色はすべてCSS変数にしておき、テーマの切り替えでそのまま変わるようにする */
export const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string)], color: "var(--syn-string)" },
  { tag: [t.number, t.integer, t.float], color: "var(--syn-number)" },
  { tag: [t.bool, t.null, t.atom], color: "var(--syn-atom)" },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: "var(--syn-property)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.typeName, t.className], color: "var(--syn-type)" },
  { tag: [t.function(t.variableName), t.standard(t.name)], color: "var(--syn-func)" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "var(--syn-punct)" },
  { tag: [t.labelName, t.meta], color: "var(--syn-type)" },
]);

export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "var(--editor-font-size)",
    backgroundColor: "transparent",
    color: "var(--text)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
  },
  ".cm-content": { padding: "10px 0", caretColor: "var(--caret)" },
  ".cm-line": { padding: "0 14px 0 10px" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--text-faint)",
    border: "none",
    paddingLeft: "6px",
  },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "28px", padding: "0 6px 0 4px" },
  ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text-dim)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--caret)", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection":
    { backgroundColor: "var(--selection) !important" },
  ".cm-placeholder": { color: "var(--text-faint)" },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "var(--bracket-match)",
    outline: "none",
  },
});

function langExtension(lang: EditorLang): Extension {
  switch (lang) {
    case "json":
      return json();
    case "yaml":
      return yaml();
    case "sql":
      return sql();
    default:
      return [];
  }
}

const setMarks = StateEffect.define<EditorMark[]>();

const marksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    let d = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setMarks)) {
        const len = tr.state.doc.length;
        const ranges = e.value
          .filter((m) => m.from >= 0 && m.from <= len)
          .map((m) => {
            const to = Math.min(Math.max(m.to, m.from), len);
            // 長さ0の一致 (^ や \b) も見えるよう、細い印にする
            return to === m.from
              ? Decoration.widget({ widget: new EmptyMark(m.className), side: 1 }).range(m.from)
              : Decoration.mark({ class: m.className }).range(m.from, to);
          });
        d = Decoration.set(ranges, true);
      }
    }
    return d;
  },
  provide: (f) => EditorView.decorations.from(f),
});

class EmptyMark extends WidgetType {
  constructor(readonly className: string) {
    super();
  }
  eq(other: EmptyMark) {
    return other.className === this.className;
  }
  toDOM() {
    const el = document.createElement("span");
    el.className = `${this.className} cm-mark-empty`;
    return el;
  }
}

export function CodeEditor({
  value,
  onChange,
  lang = "text",
  readOnly = false,
  placeholder,
  wrap = true,
  marks,
  gutter = true,
  autoFocus = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const compartments = useRef({
    lang: new Compartment(),
    readOnly: new Compartment(),
    wrap: new Compartment(),
    placeholder: new Compartment(),
    gutter: new Compartment(),
  }).current;

  // エディタは最初に一度だけ作り、あとは設定だけ差し替える
  useEffect(() => {
    const view = new EditorView({
      parent: hostRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          compartments.gutter.of(gutter ? [lineNumbers(), highlightActiveLineGutter()] : []),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          syntaxHighlighting(highlight),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          editorTheme,
          marksField,
          compartments.lang.of(langExtension(lang)),
          compartments.readOnly.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          compartments.wrap.of(wrap ? EditorView.lineWrapping : []),
          compartments.placeholder.of(placeholder ? cmPlaceholder(placeholder) : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current?.(u.state.doc.toString());
          }),
          EditorView.contentAttributes.of({ spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
        ],
      }),
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // 作り直さない (値・設定は下の effect で反映する)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const cur = view.state.doc.toString();
    if (cur !== value) {
      view.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: compartments.lang.reconfigure(langExtension(lang)) });
  }, [lang, compartments]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.readOnly.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly, compartments]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.wrap.reconfigure(wrap ? EditorView.lineWrapping : []),
    });
  }, [wrap, compartments]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.placeholder.reconfigure(placeholder ? cmPlaceholder(placeholder) : []),
    });
  }, [placeholder, compartments]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: compartments.gutter.reconfigure(gutter ? [lineNumbers(), highlightActiveLineGutter()] : []),
    });
  }, [gutter, compartments]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setMarks.of(marks ?? []) });
  }, [marks]);

  return <div className="code-editor" ref={hostRef} />;
}
