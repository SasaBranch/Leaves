// 利用者に理由を伝える必要があるエラー（詳細設計書 10 章）。
// 種類は kind で区別し、クラスは増やさない（区別したいのは種類だけで、振る舞いは同じため）。

export type AppErrorKind =
  | 'invalidName' // 名前が空
  | 'duplicateName' // 同じ場所に同名
  | 'invalidMove' // 自分自身・子孫への移動
  | 'storageFull' // 空き容量不足
  | 'cameraPermissionDenied'
  | 'photoPermissionDenied'
  | 'exportFailed';

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
