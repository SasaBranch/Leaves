// アプリ全体の設定（最後に開いた本棚。FR-V-03）。本棚の外の内部データに置く（ADR 0018）
import type { ShelfId } from '@/domain/types';

import { appInternalDirectory, appSettingsFile } from './paths';

type AppSettings = { lastOpenedShelfId: ShelfId | null };

/** ない・壊れている場合は既定値（設定を失っても、本棚の一覧の先頭を開くだけで済むため） */
export function readAppSettings(): AppSettings {
  try {
    const file = appSettingsFile();
    if (!file.exists) return { lastOpenedShelfId: null };
    const parsed: unknown = JSON.parse(file.textSync());
    const id =
      typeof parsed === 'object' && parsed !== null && 'lastOpenedShelfId' in parsed
        ? parsed.lastOpenedShelfId
        : null;
    return { lastOpenedShelfId: typeof id === 'string' ? (id as ShelfId) : null };
  } catch {
    return { lastOpenedShelfId: null };
  }
}

export function writeAppSettings(settings: AppSettings): void {
  appInternalDirectory().create({ intermediates: true, idempotent: true });
  appSettingsFile().write(JSON.stringify(settings));
}
