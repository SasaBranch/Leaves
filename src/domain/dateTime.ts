// ノートの既定タイトル（FR-S-07、詳細設計書 9.7）。端末のタイムゾーンで `YYYY-MM-DD HH:mm`
export function formatDefaultTitle(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
