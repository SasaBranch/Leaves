# 0027. 事前検証 R-4・R-5 と Android エミュレータでの確認の結果

- 状態: 承認
- 日付: 2026-09-29

## 背景
基本設計書 11 章の R-4（ML Kit の日本語モデルによるアプリサイズ増加）と R-5（並べ替え・ズーム・ボトムシートのライブラリが Expo SDK 57 で動くか）は、Android をビルドできるまで確認を残していた（#5）。要件定義書 v1.4 Q-11 で、Android はエミュレータでの確認を合格とすることにした。

Android Studio のエミュレータ（Pixel_9、Android 16 / API 36）で開発ビルドを動かして確かめた（テスト結果 7章）。

## 決定
- 詳細設計書 13 章の3つのライブラリ（@gorhom/bottom-sheet 5.2.x、react-native-reorderable-list 0.18.x、react-native-zoom-toolkit 5.1.x）をそのまま採用する。iOS・Android の両方で、ボトムシートの開閉、ダブルタップの拡大、つまみのドラッグでの並べ替えが動いた。R-5 の代替案（reanimated で自前実装）は使わない
- アプリサイズは許容する（R-4）。リリース APK（全 CPU 入り）で 178MB。ストア配布（AAB）では端末ごとに必要な分だけになる
- フォルダの更新日時は、iOS は ADR 0021 のとおり `new File(フォルダ).modificationTime`、Android は `Directory.info().modificationTime` で読む。Android ではフォルダを File として開けないため（詳細設計書 9.9）
- iOS 専用のネイティブモジュール（Apple Vision の文字認識）は任意のモジュールとして読み込み、iOS のときだけ使う。必須にすると Android の起動時に落ちる

## 結果
- M0 の事前検証 R-1〜R-5 がすべて終わった
- スキャナの品質（輪郭検出・台形補正）は、エミュレータの仮想カメラでは判定できないため、Android では参考扱いのまま（テスト仕様書 1.2）
