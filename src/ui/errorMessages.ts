// エラー → 表示文言の対応（基本設計書 7 章）。
// Record にすることで、種類を追加したときに文言の書き忘れがコンパイルエラーになる。
import type { AppErrorKind } from '@/domain/errors';

export const errorMessages: Record<AppErrorKind, string> = {
  invalidName: '名前を入力してください',
  invalidNameCharacters: '名前に / \\ : * ? " < > | と、先頭の . は使えません',
  duplicateName: '同じ場所に同じ名前のノートブックかノートがあります',
  duplicateShelfName: '同じ名前の本棚があります',
  shelfUnavailable: '本棚の場所にアクセスできません。場所を選び直すか、一覧から外してください',
  shelfMoveFailed: '本棚を移せませんでした。元の場所のまま使えます',
  invalidMove: 'ノートブックを自分自身やその中には移動できません',
  storageFull: '端末の空き容量が不足しているため保存できませんでした',
  cameraPermissionDenied: 'カメラへのアクセスが許可されていません。設定アプリから許可してください',
  pageEditFailed: 'ページを編集できませんでした',
  exportFailed: '書き出しに失敗しました。もう一度お試しください',
  exportNoteMissing: '書き出すノートが見つからないため、中止しました。一覧を読み直しました',
};
