/**
 * ツールの画面から、ほかのツールを開く。
 * 画面の切り替えは App が持っているので、知らせを送って App に開いてもらう
 */

const EVENT = "deskit:open-tool";

export function openTool(id: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: id }));
}

/** 開くように頼まれたら fn を呼ぶ (やめるときは戻り値を呼ぶ) */
export function onOpenTool(fn: (id: string) => void): () => void {
  const handler = (e: Event) => fn((e as CustomEvent<string>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
