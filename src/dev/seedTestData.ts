// 性能計測用のテストデータ生成（詳細設計書 12 章。開発ビルド限定）。
// 要件定義書 7.2 の想定量（ノート1,000件・ページ5,000枚）で、起動・一覧・検索の時間を実機で測るために使う。
// 片付けは既存の操作（「テストデータ」ノートブックの削除）で行うため、削除機能は持たない。
import type { File } from 'expo-file-system';
import { Alert } from 'react-native';

import { NOTEBOOK_COLORS, PAGE_IMAGE_MAX_EDGE_PX } from '@/config';
import type { Db } from '@/db/db';
import { insertNote } from '@/db/noteRepository';
import { insertNotebook, listChildNotebooks } from '@/db/notebookRepository';
import { insertPage, listAllPageIds } from '@/db/pageRepository';
import type { Note, Notebook, NotebookId, Page } from '@/domain/types';
import { newNoteId, newNotebookId, newPageId } from '@/native/randomId';
import { notifyDataChanged } from '@/state/dataChanges';
import { thumbnailFile } from '@/storage/paths';

export type SeedOptions = { noteCount: number; pagesPerNote: number };

export const ROOT_NOTEBOOK_NAME = 'テストデータ';
const DEFAULT_SEED_OPTIONS: SeedOptions = { noteCount: 1000, pagesPerNote: 5 };
const CHILD_NOTEBOOK_COUNT = 10;
/** 1回のトランザクションで入れるノート数。長く DB を占有して画面や OCR を止めないよう分ける */
const NOTES_PER_TRANSACTION = 100;
/** ノートごとに更新日時をずらす幅。1,000件で約8か月に広がり、更新順の並べ替えが意味を持つ */
const NOTE_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 手書きノート1ページの OCR 文字数の目安（spikes/r1-trigram-search.js と同じ） */
const OCR_TEXT_CHARS = 400;
/** A4 縦を長辺 2400px で保存したときの幅 */
const PAGE_WIDTH_PX = 1800;

// 検索で当たり外れが出るよう、分野の違う文を混ぜる（spikes/r1-trigram-search.js と同じ文）
const SAMPLE_SENTENCES = [
  '固有値と固有ベクトルの定義を確認する。',
  '行列式が零になる条件から特性方程式を立てる。',
  '線形写像の核と像の次元の関係を整理した。',
  '次回の定例会議までに見積りを出すこと。',
  'リリース日は十月十五日で確定した。',
  'デザインの最終確認を金曜日に行う。',
  'イシューとは答えを出すべき問題のことである。',
  '仮説を立ててから分析の設計を行う。',
  '牛乳とたまごとノートを三冊買う。',
  '京都の嵐山から伏見稲荷へ移動する。',
  '対称行列の固有値は実数になる。',
  '部分空間であるための条件は三つある。',
  'TODO: 佐藤さんに資料を送る',
  'Ax = λx (x ≠ 0) を満たす λ を求める。',
  '課題の提出期限は十月三日、A4で二枚以内。',
];

type NoteWithPages = { note: Note; pages: Page[] };

/** ライブラリのロゴの長押しから呼ぶ。時間がかかり件数も多いため、確認してから作る */
export function confirmSeedTestData(db: Db): void {
  const { noteCount, pagesPerNote } = DEFAULT_SEED_OPTIONS;
  Alert.alert(
    `テストデータ（ノート${noteCount.toLocaleString()}件・ページ${(noteCount * pagesPerNote).toLocaleString()}枚）を作成しますか？`,
    undefined,
    [
      { text: 'キャンセル', style: 'cancel' },
      { text: '作成', onPress: () => void seedTestDataWithTiming(db) },
    ],
  );
}

/** 作成時間も計測の参考になるため、完了時に表示する */
async function seedTestDataWithTiming(db: Db): Promise<void> {
  const startedAt = performance.now();
  try {
    await seedTestData(db);
    const seconds = (performance.now() - startedAt) / 1000;
    Alert.alert(`テストデータを作成しました（${seconds.toFixed(1)} 秒）`);
  } catch (error) {
    Alert.alert('テストデータを作成できませんでした', String(error));
  }
}

/**
 * 「テストデータ」ノートブックの下に、子ノートブックとノート・ページを作る。
 * ページは OCR 済み（done）で作るため、OCR キューは動かず、検索対象の本文もすぐに入る。
 */
export async function seedTestData(
  db: Db,
  options: SeedOptions = DEFAULT_SEED_OPTIONS,
): Promise<void> {
  await rejectExistingTestData(db);
  const now = Date.now();
  const notebooks = buildNotebooks(new Date(now).toISOString());
  const childIds = notebooks.slice(1).map((notebook) => notebook.id);
  const sampleThumbnail = await findSampleThumbnail(db);

  try {
    await db.transaction(async (tx) => {
      for (const notebook of notebooks) await insertNotebook(tx, notebook);
    });
    for (let start = 0; start < options.noteCount; start += NOTES_PER_TRANSACTION) {
      const end = Math.min(start + NOTES_PER_TRANSACTION, options.noteCount);
      const batch = buildNotesWithPages(start, end, { childIds, options, now });
      await insertNotesWithPages(db, batch);
      if (sampleThumbnail) await copyThumbnail(sampleThumbnail, batch);
    }
  } finally {
    // 途中で失敗しても、コミット済みの分を画面に反映して削除できるようにする
    notifyDataChanged();
  }
}

/** 二重に作ると件数が想定と変わり計測にならないため、作り直すときは先に削除してもらう */
async function rejectExistingTestData(db: Db): Promise<void> {
  const roots = await listChildNotebooks(db, null, 'name');
  if (roots.some((notebook) => notebook.name === ROOT_NOTEBOOK_NAME)) {
    throw new Error(
      `「${ROOT_NOTEBOOK_NAME}」ノートブックが既にあります。削除してから作り直してください`,
    );
  }
}

/** 先頭がライブラリ直下の「テストデータ」、残りがその子ノートブック */
function buildNotebooks(now: string): Notebook[] {
  const root = buildNotebook(ROOT_NOTEBOOK_NAME, null, 0, now);
  const children = Array.from({ length: CHILD_NOTEBOOK_COUNT }, (_, index) =>
    buildNotebook(`ノートブック ${String(index + 1).padStart(2, '0')}`, root.id, index, now),
  );
  return [root, ...children];
}

function buildNotebook(
  name: string,
  parentId: NotebookId | null,
  index: number,
  now: string,
): Notebook {
  return {
    id: newNotebookId(),
    parentId,
    name,
    // 余りは必ず配列の範囲内に収まる
    color: NOTEBOOK_COLORS[index % NOTEBOOK_COLORS.length]!,
    createdAt: now,
    updatedAt: now,
  };
}

/** start 番目から end 番目の手前までのノート。子ノートブックへ順番に振り分ける */
function buildNotesWithPages(
  start: number,
  end: number,
  context: { childIds: NotebookId[]; options: SeedOptions; now: number },
): NoteWithPages[] {
  const { childIds, options, now } = context;
  return Array.from({ length: end - start }, (_, offset) => {
    const noteIndex = start + offset;
    const timestamp = new Date(now - noteIndex * NOTE_UPDATE_INTERVAL_MS).toISOString();
    const note: Note = {
      id: newNoteId(),
      // 余りは必ず配列の範囲内に収まる
      notebookId: childIds[noteIndex % childIds.length]!,
      title: `テストノート ${String(noteIndex + 1).padStart(4, '0')}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const pages = Array.from({ length: options.pagesPerNote }, (__, position) => ({
      id: newPageId(),
      noteId: note.id,
      position,
      width: PAGE_WIDTH_PX,
      height: PAGE_IMAGE_MAX_EDGE_PX,
      ocrStatus: 'done' as const,
      ocrText: buildSampleOcrText(noteIndex * options.pagesPerNote + position),
      ocrLines: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    return { note, pages };
  });
}

/** 同じ seed なら同じ本文になる。ページごとに文の並びを変え、検索の一致件数にばらつきを出す */
function buildSampleOcrText(seed: number): string {
  let text = '';
  let index = seed;
  while (text.length < OCR_TEXT_CHARS) {
    text += SAMPLE_SENTENCES[index % SAMPLE_SENTENCES.length];
    index = (index * 7 + 3) % 9973;
  }
  return text.slice(0, OCR_TEXT_CHARS);
}

async function insertNotesWithPages(db: Db, batch: NoteWithPages[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const { note, pages } of batch) {
      await insertNote(tx, note);
      for (const page of pages) await insertPage(tx, page);
    }
  });
}

/**
 * 画像は作らない。計測したいのは DB・一覧・検索で、画像の入出力ではないため。
 * 一覧の表紙が紙の色ばかりにならないよう、既存ページのサムネイルがあれば全ページに複製する。
 * ページ画像（pages/{id}.jpg）がなくても、整合性チェックは DB の行を消さない（詳細設計書 9.6）
 */
async function findSampleThumbnail(db: Db): Promise<File | null> {
  const pageIds = await listAllPageIds(db);
  const pageIdWithThumbnail = pageIds.find((id) => thumbnailFile(id).exists);
  return pageIdWithThumbnail ? thumbnailFile(pageIdWithThumbnail) : null;
}

async function copyThumbnail(source: File, batch: NoteWithPages[]): Promise<void> {
  for (const { pages } of batch) {
    for (const page of pages) await source.copy(thumbnailFile(page.id));
  }
}
