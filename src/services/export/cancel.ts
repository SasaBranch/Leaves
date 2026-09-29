// まとめて書き出しの取り消し（詳細設計書 9.14）。
// 取り消しは失敗ではないため、専用の例外で処理を抜け、呼び出し元で「取り消した」結果に変える

export class ExportCanceledError extends Error {
  constructor() {
    super('書き出しが取り消されました');
    this.name = 'ExportCanceledError';
  }
}

/** ページの合間に呼び、取り消されていたら抜ける */
export function throwIfExportCanceled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExportCanceledError();
}
