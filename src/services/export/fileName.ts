// 書き出しファイルの名前と置き場所（詳細設計書 9.5）。
import { File } from 'expo-file-system';

import { DEFAULT_EXPORT_FILE_NAME } from '@/config';
import { replaceForbiddenCharacters } from '@/domain/name';
import { exportDirectory } from '@/storage/paths';

/** 共有シートに渡す書き出しファイル */
export type ExportFile = { uri: string; mimeType: string };

/** ノートのタイトルを、どの共有先でも使えるファイル名（拡張子なし）にする */
export function sanitizeFileName(title: string): string {
  // 末尾のピリオドは Windows で消されて拡張子の区切りと紛れるため、空白と一緒に除く
  const name = replaceForbiddenCharacters(title, '_')
    .trim()
    .replace(/[.\s]+$/, '');
  return name === '' ? DEFAULT_EXPORT_FILE_NAME : name;
}

/** 書き出し用フォルダ内のファイル。前回の残骸が同名で残っていれば消しておく */
export function prepareExportFile(fileName: string): File {
  exportDirectory().create({ intermediates: true, idempotent: true });
  const file = new File(exportDirectory(), fileName);
  if (file.exists) file.delete();
  return file;
}
