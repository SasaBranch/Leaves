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

export function useCaptureLauncher(target: CaptureTarget) {
  async function launch(getImages: () => Promise<CapturedImage[] | null>) {
    try {
      const images = await getImages();
      if (!images) return; // キャンセル
      router.push({ pathname: '/capture', params: toCaptureParams(images, target) });
    } catch (error) {
      showCaptureError(error);
    }
  }
  return { scan: () => launch(scanDocument), importPhotos: () => launch(pickImages) };
}

function toCaptureParams(images: CapturedImage[], target: CaptureTarget) {
  const imagesParam = JSON.stringify(images);
  return 'noteId' in target
    ? { images: imagesParam, noteId: target.noteId }
    : { images: imagesParam, notebookId: target.notebookId ?? '' };
}

/** 権限がないときは理由を伝え、設定アプリへ誘導する（FR-S-08） */
function showCaptureError(error: unknown) {
  if (isAppError(error, 'cameraPermissionDenied') || isAppError(error, 'photoPermissionDenied')) {
    Alert.alert(errorMessages[error.kind], undefined, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '設定を開く', onPress: () => Linking.openSettings() },
    ]);
    return;
  }
  Alert.alert(isAppError(error) ? errorMessages[error.kind] : '取り込みを開始できませんでした');
}
