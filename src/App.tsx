import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { Home } from "./components/Home";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import { ToolView } from "./components/ToolView";
import { UpdateBanner } from "./components/UpdateBanner";
import { onOpenTool } from "./nav";
import { inTauri, isMac } from "./platform";
import { lastRouteStore, pushRecent } from "./store";
import { TOOL_BY_ID } from "./tools/registry";

/** 表示中の画面。"home" か、ツールのID */
function initialRoute() {
  const r = lastRouteStore.get();
  return r === "home" || TOOL_BY_ID.has(r) ? r : "home";
}

export default function App() {
  const [route, setRoute] = useState(initialRoute);
  /*
   * 一度開いたツールは裏で残しておく。
   * ツールを行き来しても、入力した内容がそのまま残るようにするため
   */
  const [opened, setOpened] = useState<string[]>(() => (route === "home" ? [] : [route]));
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const open = useCallback((id: string) => {
    setRoute(id);
    lastRouteStore.set(id);
    if (id !== "home") {
      setOpened((list) => (list.includes(id) ? list : [...list, id]));
      pushRecent(id);
    }
  }, []);

  // ツールの画面から「ほかのツールを開く」を頼まれたとき
  useEffect(() => onOpenTool((id) => TOOL_BY_ID.has(id) && open(id)), [open]);

  const focusSearch = useCallback(() => {
    searchRef.current?.focus();
    searchRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch();
      } else if (mod && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusSearch]);

  // macOS のメニュー「Deskitについて」
  useEffect(() => {
    if (!inTauri) return;
    const un = listen("show-about", () => setSettingsOpen(true));
    return () => {
      un.then((f) => f());
    };
  }, []);

  return (
    <div className="app">
      <Sidebar
        route={route}
        onOpen={open}
        query={query}
        setQuery={setQuery}
        searchRef={searchRef}
        onSettings={() => setSettingsOpen(true)}
      />
      <main className="main">
        {route === "home" && <Home onOpen={open} query={query} onFocusSearch={focusSearch} />}
        {opened.map((id) => {
          const tool = TOOL_BY_ID.get(id);
          return tool ? <ToolView key={id} tool={tool} active={route === id} /> : null;
        })}
      </main>
      <UpdateBanner />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
