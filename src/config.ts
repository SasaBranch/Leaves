// アプリ全体で意味を持つ数値の置き場所（詳細設計書 11 章）。
// 画面の色・フォントは性質の違う知識なので src/theme/tokens.ts に置く。

/** 保存するページ画像の長辺（基本設計書 1.2 Q-2） */
export const PAGE_IMAGE_MAX_EDGE_PX = 2400;
/** ページ画像の JPEG 品質。1ページ約 0.5〜1MB（NFR-P-06） */
export const PAGE_IMAGE_JPEG_QUALITY = 0.8;

/** 一覧用サムネイルの長辺。3列グリッドの表示幅の約3倍（高解像度画面対応） */
export const THUMBNAIL_MAX_EDGE_PX = 480;
/** 一覧では画質より読み込み速度を優先する */
export const THUMBNAIL_JPEG_QUALITY = 0.7;

/** ライブラリの「最近のノート」の件数 */
export const RECENT_NOTES_LIMIT = 10;

/** 検索結果の上限（NFR-P-03） */
export const SEARCH_RESULT_LIMIT = 100;
/** 入力が止まってから検索するまでの時間 */
export const SEARCH_DEBOUNCE_MS = 300;
/** 一致箇所の前後に表示する文字数 */
export const SEARCH_SNIPPET_CONTEXT_CHARS = 20;

/** A4 の幅（pt）。PDF のページ幅に使う */
export const PDF_PAGE_WIDTH_PT = 595.28;
/** 透明テキストの文字サイズ ÷ 行の高さ（行の上下の余白分を引く） */
export const OCR_TEXT_HEIGHT_RATIO = 0.85;

/** ノートブックの表紙色（基本設計書 2.2）。作成時に順番に割り当てる */
export const NOTEBOOK_COLORS = [
  '#2F5D45', // モス
  '#2D5461', // ティール
  '#6A4E38', // ブラウン
  '#4B7A5F', // リーフ
  '#3C4A5E', // スレート
  '#7A3E3E', // ワイン
] as const;

/** 書き出しファイル名が空になったときの代わり */
export const DEFAULT_EXPORT_FILE_NAME = 'Leaves';
