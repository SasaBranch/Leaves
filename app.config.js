// app.json に、公開リポジトリに載せない個人の設定を足す。
// LEAVES_APPLE_TEAM_ID: 実機ビルドの署名に使う Apple のチーム ID（.env.local に書く。Git 管理外）
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    ...(process.env.LEAVES_APPLE_TEAM_ID ? { appleTeamId: process.env.LEAVES_APPLE_TEAM_ID } : {}),
  },
});
