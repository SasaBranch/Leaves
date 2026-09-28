// アプリ内で日時を文字で書くときの形式（端末のタイムゾーン）。
/** `YYYY-MM-DD HH:mm`。Markdown 書き出しの作成日時で使う */
export function formatLocalDateTime(date: Date): string {
  return formatWithTimeSeparator(date, ':');
}

/** ノートの既定タイトル `YYYY-MM-DD HH.mm`（FR-S-07）。タイトルはフォルダ名になり、`:` は使えないため */
export function formatDefaultNoteTitle(date: Date): string {
  return formatWithTimeSeparator(date, '.');
}

function formatWithTimeSeparator(date: Date, separator: string): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}${separator}${pad(date.getMinutes())}`
  );
}
