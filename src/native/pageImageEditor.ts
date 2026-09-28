// 保存済みのページの画像の台形補正・回転（ADR 0023、詳細設計書 9.12）。
// アプリからはこのファイルだけがネイティブモジュールを呼ぶ（テストでは差し替える）
import type { PageEdit } from '../domain/types';
import PageImageEditor from '../../modules/page-image-editor/src/PageImageEditorModule';

/**
 * 四隅（元の画像に対する相対座標）で台形補正し、右に rotation だけ回し、長辺を maxEdge 以下に縮めた
 * JPEG（quality は 0〜1）をキャッシュに書く。
 */
export async function correctPageImage(
  sourceUri: string,
  edit: PageEdit,
  options: { maxEdge: number; quality: number },
): Promise<{ uri: string; width: number; height: number }> {
  try {
    return await PageImageEditor.correctPageImage(sourceUri, edit, options);
  } catch (error) {
    // ネイティブの例外は Error でない形で来ることがあるため、呼び出し側が扱いやすい Error にそろえる
    if (error instanceof Error) throw error;
    throw new Error(`Page image correction failed: ${String(error)}`);
  }
}
