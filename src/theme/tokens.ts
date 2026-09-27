// 画面の色とフォント（基本設計書 2.2〜2.3）。見た目の知識の唯一の置き場所。
// ノートブックの表紙色は保存されるデータなので src/config.ts の NOTEBOOK_COLORS にある。

export type ColorTokens = {
  /** 画面背景 */
  bg: string;
  /** ノート表示画面の背景 */
  stage: string;
  /** カード・シート */
  surface: string;
  /** 入力欄・二次ボタン */
  surface2: string;
  /** 区切り線・枠 */
  border: string;
  /** 本文 */
  text: string;
  /** 補足テキスト */
  muted: string;
  /** 主ボタン・選択状態 */
  accent: string;
  /** accent 上の文字 */
  onAccent: string;
  /** リンク・強調文字 */
  accentText: string;
  /** 検索ハイライト・状態チップ背景 */
  accentSoft: string;
  /** 紙（サムネイル・ページ背景）。ダークモードでも紙色のまま */
  paper: string;
  /** 削除など取り消せない操作 */
  danger: string;
};

export const darkColors: ColorTokens = {
  bg: '#0E1310',
  stage: '#0A0E0B',
  surface: '#161D18',
  surface2: '#1D2620',
  border: '#29342C',
  text: '#E7ECE8',
  muted: '#97A49B',
  accent: '#5FD08E',
  onAccent: '#08240F',
  accentText: '#7EDDA5',
  accentSoft: 'rgba(95,208,142,0.16)',
  paper: '#F3F0E6',
  danger: '#F2857D',
};

export const lightColors: ColorTokens = {
  bg: '#F6F7F3',
  stage: '#E9ECE7',
  surface: '#FFFFFF',
  surface2: '#EBEFE9',
  border: '#DFE5DD',
  text: '#17201A',
  muted: '#5B685F',
  accent: '#1E7F48',
  onAccent: '#FFFFFF',
  accentText: '#1E7F48',
  accentSoft: '#DDF0E4',
  paper: '#FFFEFA',
  danger: '#C0392B',
};

/** fontFamily に指定する名前。src/theme/fonts.ts で読み込むフォントと対応する */
export const fontFamilies = {
  logo: 'Fraunces_600SemiBold',
  regular: 'ZenKakuGothicNew_400Regular',
  medium: 'ZenKakuGothicNew_500Medium',
  bold: 'ZenKakuGothicNew_700Bold',
} as const;
