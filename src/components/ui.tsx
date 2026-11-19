/** ツール画面で共通に使う部品 */

import { Check, ClipboardPaste, Copy, type LucideIcon, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { copyText, pasteText } from "../clipboard";
import { CodeEditor, type EditorLang, type EditorMark } from "./CodeEditor";

export function IconButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
  size = 15,
  className = "",
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-btn ${active ? "is-active" : ""} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-tip={label}
    >
      <Icon size={size} strokeWidth={1.9} />
    </button>
  );
}

export function Button({
  children,
  onClick,
  icon: Icon,
  variant = "default",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  icon?: LucideIcon;
  variant?: "default" | "primary" | "ghost";
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`btn btn-${variant}`} onClick={onClick} disabled={disabled}>
      {Icon && <Icon size={15} strokeWidth={2} />}
      {children}
    </button>
  );
}

/** コピーして、少しのあいだチェックマークを出す */
export function CopyButton({ value, label = "コピー" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <button
      type="button"
      className={`icon-btn ${done ? "is-done" : ""}`}
      aria-label={label}
      data-tip={done ? "コピーしました" : label}
      disabled={value === ""}
      onClick={() => {
        copyText(value).then(() => {
          setDone(true);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setDone(false), 1400);
        });
      }}
    >
      {done ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={1.9} />}
    </button>
  );
}

export function PasteButton({ onPaste }: { onPaste: (text: string) => void }) {
  return (
    <IconButton
      icon={ClipboardPaste}
      label="貼り付け"
      onClick={() => {
        pasteText()
          .then(onPaste)
          .catch(() => {});
      }}
    />
  );
}

export function ClearButton({ onClear, disabled }: { onClear: () => void; disabled?: boolean }) {
  return <IconButton icon={Trash2} label="クリア" onClick={onClear} disabled={disabled} />;
}

/** 見出しと操作ボタンつきの枠 */
export function Pane({
  title,
  actions,
  children,
  footer,
  className = "",
}: {
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`pane ${className}`}>
      <header className="pane-head">
        <span className="pane-title">{title}</span>
        <div className="pane-actions">{actions}</div>
      </header>
      <div className="pane-body">{children}</div>
      {footer}
    </section>
  );
}

/** 入力用のエディタ枠 (貼り付け・クリアつき) */
export function InputPane({
  title = "入力",
  value,
  onChange,
  lang,
  placeholder,
  marks,
  extra,
  footer,
  wrap,
  className,
  autoFocus,
}: {
  title?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  lang?: EditorLang;
  placeholder?: string;
  marks?: EditorMark[];
  extra?: ReactNode;
  footer?: ReactNode;
  wrap?: boolean;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <Pane
      title={title}
      className={className}
      actions={
        <>
          {extra}
          <PasteButton onPaste={onChange} />
          <ClearButton onClear={() => onChange("")} disabled={value === ""} />
        </>
      }
      footer={footer}
    >
      <CodeEditor
        value={value}
        onChange={onChange}
        lang={lang}
        placeholder={placeholder}
        marks={marks}
        wrap={wrap}
        autoFocus={autoFocus}
      />
    </Pane>
  );
}

/** 結果を出すエディタ枠 (読み取り専用・コピーつき) */
export function OutputPane({
  title = "出力",
  value,
  lang,
  placeholder,
  extra,
  footer,
  wrap,
  className,
}: {
  title?: ReactNode;
  value: string;
  lang?: EditorLang;
  placeholder?: string;
  extra?: ReactNode;
  footer?: ReactNode;
  wrap?: boolean;
  className?: string;
}) {
  return (
    <Pane
      title={title}
      className={className}
      actions={
        <>
          {extra}
          <CopyButton value={value} />
        </>
      }
      footer={footer}
    >
      <CodeEditor value={value} lang={lang} readOnly placeholder={placeholder} wrap={wrap} />
    </Pane>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegOption<T>[];
}) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "is-on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden>
        <span className="switch-thumb" />
      </span>
      <span className="switch-label">{label}</span>
    </label>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** 設定の並び (横に並べ、狭ければ折り返す) */
export function OptBar({ children }: { children: ReactNode }) {
  return <div className="optbar">{children}</div>;
}

export function Opt({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className="opt">
      {label && <span className="opt-label">{label}</span>}
      {children}
    </div>
  );
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok" | "warn"; children: ReactNode }) {
  return <div className={`notice notice-${kind}`}>{children}</div>;
}

/** 名前と値の1行 (コピーボタンつき) */
export function ValueRow({
  label,
  value,
  hint,
  mono = true,
  highlight,
  copy,
  wrap,
}: {
  label: ReactNode;
  value: string;
  hint?: ReactNode;
  mono?: boolean;
  highlight?: "ok" | "ng";
  /** コピーする値 (表示と違うとき。省略時は value) */
  copy?: string;
  /** 長い値を省略せず折り返して全部見せる (ハッシュ値など) */
  wrap?: boolean;
}) {
  return (
    <div className={`vrow ${highlight ? `vrow-${highlight}` : ""} ${wrap ? "vrow-wrap" : ""}`}>
      <div className="vrow-label">
        {label}
        {hint && <span className="vrow-hint">{hint}</span>}
      </div>
      <div className={`vrow-value ${mono ? "mono" : ""}`} title={value}>
        {value || <span className="faint">—</span>}
      </div>
      <CopyButton value={copy ?? value} />
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <span className="card-title">{title}</span>
          <div className="pane-actions">{actions}</div>
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono = true,
  autoFocus,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <input
      className={`input ${mono ? "mono" : ""} ${className}`}
      value={value}
      placeholder={placeholder}
      autoFocus={autoFocus}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="off"
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
