// スキャン・写真取り込みを始めて、保存画面（SC-4）へ渡す。
// 取り込み先は「ノートブック（またはライブラリ）に新しいノートを作る」か「既存ノートにページを足す」のどちらか
import { router } from 'expo-router';
import { Alert, Linking } from 'react-native';

import { isAppError } from '@/domain/errors';
import type { CapturedImage, NoteId, NotebookId } from '@/domain/types';
import { pickImages } from '@/native/imagePicker';
import { scanDocument } from '@/native/scanner';
import { errorMessages } from '@/ui/errorMessages';

export type CaptureTarget = { notebookId: NotebookId | null } | { noteId: NoteId };
export type CaptureSource = 'scan' | 'photos';

export function useCaptureLauncher(target: CaptureTarget) {
  async function launch(source: CaptureSource) {
    const images = await captureImages(source);
    if (images) router.push({ pathname: '/capture', params: toCaptureParams(images, target) });
  }
  return { scan: () => launch('scan'), importPhotos: () => launch('photos') };
}

/**
 * スキャナか写真アプリから画像を得る。キャンセル・エラーは null（エラーはここで利用者に伝える）。
 * 保存画面の「追加で撮影」でも使う
 */
export async function captureImages(source: CaptureSource): Promise<CapturedImage[] | null> {
  try {
    return await (source === 'scan' ? scanDocument() : pickImages());
  } catch (error) {
    showCaptureError(error);
    return null;
  }
}

function toCaptureParams(images: CapturedImage[], target: CaptureTarget) {
  const imagesParam = JSON.stringify(images);
  return 'noteId' in target
    ? { images: imagesParam, noteId: target.noteId }
    : { images: imagesParam, notebookId: target.notebookId ?? '' };
}

/** 権限がないときは理由を伝え、設定アプリへ誘導する（FR-S-08） */
function showCaptureError(error: unknown) {
  if (isAppError(error, 'cameraPermissionDenied')) {
    Alert.alert(errorMessages[error.kind], undefined, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '設定を開く', onPress: () => Linking.openSettings() },
    ]);
    return;
  }
  Alert.alert(isAppError(error) ? errorMessages[error.kind] : '取り込みを開始できませんでした');
}
