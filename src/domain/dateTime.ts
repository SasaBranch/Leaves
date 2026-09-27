// アプリ内で日時を文字で書くときの形式（端末のタイムゾーンで `YYYY-MM-DD HH:mm`）。
// ノートの既定タイトル（FR-S-07）と、Markdown 書き出しの作成日時で使う
export function formatLocalDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
