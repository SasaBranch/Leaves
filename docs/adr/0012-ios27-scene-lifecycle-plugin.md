# 0012. iOS 27 の UIScene 必須化に、独自の config plugin で対応する

- 状態: 承認
- 日付: 2026-09-28

## 背景
Xcode 27（iOS 27 SDK）でビルドしたアプリは、UIScene ライフサイクルを採用していないと起動時に失敗する（`UIScene life cycle is required for apps built with this SDK`）。
Expo SDK 57 には `ExpoAppSceneDelegate`（iOS 27 向けのシーンデリゲート）が同梱されているが、`npx expo prebuild` が生成する AppDelegate と Info.plist はまだ使っていない（#1 のシミュレータ起動で判明）。

`ios/` は prebuild が生成するため手で編集しない（AGENTS.md）。

## 決定
`plugins/withSceneLifecycle.js` の config plugin で、prebuild の出力を次のように書き換える。
- Info.plist に `UIApplicationSceneManifest` を追加し、シーンデリゲートに `EXExpoAppSceneDelegate` を指定する
- AppDelegate を `ExpoReactNativeFactoryProvider` に準拠させ、自前のウィンドウ作成と React Native の起動を削除する（シーン接続時に `ExpoAppSceneDelegate` が行う）

テンプレートの形が変わって置き換え対象が見つからない場合は、黙って進まずに prebuild を失敗させる。

## 検討した選択肢
- `ios/` を直接編集してコミットする — prebuild のたびに消え、Expo の運用（Continuous Native Generation）から外れる
- Xcode を古いバージョンに戻す — iOS 27 の実機に入れられなくなる
- Expo のテンプレート対応を待つ — 待つ間、iOS で動作確認ができない

## 結果
- Xcode 27 でビルドしたアプリがシミュレータ・実機で起動する
- Expo のテンプレートが UIScene に対応したら、このプラグインを削除する（そのときは新しい ADR で記録する）
