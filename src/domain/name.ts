// 本棚・ノートブック・ノートの名前の規則（基本設計書 5.5、詳細設計書 9.11）。
// 名前はそのままフォルダ名になるため、ファイル名として使えるものに限る。
import { AppError } from './errors';

/** 両 OS と、PC にコピーした場合にファイル名で問題になる文字。書き出しのファイル名も同じ規則を使う */
const FORBIDDEN_CHARACTER = /[/\\:*?"<>|]/;
const ALL_FORBIDDEN_CHARACTERS = new RegExp(FORBIDDEN_CHARACTER.source, 'g');

/**
 * 利用者が入力した名前を検査し、前後の空白を除いて返す。
 * 空なら invalidName、使えない文字や先頭の . があれば invalidNameCharacters
 * （. で始まる名前は隠しファイルになり、管理用ファイルと区別できないため）
 */
export function validateName(input: string): string {
  const name = input.trim();
  if (name === '') throw new AppError('invalidName');
  if (name.startsWith('.') || FORBIDDEN_CHARACTER.test(name)) {
    throw new AppError('invalidNameCharacters');
  }
  return name;
}

/** 大文字・小文字を区別せずに同じ名前か（iOS・macOS のファイルシステムの既定に合わせる） */
export function isSameName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

/** 既存の名前と重ならない名前を返す。重なれば "名前 (2)"、"名前 (3)" … */
export function pickAvailableName(existingNames: string[], desired: string): string {
  const isTaken = (name: string) => existingNames.some((existing) => isSameName(existing, name));
  if (!isTaken(desired)) return desired;
  for (let number = 2; ; number++) {
    const candidate = `${desired} (${number})`;
    if (!isTaken(candidate)) return candidate;
  }
}

/** v1.0 のデータの名前（`:` を含む既定タイトルなど）を、フォルダ名に使える形にする（詳細設計書 9.10） */
export function sanitizeLegacyName(name: string): string {
  const sanitized = name
    .replace(/:/g, '.')
    .replace(ALL_FORBIDDEN_CHARACTERS, '_')
    .replace(/^\./, '_')
    .trim();
  return sanitized === '' ? '_' : sanitized;
}

/** 書き出しのファイル名用。使えない文字を _ に置き換える */
export function replaceForbiddenCharacters(name: string, replacement: string): string {
  return name.replace(ALL_FORBIDDEN_CHARACTERS, replacement);
}
