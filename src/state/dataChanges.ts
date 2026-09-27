// データ変更の通知（詳細設計書 7 章）。
// 通知は「何かが変わった」の1種類だけ。受け取った画面は自分のクエリを取り直す。
// 変更の種類ごとの細かい通知は、性能問題が実測で出るまで作らない。

type Listener = () => void;

const listeners = new Set<Listener>();

/** DB を更新するトランザクションがコミットされた後に1回呼ぶ */
export function notifyDataChanged(): void {
  for (const listener of [...listeners]) {
    listener();
  }
}

/** 戻り値の関数を呼ぶと購読を解除する */
export function subscribeDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
