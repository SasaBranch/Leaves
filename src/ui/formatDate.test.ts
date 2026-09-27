import { formatListDate } from './formatDate';

const now = new Date(2026, 8, 28, 10, 30);
const iso = (...args: [number, number, number, number, number]) => new Date(...args).toISOString();

test('今日は時刻、昨日は「昨日」、今年は月/日、去年以前は年/月/日', () => {
  expect(formatListDate(iso(2026, 8, 28, 0, 5), now)).toBe('今日 00:05');
  expect(formatListDate(iso(2026, 8, 27, 23, 59), now)).toBe('昨日');
  expect(formatListDate(iso(2026, 8, 24, 12, 0), now)).toBe('9/24');
  expect(formatListDate(iso(2025, 11, 31, 12, 0), now)).toBe('2025/12/31');
});
