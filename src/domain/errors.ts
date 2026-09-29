// 利用者に理由を伝える必要があるエラー（詳細設計書 10 章）。
// 種類は kind で区別し、クラスは増やさない（区別したいのは種類だけで、振る舞いは同じため）。

export type AppErrorKind =
  | 'invalidName' // 名前が空
  | 'invalidNameCharacters' // 使えない文字・先頭の .
  | 'duplicateName' // 同じ場所に同名（ノートブック・ノートを合わせて）
  | 'duplicateShelfName' // 同名の本棚
  | 'shelfUnavailable' // 別の場所の本棚にアクセスできない（FR-L-04）
  | 'shelfMoveFailed' // 本棚の場所の移動に失敗（元のまま残る）
  | 'invalidMove' // 自分自身・子孫への移動
  | 'storageFull' // 空き容量不足
  | 'cameraPermissionDenied'
  | 'exportFailed'
  | 'exportNoteMissing' // まとめて書き出しの途中でノートが見つからない
  | 'pageEditFailed'; // ページの編集（台形補正・回転・元に戻す）に失敗

export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    options?: { cause?: unknown },
  ) {
    super(kind, options);
    this.name = 'AppError';
  }
}

export function isAppError(error: unknown, kind?: AppErrorKind): error is AppError {
  return error instanceof AppError && (kind === undefined || error.kind === kind);
}
