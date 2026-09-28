// アプリが前面に戻ったときに外部変更を反映する（FR-X-04、詳細設計書 9.6）。
// 起動時・本棚を開いたときの反映は runShelfMaintenance が行う。
// 開いている本棚そのものが外部で名前を変えられた・消された場合は、反映の前に開き直す
import { useEffect } from 'react';
import { Alert, AppState } from 'react-native';

import type { Shelf } from '@/domain/types';
import { locateOpenShelf } from '@/services/shelves';
import { syncShelf } from '@/services/sync/syncShelf';
import type { OpenShelf } from '@/state/openShelf';

export function useSyncOnForeground(
  shelf: OpenShelf,
  switchShelf: (target: Shelf | null) => Promise<void>,
): void {
  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') {
        followExternalChanges(shelf, switchShelf).catch((error: unknown) =>
          console.warn('外部変更の反映に失敗しました', error),
        );
      }
      previousState = nextState;
    });
    return () => subscription.remove();
    // switchShelf は描画のたびに作り直されるため、本棚が変わったときだけ登録し直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf]);
}

async function followExternalChanges(
  shelf: OpenShelf,
  switchShelf: (target: Shelf | null) => Promise<void>,
): Promise<void> {
  const location = locateOpenShelf(shelf);
  switch (location.kind) {
    case 'unchanged':
      await syncShelf(shelf);
      return;
    case 'renamed':
      // 開き直すと、新しい場所で外部変更の反映も行われる
      await switchShelf(location.shelf);
      return;
    case 'deleted':
      Alert.alert(
        '本棚が削除されました',
        location.next
          ? `「${shelf.name}」が見つからないため、「${location.next.name}」を開きます`
          : `「${shelf.name}」が見つからないため、新しい本棚を作成してください`,
      );
      await switchShelf(location.next);
      return;
  }
}
