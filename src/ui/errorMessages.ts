// エラー → 表示文言の対応（基本設計書 7 章）。
// Record にすることで、種類を追加したときに文言の書き忘れがコンパイルエラーになる。
import type { AppErrorKind } from '@/domain/errors';

export const errorMessages: Record<AppErrorKind, string> = {
  invalidName: '名前を入力してください',
  duplicateName: '同じ場所に同じ名前のノートブックがあります',
  invalidMove: 'ノートブックを自分自身やその中には移動できません',
  storageFull: '端末の空き容量が不足しているため保存できませんでした',
  cameraPermissionDenied: 'カメラへのアクセスが許可されていません。設定アプリから許可してください',
  exportFailed: '書き出しに失敗しました。もう一度お試しください',
};
