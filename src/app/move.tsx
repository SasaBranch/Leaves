// SC-8 移動先選択（基本設計書 4.3）
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isAppError } from '@/domain/errors';
import type { NoteId, NotebookId } from '@/domain/types';
import { moveNotebook } from '@/services/notebooks';
import { moveNote } from '@/services/notes';
import { useShelf } from '@/state/openShelf';
import { useTheme } from '@/theme/useTheme';
import { NotebookPicker, NotebookPickerHeader } from '@/ui/components/NotebookPicker';
import { errorMessages } from '@/ui/errorMessages';

type MoveTarget = { kind: 'note'; id: NoteId } | { kind: 'notebook'; id: NotebookId };

export default function MoveScreen() {
  const target = useMoveTarget();
  const moveTo = useMoveTo(target);
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg }]}>
      <NotebookPickerHeader title="移動先を選択" onCancel={() => router.back()} />
      <NotebookPicker
        excludeSubtreeOf={target.kind === 'notebook' ? target.id : null}
        onSelect={moveTo}
      />
    </SafeAreaView>
  );
}

function useMoveTarget(): MoveTarget {
  const { kind, id } = useLocalSearchParams<{ kind: MoveTarget['kind']; id: string }>();
  return kind === 'notebook' ? { kind, id: id as NotebookId } : { kind, id: id as NoteId };
}

/** 選んだ移動先へ移して閉じる。失敗したら理由を表示して、選び直せるように画面に残る */
function useMoveTo(target: MoveTarget) {
  const shelf = useShelf();
  return async (destinationId: NotebookId | null) => {
    try {
      if (target.kind === 'note') await moveNote(shelf, target.id, destinationId);
      else await moveNotebook(shelf, target.id, destinationId);
      router.back();
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : '移動できませんでした');
    }
  };
}

const styles = StyleSheet.create({ screen: { flex: 1 } });
