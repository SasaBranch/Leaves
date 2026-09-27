// 利用者が入力する名前（ノートブック名・ノートのタイトル）の共通ルール
import { AppError } from './errors';

/** 前後の空白を除いた名前を返す。空なら invalidName（名前を入力してください） */
export function normalizeName(input: string): string {
  const name = input.trim();
  if (name === '') throw new AppError('invalidName');
  return name;
}
