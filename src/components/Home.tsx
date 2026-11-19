/** ホーム (すべてのツールをカードで並べる) */

import { Search, Star } from "lucide-react";
import { useMemo } from "react";
import { searchTools } from "../lib/search";
import { KEY_MOD } from "../platform";
import { favoritesStore, recentStore, toggleFavorite, useStore } from "../store";
import { CATEGORIES, TOOL_BY_ID, TOOLS, type ToolDef } from "../tools/registry";
import { Logo } from "./Logo";
import { hueStyle } from "./Sidebar";

function ToolCard({ tool, onOpen, fav }: { tool: ToolDef; onOpen: (id: string) => void; fav: boolean }) {
  const Icon = tool.icon;
  return (
    <div
      className="tool-card"
      role="button"
      tabIndex={0}
      style={hueStyle(tool)}
      onClick={() => onOpen(tool.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(tool.id);
        }
      }}
    >
      <div className="tool-card-icon">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="tool-card-text">
        <div className="tool-card-name">{tool.name}</div>
        <div className="tool-card-desc">{tool.description}</div>
      </div>
      <button
        type="button"
        className={`tool-card-star ${fav ? "is-fav" : ""}`}
        aria-label={fav ? "お気に入りから外す" : "お気に入りに追加"}
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(tool.id);
        }}
      >
        <Star size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export function Home({
  onOpen,
  query,
  onFocusSearch,
}: {
  onOpen: (id: string) => void;
  query: string;
  onFocusSearch: () => void;
}) {
  const favorites = useStore(favoritesStore);
  const recent = useStore(recentStore);
  const results = useMemo(() => searchTools(TOOLS, query), [query]);
  const searching = query.trim() !== "";
  const recentTools = recent.map((id) => TOOL_BY_ID.get(id)).filter((t): t is ToolDef => !!t);
  const favTools = favorites.map((id) => TOOL_BY_ID.get(id)).filter((t): t is ToolDef => !!t);

  const grid = (tools: ToolDef[]) => (
    <div className="tool-grid">
      {tools.map((t) => (
        <ToolCard key={t.id} tool={t} onOpen={onOpen} fav={favorites.includes(t.id)} />
      ))}
    </div>
  );

  return (
    <div className="home">
      <div className="drag-strip" data-tauri-drag-region />
      <div className="home-scroll">
        <section className="hero">
          <div className="hero-glow" aria-hidden />
          <Logo size={60} />
          <div className="hero-text">
            <h1>Deskit</h1>
            <p>開発に使う小さな道具を、ひとつの場所に。すべてオフラインで動きます。</p>
          </div>
          <button type="button" className="hero-search" onClick={onFocusSearch}>
            <Search size={15} />
            <span>ツールを検索…</span>
            <kbd>{KEY_MOD}K</kbd>
          </button>
        </section>

        {searching ? (
          <section className="home-section">
            <h2>
              検索結果 <span className="count">{results.length}</span>
            </h2>
            {results.length > 0 ? grid(results) : <p className="empty">一致するツールがありません</p>}
          </section>
        ) : (
          <>
            {recentTools.length > 0 && (
              <section className="home-section">
                <h2>最近使ったツール</h2>
                <div className="recent-row">
                  {recentTools.map((t) => {
                    const Icon = t.icon;
                    return (
                      <button key={t.id} type="button" className="recent-chip" style={hueStyle(t)} onClick={() => onOpen(t.id)}>
                        <Icon size={14} strokeWidth={2} />
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {favTools.length > 0 && (
              <section className="home-section">
                <h2>
                  お気に入り <span className="count">{favTools.length}</span>
                </h2>
                {grid(favTools)}
              </section>
            )}
            {CATEGORIES.map((c) => {
              const tools = TOOLS.filter((t) => t.category === c.id);
              return (
                <section className="home-section" key={c.id}>
                  <h2>
                    {c.name} <span className="count">{tools.length}</span>
                  </h2>
                  {grid(tools)}
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
