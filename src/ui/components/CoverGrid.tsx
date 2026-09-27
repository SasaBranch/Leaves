// ノートブックとノートの表紙を並べるグリッド。ノートブックを先に並べる（FR-F-07）
import { router } from 'expo-router';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import type { NoteSummary, NotebookSummary } from '@/domain/types';

import { NoteCover } from './NoteCover';
import { NotebookCover } from './NotebookCover';

const HORIZONTAL_PADDING = 20;

export function CoverGrid({
  notebooks,
  notes,
  columns,
  columnGap,
  onNotebookLongPress,
  onNoteLongPress,
}: {
  notebooks: NotebookSummary[];
  notes: NoteSummary[];
  columns: number;
  columnGap: number;
  onNotebookLongPress: (notebook: NotebookSummary) => void;
  onNoteLongPress: (note: NoteSummary) => void;
}) {
  const { width } = useWindowDimensions();
  const itemWidth = (width - HORIZONTAL_PADDING * 2 - columnGap * (columns - 1)) / columns;
  return (
    <View style={[styles.grid, { columnGap }]}>
      {notebooks.map((notebook) => (
        <NotebookCover
          key={notebook.id}
          notebook={notebook}
          width={itemWidth}
          onPress={() => router.push({ pathname: '/notebook/[id]', params: { id: notebook.id } })}
          onLongPress={() => onNotebookLongPress(notebook)}
        />
      ))}
      {notes.map((note) => (
        <NoteCover
          key={note.id}
          note={note}
          width={itemWidth}
          onPress={() => router.push({ pathname: '/note/[id]', params: { id: note.id } })}
          onLongPress={() => onNoteLongPress(note)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 18,
    paddingHorizontal: HORIZONTAL_PADDING,
  },
});
