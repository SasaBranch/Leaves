// 処理を1本の順番待ちに並べる方法（詳細設計書 3.2）。
// DB の操作（ADR 0011）と、本棚フォルダを書き換える処理（基本設計書 6.7）の両方が使う。

export type RunExclusively = <T>(task: () => Promise<T>) => Promise<T>;

/** 渡された処理を、前の処理が終わって（成功・失敗を問わず）から順に実行する */
export function createSerialQueue(): RunExclusively {
  let last: Promise<unknown> = Promise.resolve();
  return function runExclusively<T>(task: () => Promise<T>): Promise<T> {
    const result = last.then(task, task);
    last = result.catch(() => undefined);
    return result;
  };
}
