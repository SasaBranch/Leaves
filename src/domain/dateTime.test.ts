import { formatDefaultTitle } from './defaultTitle';

test('端末のタイムゾーンで YYYY-MM-DD HH:mm にする（1桁はゼロ埋め）', () => {
  expect(formatDefaultTitle(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05 07:03');
  expect(formatDefaultTitle(new Date(2026, 8, 28, 10, 30))).toBe('2026-09-28 10:30');
});
