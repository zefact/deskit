/** ツール1つ分の画面 (上の見出しと、ツール本体) */

import { Star } from "lucide-react";
import { Component, type ReactNode, Suspense } from "react";
import { favoritesStore, toggleFavorite, useStore } from "../store";
import { categoryOf, type ToolDef } from "../tools/registry";
import { hueStyle } from "./Sidebar";

/** ツールの中で例外が起きても、アプリ全体は落とさない */
class ToolBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="tool-crash">
          <p>このツールでエラーが起きました。</p>
          <pre>{this.state.error.message}</pre>
          <button type="button" className="btn btn-default" onClick={() => this.setState({ error: null })}>
            もう一度表示する
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ToolView({ tool, active }: { tool: ToolDef; active: boolean }) {
  const favorites = useStore(favoritesStore);
  const fav = favorites.includes(tool.id);
  const Icon = tool.icon;
  const Body = tool.component;
  return (
    <div className="tool-view" hidden={!active} style={hueStyle(tool)}>
      <header className="topbar" data-tauri-drag-region>
        <div className="topbar-icon">
          <Icon size={18} strokeWidth={1.9} />
        </div>
        <div className="topbar-titles" data-tauri-drag-region>
          <div className="topbar-crumb">{categoryOf(tool.category).name}</div>
          <h1>{tool.name}</h1>
        </div>
        <p className="topbar-desc">{tool.description}</p>
        <button
          type="button"
          className={`star-btn ${fav ? "is-fav" : ""}`}
          onClick={() => toggleFavorite(tool.id)}
          aria-label={fav ? "お気に入りから外す" : "お気に入りに追加"}
          data-tip={fav ? "お気に入りから外す" : "お気に入りに追加"}
        >
          <Star size={16} strokeWidth={2} />
        </button>
      </header>
      <div className="tool-body">
        <ToolBoundary>
          <Suspense fallback={<div className="tool-loading" />}>
            <Body active={active} />
          </Suspense>
        </ToolBoundary>
      </div>
    </div>
  );
}
