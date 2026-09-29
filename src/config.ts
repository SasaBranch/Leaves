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

/**
 * 1ページ保存するのに最低限必要な空き容量。ページ画像（最大約 1MB）とサムネイル、
 * 変換途中の一時ファイルの分に余裕を持たせた値。これを下回ると保存を始めない
 */
export const REQUIRED_FREE_SPACE_PER_PAGE_BYTES = 5 * 1024 * 1024;

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

/** SC-9 の本棚名の初期値と、v1.0 のデータの移行先（基本設計書 4.3, 6.9） */
export const DEFAULT_SHELF_NAME = 'マイ本棚';

/** ページのファイル名の桁数（001.jpg）。Finder で 999 ページまで番号順に並ぶ */
export const PAGE_FILE_NUMBER_DIGITS = 3;

/** 外部で置かれた画像のうち、ページとして取り込むもの（基本設計書 6.7）。小文字で比較する */
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic'];

/**
 * 外部変更の走査で、何フォルダごとに画面の描画・操作へ順番を譲るか。
 * ファイル操作は JS スレッドを止めるため、1,000 フォルダ（約1秒）を一度に走らせないようにする（ADR 0021）
 */
export const SYNC_YIELD_EVERY_FOLDERS = 50;

/** SC-11 の拡大鏡の倍率。四隅を紙の角に合わせやすくする（詳細設計書 9.12） */
export const EDIT_MAGNIFIER_SCALE = 2;

/** iCloud のダウンロード待ちがあったとき、次の反映までの時間（詳細設計書 9.13） */
export const ICLOUD_RESYNC_DELAY_MS = 5000;
/** 上の再反映の回数の上限（約30秒）。それ以降は次に前面に戻ったときに反映する */
export const ICLOUD_RESYNC_MAX_TIMES = 6;

/** まとめて書き出しの Markdown で、ノートのフォルダ名の先頭に付ける番号の最低の桁数（01_, 02_ …）。詳細設計書 9.14 */
export const EXPORT_FOLDER_NUMBER_MIN_DIGITS = 2;
