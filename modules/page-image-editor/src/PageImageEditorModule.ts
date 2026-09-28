import { NativeModule, requireNativeModule } from 'expo';

import type { PageEdit } from '../../../src/domain/types';

declare class PageImageEditorModule extends NativeModule {
  correctPageImage(
    sourceUri: string,
    edit: PageEdit,
    options: { maxEdge: number; quality: number },
  ): Promise<{ uri: string; width: number; height: number }>;
}

export default requireNativeModule<PageImageEditorModule>('PageImageEditor');
