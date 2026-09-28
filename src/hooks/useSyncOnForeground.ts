// アプリが前面に戻ったときに外部変更を反映する（FR-X-04、詳細設計書 9.6）。
// 起動時・本棚を開いたときの反映は runShelfMaintenance が行う
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { syncShelf } from '@/services/sync/syncShelf';
import type { OpenShelf } from '@/state/openShelf';

export function useSyncOnForeground(shelf: OpenShelf): void {
  useEffect(() => {
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') {
        syncShelf(shelf).catch((error: unknown) =>
          console.warn('外部変更の反映に失敗しました', error),
        );
      }
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [shelf]);
}
