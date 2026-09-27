// 画面用フックの共通部分（詳細設計書 8 章）: DB から読み、データ変更の通知を受けたら読み直す。
// 読み直し中は前回の値を表示し続ける（画面のちらつきを防ぐため）
import { useEffect, useState } from 'react';

import type { Db } from '@/db/db';
import { useDb } from '@/state/database';
import { subscribeDataChanged } from '@/state/dataChanges';

/**
 * query は key が変わったときだけ読み直す。key には query が使う引数（ID・並び順など）を
 * 文字列でまとめて渡す（依存配列の書き忘れで古いデータを表示しないように、引数を1つに絞る）
 */
export function useDataQuery<T>(
  key: string,
  query: (db: Db) => Promise<T>,
): { data: T | undefined; error: unknown } {
  const db = useDb();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let isCurrent = true;
    const load = () => {
      query(db).then(
        (result) => {
          if (!isCurrent) return;
          setData(result);
          setError(undefined);
        },
        (reason: unknown) => {
          if (isCurrent) setError(reason);
        },
      );
    };
    load();
    const unsubscribe = subscribeDataChanged(load);
    return () => {
      isCurrent = false;
      unsubscribe();
    };
    // query は毎回作り直される関数なので依存に含めず、key で読み直しを制御する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, key]);

  return { data, error };
}
