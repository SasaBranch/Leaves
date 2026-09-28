// 端末内の文字認識。画像は外部に送信しない（FR-O-03）。
// iOS は Apple Vision、Android は ML Kit（日本語認識器。ラテン文字も認識する）を使う（ADR 0013）
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import { Platform } from 'react-native';

import VisionTextRecognizer from '../../modules/vision-text-recognizer/src/VisionTextRecognizerModule';

/** 1行分の文字と、画像上の位置（左上原点の px） */
export type RecognizedLine = {
  text: string;
  frame: { left: number; top: number; width: number; height: number };
};

export type RecognizedText = { text: string; lines: RecognizedLine[] };

export function recognizeText(imageUri: string): Promise<RecognizedText> {
  return Platform.OS === 'ios' && VisionTextRecognizer
    ? VisionTextRecognizer.recognize(imageUri)
    : recognizeWithMlKit(imageUri);
}

async function recognizeWithMlKit(imageUri: string): Promise<RecognizedText> {
  const result = await TextRecognition.recognize(imageUri, TextRecognitionScript.JAPANESE);
  const lines = result.blocks
    .flatMap((block) => block.lines)
    .flatMap((line) => (line.frame ? [{ text: line.text, frame: line.frame }] : []));
  return { text: result.text, lines };
}
