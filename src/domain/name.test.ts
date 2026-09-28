import { AppError } from './errors';
import { pickAvailableName, sanitizeLegacyName, validateName } from './name';

test('前後の空白を除き、空（空白だけ）なら invalidName', () => {
  expect(validateName('  線形代数 ')).toBe('線形代数');
  expect(() => validateName('   ')).toThrow(new AppError('invalidName'));
  expect(() => validateName('')).toThrow(new AppError('invalidName'));
});

test.each(['a/b', 'a\\b', '10:30', 'a*', 'なぜ?', '"引用"', '<a>', 'a|b', '.hidden'])(
  '使えない文字・先頭の . は invalidNameCharacters: %s',
  (name) => {
    expect(() => validateName(name)).toThrow(new AppError('invalidNameCharacters'));
  },
);

test('検査を続けて呼んでも結果が変わらない（正規表現の状態が残らない）', () => {
  expect(() => validateName('a:b')).toThrow();
  expect(validateName('ab')).toBe('ab');
  expect(() => validateName('a:b')).toThrow();
});

test('途中の . は使える', () => {
  expect(validateName('2026-09-28 10.30')).toBe('2026-09-28 10.30');
});

test('重ならない名前を選ぶ。大文字・小文字は区別しない', () => {
  expect(pickAvailableName([], 'メモ')).toBe('メモ');
  expect(pickAvailableName(['メモ'], 'メモ')).toBe('メモ (2)');
  expect(pickAvailableName(['メモ', 'メモ (2)'], 'メモ')).toBe('メモ (3)');
  expect(pickAvailableName(['Note'], 'note')).toBe('note (2)');
});

test('v1.0 の名前をフォルダ名に使える形にする', () => {
  expect(sanitizeLegacyName('2026-09-28 10:30')).toBe('2026-09-28 10.30');
  expect(sanitizeLegacyName('a/b?')).toBe('a_b_');
  expect(sanitizeLegacyName('.x')).toBe('_x');
});
