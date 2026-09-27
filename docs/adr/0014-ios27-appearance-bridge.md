# 0014. iOS 27 で外観（ライト/ダーク）の変更を React Native に届け直す

- 状態: 承認
- 日付: 2026-09-28

## 背景
iOS 27 シミュレータで、アプリの起動中に OS の外観を切り替えても画面が追従しなかった（#35、NFR-U-03）。起動時の外観には正しく従う。

React Native 0.86 の `Appearance` は、ルートビューの `traitCollectionDidChange` から送られる `RCTUserInterfaceStyleDidChangeNotification` で外観の変更を知る。`traitCollectionDidChange` は iOS 17 で非推奨になり、iOS 27 では呼ばれなくなったと考えられる（同じビルドのログに、非推奨 API が「no-op on 27.0」になった旨の警告が多数出ている）。

## 決定
ADR 0012 の config plugin で、`ExpoAppSceneDelegate` を継承した `SceneDelegate` を AppDelegate.swift に追加する。シーン接続時にウィンドウへ `registerForTraitChanges([UITraitUserInterfaceStyle.self])`（iOS 17 以降の API）を登録し、変更時に React Native と同じ `RCTUserInterfaceStyleDidChangeNotification` を送る。iOS 16 では従来どおり `traitCollectionDidChange` が呼ばれるため、何もしない。

## 検討した選択肢
- JS 側で、アプリが前面に戻ったときに外観を読み直す — `Appearance.getColorScheme()` もネイティブ側の同じ値を返すため、通知が来なければ古いままになる
- React Native に修正が入るのを待つ — その間、NFR-U-03 を満たせない

## 結果
- iOS 27 シミュレータで、起動中の外観切り替えに画面が即座に追従することを確認した
- React Native が新しい API に対応したら、この追加分は二重通知になる（同じ値なら `appearanceChanged` は送られないため害はない）。対応を確認したら削除する
