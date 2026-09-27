// iOS 27 SDK は UIScene ライフサイクルを必須にしたが、Expo SDK 57 の prebuild テンプレートはまだ対応していない。
// Expo 同梱の ExpoAppSceneDelegate を使うように Info.plist と AppDelegate を書き換える（ADR 0012）。
// テンプレートが対応したら、このプラグインは削除する。
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE_CLASS = 'EXExpoAppSceneDelegate';

function withSceneManifest(config) {
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ],
      },
    };
    return plistConfig;
  });
}

// テンプレートの形が変わって置き換えに失敗したら、黙って進まずビルドを止める。
// alreadyApplied: 2回目の prebuild で、すでに書き換え済みかどうか
function replaceOnce(source, { search, replace, alreadyApplied, description }) {
  if (alreadyApplied(source)) return source;
  if (!source.includes(search)) {
    throw new Error(`withSceneLifecycle: AppDelegate の ${description} が見つかりません`);
  }
  return source.replace(search, replace);
}

// ウィンドウの作成と React Native の起動は、ExpoAppSceneDelegate がシーン接続時に行う
const WINDOW_START_BLOCK = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (delegateConfig) => {
    let contents = delegateConfig.modResults.contents;
    contents = replaceOnce(contents, {
      search: 'class AppDelegate: ExpoAppDelegate {',
      replace: 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      alreadyApplied: (source) => source.includes('ExpoReactNativeFactoryProvider'),
      description: 'クラス宣言',
    });
    contents = replaceOnce(contents, {
      search: WINDOW_START_BLOCK,
      replace: '',
      alreadyApplied: (source) => !source.includes('factory.startReactNative('),
      description: 'ウィンドウ作成処理',
    });
    delegateConfig.modResults.contents = contents;
    return delegateConfig;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
