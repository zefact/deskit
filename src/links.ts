/** 公式サイトや GitHub の場所 */

/** 公式サイト (紹介ページ。docs/ を GitHub Pages で公開している) */
export const SITE_URL = "https://zefact.github.io/deskit/";

export const REPO_URL = "https://github.com/zefact/deskit";

/** そのバージョンの変更点 (GitHub Releases のページ) */
export const releaseNotesUrl = (version: string) => `${REPO_URL}/releases/tag/v${version}`;
