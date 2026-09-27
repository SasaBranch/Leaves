// 表示中のノート・ノートブックが削除されたら、前の画面へ戻る。
// 削除はその画面のメニューからも、別の経路（親ノートブックごとの削除など）からも起こりうるため、データの側で判断する
import { router } from 'expo-router';
import { useEffect } from 'react';

/** data: 読み込み中は undefined、見つからなければ null（useDataQuery の約束） */
export function useLeaveWhenDeleted(data: unknown): void {
  useEffect(() => {
    if (data === null && router.canGoBack()) router.back();
  }, [data]);
}
