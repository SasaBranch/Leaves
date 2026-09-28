// エラー → 表示文言の対応（基本設計書 7 章）。
// Record にすることで、種類を追加したときに文言の書き忘れがコンパイルエラーになる。
import type { AppErrorKind } from '@/domain/errors';

export const errorMessages: Record<AppErrorKind, string> = {
  invalidName: '名前を入力してください',
  invalidNameCharacters: '名前に / \\ : * ? " < > | と、先頭の . は使えません',
  duplicateName: '同じ場所に同じ名前のノートブックかノートがあります',
  duplicateShelfName: '同じ名前の本棚があります',
  invalidMove: 'ノートブックを自分自身やその中には移動できません',
  storageFull: '端末の空き容量が不足しているため保存できませんでした',
  cameraPermissionDenied: 'カメラへのアクセスが許可されていません。設定アプリから許可してください',
  pageEditFailed: 'ページを編集できませんでした',
  exportFailed: '書き出しに失敗しました。もう一度お試しください',
};
