import { AppError } from './errors';
import { normalizeName } from './name';

test('前後の空白を除き、空（空白だけ）なら invalidName', () => {
  expect(normalizeName('  線形代数 ')).toBe('線形代数');
  expect(() => normalizeName('   ')).toThrow(new AppError('invalidName'));
  expect(() => normalizeName('')).toThrow(new AppError('invalidName'));
});
