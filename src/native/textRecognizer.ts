// 端末内の文字認識（ML Kit、日本語認識器。日本語認識器はラテン文字も認識する）。画像は外部に送信しない（FR-O-03）
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

/** 1行分の文字と、画像上の位置（px） */
export type RecognizedLine = {
  text: string;
  frame: { left: number; top: number; width: number; height: number };
};

export async function recognizeText(
  imageUri: string,
): Promise<{ text: string; lines: RecognizedLine[] }> {
  const result = await TextRecognition.recognize(imageUri, TextRecognitionScript.JAPANESE);
  const lines = result.blocks
    .flatMap((block) => block.lines)
    .flatMap((line) => (line.frame ? [{ text: line.text, frame: line.frame }] : []));
  return { text: result.text, lines };
}
