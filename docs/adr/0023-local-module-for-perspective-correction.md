# 0023. 保存後のページの台形補正は、自作の Expo モジュールで両 OS の画像処理機能を使う

- 状態: 承認
- 日付: 2026-09-28

## 背景
要件定義書 v1.3 で、保存済みのページの四隅を調整して台形補正し直す機能（FR-N-10）を追加した。撮影時の四隅調整・台形補正は OS 標準スキャナ（VisionKit / ML Kit Document Scanner）が行っているが、どちらも「保存済みの画像を渡して補正し直す」使い方には対応していない。expo-image-manipulator は切り抜き（長方形）・回転・縮小はできるが、四隅からの射影変換はできない。

## 決定
- ローカルの Expo モジュール `modules/page-image-editor` を作り、1つの関数 `correctPageImage(元の画像, 四隅, 回転, 最大の長辺, 品質)` を両 OS で実装する
  - iOS: Core Image の `CIPerspectiveCorrection`
  - Android: `android.graphics.Matrix.setPolyToPoly` と `Canvas`
- アプリ側は `src/native/pageImageEditor.ts` だけがこのモジュールを呼ぶ（テストでは差し替える）
- 文字認識の iOS 用モジュール（`modules/vision-text-recognizer`、ADR 0013）と同じ作り方にする

## 検討した選択肢
- **既存のライブラリ（react-native-perspective-image-cropper など）** — 長く更新されておらず、React Native 0.86 の新しいアーキテクチャへの対応が確認できない
- **OpenCV（react-native-fast-opencv など）** — 射影変換はできるが、アプリサイズが数十 MB 増える。使うのは1つの変換だけで、見合わない
- **JavaScript で画素を計算する** — 2400px の画像で数百万画素を JS で処理することになり、数秒以上かかる

## 結果
- 追加するネイティブのコードは両 OS とも数十行で済み、OS 標準の高速な画像処理を使える
- Android 側は、Android の実行環境を用意するまで動作を確認できない（基本設計書 R-9）。iOS を先に確認する
- ネイティブのコードを変えるため、iPhone への入れ直し（開発ビルドの再作成）が必要になる
