/** 左のサイドバー (検索・ホーム・お気に入り・カテゴリ別のツール一覧) */

import { ChevronRight, LayoutGrid, Search, Settings, Star, X } from "lucide-react";
import { type CSSProperties, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { searchTools } from "../lib/search";
import { isMac, KEY_MOD } from "../platform";
import { collapsedStore, favoritesStore, useStore } from "../store";
import { CATEGORIES, TOOL_BY_ID, TOOLS, type ToolDef } from "../tools/registry";
import { Logo } from "./Logo";

export const hueStyle = (tool: ToolDef) => ({ "--hue": `var(--hue-${tool.category})` }) as CSSProperties;

function NavItem({
  tool,
  active,
  cursor,
  onOpen,
}: {
  tool: ToolDef;
  active: boolean;
  cursor?: boolean;
  onOpen: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (cursor) ref.current?.scrollIntoView({ block: "nearest" });
  }, [cursor]);
  const Icon = tool.icon;
  return (
    <button
      ref={ref}
      type="button"
      className={`nav-item ${active ? "is-active" : ""} ${cursor ? "is-cursor" : ""}`}
      style={hueStyle(tool)}
      onClick={() => onOpen(tool.id)}
    >
      <Icon size={16} strokeWidth={1.9} className="nav-icon" />
      <span className="nav-label">{tool.name}</span>
    </button>
  );
}

export function Sidebar({
  route,
  onOpen,
  query,
  setQuery,
  searchRef,
  onSettings,
}: {
  route: string;
  onOpen: (id: string) => void;
  query: string;
  setQuery: (q: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onSettings: () => void;
}) {
  const favorites = useStore(favoritesStore);
  const collapsed = useStore(collapsedStore);
  const results = useMemo(() => searchTools(TOOLS, query), [query]);
  const searching = query.trim() !== "";
  const [cursor, setCursor] = useState(0);

  useEffect(() => setCursor(0), [query]);

  const favTools = favorites.map((id) => TOOL_BY_ID.get(id)).filter((t): t is ToolDef => !!t);

  const toggleSection = (id: string) =>
    collapsedStore.set((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  return (
    <aside className="sidebar">
      <div className={`sidebar-top ${isMac ? "has-lights" : ""}`} data-tauri-drag-region>
        <div className="brand" data-tauri-drag-region>
          <Logo size={22} />
          <span className="brand-name">Deskit</span>
        </div>
      </div>

      <div className="search">
        <Search size={15} className="search-icon" />
        <input
          ref={searchRef}
          value={query}
          placeholder="ツールを検索"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              setQuery("");
              e.currentTarget.blur();
            } else if (searching && e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (searching && e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (searching && e.key === "Enter" && results[cursor]) {
              onOpen(results[cursor].id);
              setQuery("");
              e.currentTarget.blur();
            }
          }}
        />
        {query ? (
          <button type="button" className="search-clear" aria-label="検索をクリア" onClick={() => setQuery("")}>
            <X size={13} />
          </button>
        ) : (
          <kbd className="search-kbd">{KEY_MOD}K</kbd>
        )}
      </div>

      <nav className="nav">
        {searching ? (
          <>
            <div className="nav-section-label">検索結果 {results.length}件</div>
            {results.map((t, i) => (
              <NavItem
                key={t.id}
                tool={t}
                active={route === t.id}
                cursor={i === cursor}
                onOpen={(id) => {
                  onOpen(id);
                  setQuery("");
                }}
              />
            ))}
            {results.length === 0 && <div className="nav-empty">一致するツールがありません</div>}
          </>
        ) : (
          <>
            <button
              type="button"
              className={`nav-item nav-home ${route === "home" ? "is-active" : ""}`}
              onClick={() => onOpen("home")}
            >
              <LayoutGrid size={16} strokeWidth={1.9} className="nav-icon" />
              <span className="nav-label">すべてのツール</span>
              <span className="nav-count">{TOOLS.length}</span>
            </button>

            {favTools.length > 0 && (
              <div className="nav-section">
                <div className="nav-section-label">
                  <Star size={11} strokeWidth={2.4} className="fav-mark" /> お気に入り
                </div>
                {favTools.map((t) => (
                  <NavItem key={t.id} tool={t} active={route === t.id} onOpen={onOpen} />
                ))}
              </div>
            )}

            {CATEGORIES.map((c) => {
              const closed = collapsed.includes(c.id);
              return (
                <div className="nav-section" key={c.id}>
                  <button
                    type="button"
                    className={`nav-section-label is-toggle ${closed ? "is-closed" : ""}`}
                    onClick={() => toggleSection(c.id)}
                  >
                    <ChevronRight size={12} strokeWidth={2.4} className="chev" />
                    {c.name}
                  </button>
                  {!closed &&
                    TOOLS.filter((t) => t.category === c.id).map((t) => (
                      <NavItem key={t.id} tool={t} active={route === t.id} onOpen={onOpen} />
                    ))}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <div className="sidebar-foot">
        <button type="button" className="nav-item" onClick={onSettings}>
          <Settings size={16} strokeWidth={1.9} className="nav-icon" />
          <span className="nav-label">設定</span>
        </button>
      </div>
    </aside>
  );
}
