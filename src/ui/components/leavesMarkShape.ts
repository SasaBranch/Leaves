// scripts/generate-icons.py が生成するファイル。手で書き換えない（形の正本はスクリプトの座標）
// アプリ内のロゴ（LeavesMark）の面。座標は葉の外枠を (0, 0)〜(width, height) とする
export const LEAVES_MARK_SIZE = { width: 118.13, height: 122.78 };

/** brightness: 面の明るさ（1 がいちばん明るい）。単色で描くときの濃淡に使う */
export const LEAVES_MARK_FACETS: { points: string; color: string; brightness: number }[] = [
  { points: '0.00,26.02 0.49,70.08 26.40,71.75', color: '#C6EFD3', brightness: 1.00 },
  { points: '0.00,26.02 37.91,48.48 26.40,71.75', color: '#8FE0B0', brightness: 0.83 },
  { points: '0.49,70.08 14.66,109.01 26.40,71.75', color: '#8FE0B0', brightness: 0.83 },
  { points: '37.91,48.48 64.54,80.21 26.40,71.75', color: '#5FD08E', brightness: 0.50 },
  { points: '14.66,109.01 26.40,71.75 55.20,121.63', color: '#5FD08E', brightness: 0.50 },
  { points: '64.54,80.21 26.40,71.75 55.20,121.63', color: '#34A865', brightness: 0.33 },
  { points: '110.06,0.00 64.41,30.25 84.44,57.55', color: '#6FD99A', brightness: 0.67 },
  { points: '110.06,0.00 118.13,54.16 84.44,57.55', color: '#34A865', brightness: 0.33 },
  { points: '64.41,30.25 36.24,72.87 84.44,57.55', color: '#34A865', brightness: 0.33 },
  { points: '118.13,54.16 105.30,103.62 84.44,57.55', color: '#1E7F48', brightness: 0.17 },
  { points: '36.24,72.87 84.44,57.55 55.40,122.78', color: '#1E7F48', brightness: 0.17 },
  { points: '105.30,103.62 84.44,57.55 55.40,122.78', color: '#0F4A2B', brightness: 0.00 },
];
