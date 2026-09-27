// ID の採番（UUID v4。NFR-M-03）
import { randomUUID } from 'expo-crypto';

import type { NoteId, NotebookId, PageId } from '@/domain/types';

export const newNotebookId = () => randomUUID() as NotebookId;
export const newNoteId = () => randomUUID() as NoteId;
export const newPageId = () => randomUUID() as PageId;
