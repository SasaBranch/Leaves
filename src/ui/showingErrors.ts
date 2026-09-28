// 名前などの入力ダイアログの送信処理を包み、入力エラー（同名・使えない文字・空の名前）を知らせる。
// 例外を投げ直すので、ダイアログは閉じずに入力し直してもらえる（TextPromptModal が例外で閉じないため）
import { Alert } from 'react-native';

import { isAppError } from '@/domain/errors';

import { errorMessages } from './errorMessages';

export function showingErrors(submit: (value: string) => Promise<void> | void) {
  return async (value: string) => {
    try {
      await submit(value);
    } catch (error) {
      Alert.alert(isAppError(error) ? errorMessages[error.kind] : '保存できませんでした');
      throw error;
    }
  };
}
