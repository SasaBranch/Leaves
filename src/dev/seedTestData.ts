// 性能計測用のテストデータ生成（詳細設計書 12 章。開発ビルド限定）。
// 要件定義書 7.2 の想定量（ノート1,000件・ページ5,000枚）を本棚フォルダとして作り、
// 起動・一覧・検索・外部変更の反映の時間を実機で測るために使う。
// 片付けは既存の操作（「テストデータ」ノートブックの削除）で行うため、削除機能は持たない。
import { Directory, File } from 'expo-file-system';
import { Alert } from 'react-native';

import { NOTEBOOK_COLORS, PAGE_IMAGE_MAX_EDGE_PX } from '@/config';
import { listAllPageIds } from '@/db/pageRepository';
import { isSameName } from '@/domain/name';
import type { IsoDateTime, ShelfId } from '@/domain/types';
import { newNoteId, newNotebookId, newPageId } from '@/native/randomId';
import { listEntryNames } from '@/services/folders';
import { syncShelf } from '@/services/sync/syncShelf';
import type { OpenShelf } from '@/state/openShelf';
import {
  newNoteManifest,
  newNotebookManifest,
  writeManifest,
  type PageManifest,
} from '@/storage/manifest';
import { describeStoredPage } from '@/storage/pageImages';
import { pageImageFile, thumbnailFile, thumbnailsDirectory, workDirectory } from '@/storage/paths';

export type SeedOptions = { noteCount: number; pagesPerNote: number };

export const ROOT_NOTEBOOK_NAME = 'テストデータ';
const DEFAULT_SEED_OPTIONS: SeedOptions = { noteCount: 1000, pagesPerNote: 5 };
const CHILD_NOTEBOOK_COUNT = 10;
/** ノートごとに更新日時をずらす幅。1,000件で約8か月に広がり、更新順の並べ替えが意味を持つ */
const NOTE_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** 手書きノート1ページの OCR 文字数の目安（spikes/r1-trigram-search.js と同じ） */
const OCR_TEXT_CHARS = 400;
/** A4 縦を長辺 2400px で保存したときの幅 */
const PAGE_WIDTH_PX = 1800;
/**
 * 既存ページのサムネイルがない（本棚が空）ときの見本画像。36×48px の紙の色の JPEG。
 * 計測したいのは画像の変換ではなく件数に比例する処理なので、小さい画像で足りる
 */
const FALLBACK_SAMPLE_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwACQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0SiiisygooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKAP/Z';

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

/** ライブラリのロゴの長押しから呼ぶ。時間がかかり件数も多いため、確認してから作る */
export function confirmSeedTestData(shelf: OpenShelf): void {
  const { noteCount, pagesPerNote } = DEFAULT_SEED_OPTIONS;
  Alert.alert(
    `テストデータ（ノート${noteCount.toLocaleString()}件・ページ${(noteCount * pagesPerNote).toLocaleString()}枚）を作成しますか？`,
    undefined,
    [
      { text: 'キャンセル', style: 'cancel' },
      { text: '作成', onPress: () => void seedTestDataWithTiming(shelf) },
    ],
  );
}

/** 作成時間も計測の参考になるため、完了時に表示する */
async function seedTestDataWithTiming(shelf: OpenShelf): Promise<void> {
  const startedAt = performance.now();
  try {
    await seedTestData(shelf);
    const seconds = (performance.now() - startedAt) / 1000;
    Alert.alert(`テストデータを作成しました（${seconds.toFixed(1)} 秒）`);
  } catch (error) {
    Alert.alert('テストデータを作成できませんでした', String(error));
  }
}

/**
 * 本棚の最上位に「テストデータ」フォルダを作り、その下に子ノートブックとノート・ページを作る。
 * 作業用フォルダで組み立ててから1回の移動で本棚に置き、DB への登録は外部変更の反映に任せる
 * （利用者が Finder でフォルダを置いた場合と同じ経路を通るので、反映の計測にもなる）。
 * ページは OCR 済み（done）で作るため、OCR キューは動かず、検索対象の本文もすぐに入る。
 */
export async function seedTestData(
  shelf: OpenShelf,
  options: SeedOptions = DEFAULT_SEED_OPTIONS,
): Promise<void> {
  const sampleThumbnail = await findSampleThumbnail(shelf);
  await shelf.runExclusively(async () => {
    rejectExistingTestData(shelf);
    const work = new Directory(workDirectory(shelf.directory), 'seed');
    work.create({ intermediates: true, overwrite: true });
    try {
      const sample = sampleThumbnail ?? writeFallbackSample(work);
      const root = new Directory(work, ROOT_NOTEBOOK_NAME);
      buildTestData(root, { shelfId: shelf.id, sample, options, now: Date.now() });
      root.moveSync(new Directory(shelf.directory, ROOT_NOTEBOOK_NAME));
    } finally {
      work.delete();
    }
  });
  await syncShelf(shelf);
}

/** 二重に作ると件数が想定と変わり計測にならないため、作り直すときは先に削除してもらう */
function rejectExistingTestData(shelf: OpenShelf): void {
  if (listEntryNames(shelf.directory).some((name) => isSameName(name, ROOT_NOTEBOOK_NAME))) {
    throw new Error(
      `「${ROOT_NOTEBOOK_NAME}」が本棚に既にあります。削除してから作り直してください`,
    );
  }
}

/** 一覧の表紙が紙の色ばかりにならないよう、既存ページのサムネイルがあればそれを見本にする */
async function findSampleThumbnail(shelf: OpenShelf): Promise<File | null> {
  const pageIds = await listAllPageIds(shelf.db);
  const pageIdWithThumbnail = pageIds.find((id) => thumbnailFile(shelf.id, id).exists);
  return pageIdWithThumbnail ? thumbnailFile(shelf.id, pageIdWithThumbnail) : null;
}

function writeFallbackSample(work: Directory): File {
  const file = new File(work, 'sample.jpg');
  file.write(FALLBACK_SAMPLE_JPEG_BASE64, { encoding: 'base64' });
  return file;
}

type BuildContext = { shelfId: ShelfId; sample: File; options: SeedOptions; now: number };

/**
 * root の下に子ノートブックを作り、ノートを順番に振り分ける。
 * 件数が多いので、ファイル操作はすべて同期版で行う（1件ずつ await すると待ちが積み重なるため）
 */
function buildTestData(root: Directory, context: BuildContext): void {
  const createdAt = new Date(context.now).toISOString();
  createNotebookFolder(root, 0, createdAt);
  const children = Array.from({ length: CHILD_NOTEBOOK_COUNT }, (_, index) =>
    createNotebookFolder(
      new Directory(root, `ノートブック ${String(index + 1).padStart(2, '0')}`),
      index,
      createdAt,
    ),
  );
  thumbnailsDirectory(context.shelfId).create({ intermediates: true, idempotent: true });
  for (let noteIndex = 0; noteIndex < context.options.noteCount; noteIndex++) {
    // 余りは必ず配列の範囲内に収まる
    createNoteFolder(children[noteIndex % children.length]!, noteIndex, context);
  }
}

function createNotebookFolder(directory: Directory, index: number, now: IsoDateTime): Directory {
  directory.create();
  // 余りは必ず配列の範囲内に収まる
  const color = NOTEBOOK_COLORS[index % NOTEBOOK_COLORS.length]!;
  writeManifest(directory, newNotebookManifest(newNotebookId(), color, now));
  return directory;
}

function createNoteFolder(parent: Directory, noteIndex: number, context: BuildContext): void {
  const { shelfId, sample, options, now } = context;
  const timestamp = new Date(now - noteIndex * NOTE_UPDATE_INTERVAL_MS).toISOString();
  const directory = new Directory(parent, `テストノート ${String(noteIndex + 1).padStart(4, '0')}`);
  directory.create();
  const pages: PageManifest[] = Array.from({ length: options.pagesPerNote }, (_, position) => {
    const id = newPageId();
    const file = pageImageFile(directory, position);
    sample.copySync(file);
    sample.copySync(thumbnailFile(shelfId, id));
    const size = { width: PAGE_WIDTH_PX, height: PAGE_IMAGE_MAX_EDGE_PX };
    return {
      ...describeStoredPage(id, file, size, timestamp),
      ocrStatus: 'done',
      ocrText: buildSampleOcrText(noteIndex * options.pagesPerNote + position),
    };
  });
  writeManifest(directory, newNoteManifest(newNoteId(), pages, timestamp));
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
