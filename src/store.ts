/**
 * localStorage に保存する小さな設定値。
 *
 * 画面のどこからでも読み書きでき、変わったら使っている部品が描き直される。
 * localStorage が使えない環境 (読み取り専用など) でも動きは止めない
 */

import { useSyncExternalStore } from "react";

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
}

const PREFIX = "deskit-";

export function createStore<T>(key: string, initial: T, validate?: (v: unknown) => v is T): Store<T> {
  let value = initial;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (!validate || validate(parsed)) value = parsed as T;
    }
  } catch {
    // 壊れた値・使えない localStorage は既定値で続ける
  }
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next) {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // 保存できなくても、この起動中は使える
      }
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** お気に入りのツール (並びは追加した順) */
export const favoritesStore = createStore<string[]>("favorites", [], isStringArray);

/** 最近使ったツール (新しい順) */
export const recentStore = createStore<string[]>("recent", [], isStringArray);

/** 前回開いていた画面 */
export const lastRouteStore = createStore<string>(
  "last-route",
  "home",
  (v): v is string => typeof v === "string",
);

/** サイドバーで畳んだカテゴリ */
export const collapsedStore = createStore<string[]>("collapsed", [], isStringArray);

export const editorFontSizeStore = createStore<number>(
  "editor-font-size",
  13,
  (v): v is number => typeof v === "number" && v >= 10 && v <= 20,
);

export function toggleFavorite(id: string) {
  favoritesStore.set((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
}

export function pushRecent(id: string) {
  recentStore.set((list) => [id, ...list.filter((x) => x !== id)].slice(0, 8));
}
