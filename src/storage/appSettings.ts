// アプリ全体の設定（最後に開いた本棚、別の場所の本棚の一覧。FR-V-03・FR-L-01、詳細設計書 5.1.1）。
// 本棚の外の内部データに置く（ADR 0018）
import type { ShelfId } from '@/domain/types';

import { appInternalDirectory, appSettingsFile } from './paths';

/**
 * 別の場所の本棚。reference は iOS ではブックマーク、Android ではフォルダの URI（ADR 0025）。
 * name は最後に見えていた名前（場所にアクセスできないときに一覧に出すため）
 */
export type ExternalShelfEntry = { id: ShelfId; reference: string; name: string };

export type AppSettings = {
  lastOpenedShelfId: ShelfId | null;
  externalShelves: ExternalShelfEntry[];
};

const DEFAULT_SETTINGS: AppSettings = { lastOpenedShelfId: null, externalShelves: [] };

/**
 * ない・壊れている場合は既定値。項目ごとに形を確かめ、読めた項目だけ使う
 * （古い形の設定や、一部が壊れた設定でも、残りを失わないため）
 */
export function readAppSettings(): AppSettings {
  try {
    const file = appSettingsFile();
    if (!file.exists) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(file.textSync());
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS;
    const record = parsed as Record<string, unknown>;
    return {
      lastOpenedShelfId:
        typeof record.lastOpenedShelfId === 'string' ? (record.lastOpenedShelfId as ShelfId) : null,
      externalShelves: Array.isArray(record.externalShelves)
        ? record.externalShelves.filter(isExternalShelfEntry)
        : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** 一部の項目だけを書き換える（丸ごと書くと、ほかの項目を消してしまうため） */
export function updateAppSettings(update: (current: AppSettings) => AppSettings): void {
  const next = update(readAppSettings());
  appInternalDirectory().create({ intermediates: true, idempotent: true });
  appSettingsFile().write(JSON.stringify(next));
}

function isExternalShelfEntry(value: unknown): value is ExternalShelfEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.reference === 'string' &&
    typeof entry.name === 'string'
  );
}
