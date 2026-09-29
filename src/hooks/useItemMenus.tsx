// ノートブック・ノートの長押しメニューと「新しいノートブック」（基本設計書 4.3 SC-1/SC-2）。
// ライブラリとノートブックの両画面で同じ操作を出すため、メニューとダイアログをまとめて持つ
import { router } from 'expo-router';
import { useState, type ReactElement } from 'react';
import { Alert } from 'react-native';

import { NOTEBOOK_COLORS } from '@/config';
import { countNotebookContents } from '@/db/notebookRepository';
import { isAppError } from '@/domain/errors';
import type { Notebook, NotebookId, NoteSummary, SortOrder } from '@/domain/types';
import {
  changeNotebookColor,
  createNotebook,
  deleteNotebookWithContents,
  renameNotebook,
} from '@/services/notebooks';
import { shareExport } from '@/services/export/shareExport';
import { deleteNote, renameNote } from '@/services/notes';
import { useShelf } from '@/state/openShelf';
import { ActionMenu, type ActionMenuItem } from '@/ui/components/ActionMenu';
import { TextPromptModal } from '@/ui/components/TextPromptModal';
import { errorMessages } from '@/ui/errorMessages';
import { showingErrors } from '@/ui/showingErrors';

/** 表紙色の選択肢の表示名（NOTEBOOK_COLORS と同じ順） */
const COLOR_NAMES = ['モス', 'ティール', 'ブラウン', 'リーフ', 'スレート', 'ワイン'];

type Menu = { title: string; items: ActionMenuItem[] };

/**
 * exportTogetherSort: 「まとめて書き出し」を出すときの、今の並び順（SC-12 の最初の順番に使う）。
 * ノートブック画面のヘッダーで、直下にノートがあるときだけ渡す（詳細設計書 9.14）
 */
type NotebookMenuOptions = { exportTogetherSort?: SortOrder };
type Prompt = {
  title: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void>;
};

export function useItemMenus(): {
  openNotebookMenu: (notebook: Notebook, options?: NotebookMenuOptions) => void;
  openNoteMenu: (note: NoteSummary) => void;
  openCreateNotebook: (parentId: NotebookId | null) => void;
  menusElement: ReactElement;
} {
  const shelf = useShelf();
  const [menu, setMenu] = useState<Menu | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);

  const openCreateNotebook = (parentId: NotebookId | null) =>
    setPrompt({
      title: '新しいノートブック',
      submitLabel: '作成',
      onSubmit: showingErrors(async (name) => {
        await createNotebook(shelf, name, parentId);
      }),
    });

  const openNotebookMenu = (notebook: Notebook, options: NotebookMenuOptions = {}) =>
    setMenu({
      title: notebook.name,
      items: [
        {
          label: '名前を変更',
          onPress: () =>
            setPrompt({
              title: 'ノートブックの名前',
              initialValue: notebook.name,
              submitLabel: '変更',
              onSubmit: showingErrors((name) => renameNotebook(shelf, notebook.id, name)),
            }),
        },
        {
          label: '表紙の色',
          onPress: () =>
            setMenu({
              title: '表紙の色',
              items: NOTEBOOK_COLORS.map((color, index) => ({
                label: COLOR_NAMES[index] ?? color,
                onPress: () => changeNotebookColor(shelf, notebook.id, color),
              })),
            }),
        },
        { label: '中のノートブックを作成', onPress: () => openCreateNotebook(notebook.id) },
        ...(options.exportTogetherSort
          ? [
              {
                label: 'まとめて書き出し',
                onPress: () =>
                  router.push({
                    pathname: '/notebook/[id]/export',
                    params: { id: notebook.id, sort: options.exportTogetherSort },
                  }),
              },
            ]
          : []),
        {
          label: '移動',
          onPress: () =>
            router.push({ pathname: '/move', params: { kind: 'notebook', id: notebook.id } }),
        },
        { label: '削除', destructive: true, onPress: () => confirmDeleteNotebook(notebook) },
      ],
    });

  const openNoteMenu = (note: NoteSummary) =>
    setMenu({
      title: note.title,
      items: [
        {
          label: '名前を変更',
          onPress: () =>
            setPrompt({
              title: 'ノートの名前',
              initialValue: note.title,
              submitLabel: '変更',
              onSubmit: showingErrors((title) => renameNote(shelf, note.id, title)),
            }),
        },
        {
          label: '移動',
          onPress: () => router.push({ pathname: '/move', params: { kind: 'note', id: note.id } }),
        },
        { label: 'PDF で書き出し', onPress: () => exportNote(note, 'pdf') },
        { label: 'Markdown で書き出し', onPress: () => exportNote(note, 'markdown') },
        {
          label: '削除',
          destructive: true,
          onPress: () =>
            Alert.alert(
              `「${note.title}」を削除しますか？`,
              `${note.pageCount} ページが削除されます`,
              [
                { text: 'キャンセル', style: 'cancel' },
                { text: '削除', style: 'destructive', onPress: () => deleteNote(shelf, note.id) },
              ],
            ),
        },
      ],
    });

  async function exportNote(note: NoteSummary, format: 'pdf' | 'markdown') {
    try {
      await shareExport(shelf, format, note.id);
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : '書き出しに失敗しました');
    }
  }

  /** 中身の件数を示してから確認する（FR-F-05。ゴミ箱がないため） */
  async function confirmDeleteNotebook(notebook: Notebook) {
    const contents = await countNotebookContents(shelf.db, notebook.id);
    Alert.alert(
      `「${notebook.name}」を削除しますか？`,
      `中のノートブック ${contents.notebooks} 件・ノート ${contents.notes} 件もすべて削除されます`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => deleteNotebookWithContents(shelf, notebook.id),
        },
      ],
    );
  }

  const menusElement = (
    <>
      <ActionMenu
        visible={menu !== null}
        title={menu?.title}
        items={menu?.items ?? []}
        onClose={() => setMenu(null)}
      />
      <TextPromptModal
        visible={prompt !== null}
        title={prompt?.title ?? ''}
        initialValue={prompt?.initialValue}
        submitLabel={prompt?.submitLabel ?? ''}
        onSubmit={prompt?.onSubmit ?? (async () => {})}
        onClose={() => setPrompt(null)}
      />
    </>
  );

  return { openNotebookMenu, openNoteMenu, openCreateNotebook, menusElement };
}
