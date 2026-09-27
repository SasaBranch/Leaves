// 一覧に出す日付の表記（基本設計書 2.4: ノート表紙の日付）。今日は時刻、昨日は「昨日」、それ以外は月/日
import type { IsoDateTime } from '@/domain/types';

export function formatListDate(iso: IsoDateTime, now: Date = new Date()): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  const daysAgo = differenceInCalendarDays(now, date);
  if (daysAgo === 0) return `今日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (daysAgo === 1) return '昨日';
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

/** 時刻を無視した、端末のタイムゾーンでの日数差 */
function differenceInCalendarDays(later: Date, earlier: Date): number {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(later) - startOfDay(earlier)) / MILLISECONDS_PER_DAY);
}
