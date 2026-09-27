import { createTestDb } from '../../test/testDb';

async function createCounterTable() {
  const db = createTestDb();
  await db.run('CREATE TABLE counter (value INTEGER NOT NULL)');
  await db.run('INSERT INTO counter VALUES (0)');
  return db;
}

async function readCounter(db: Awaited<ReturnType<typeof createCounterTable>>) {
  const row = await db.get<{ value: number }>('SELECT value FROM counter');
  return row?.value;
}

describe('createDb', () => {
  test('トランザクションが成功すると変更が確定する', async () => {
    const db = await createCounterTable();
    await db.transaction(async (tx) => {
      await tx.run('UPDATE counter SET value = 1');
    });
    expect(await readCounter(db)).toBe(1);
  });

  test('トランザクション中に例外が起きると変更が取り消され、例外はそのまま伝わる', async () => {
    const db = await createCounterTable();
    const failure = new Error('失敗');
    await expect(
      db.transaction(async (tx) => {
        await tx.run('UPDATE counter SET value = 1');
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(await readCounter(db)).toBe(0);
  });

  test('トランザクションの途中に呼ばれた別の書き込みは、トランザクションの後に実行される', async () => {
    const db = await createCounterTable();
    let releaseTransaction = () => {};
    const transactionPaused = new Promise<void>((resolve) => (releaseTransaction = resolve));

    const transaction = db.transaction(async (tx) => {
      await tx.run('UPDATE counter SET value = 1');
      await transactionPaused;
      await tx.run('UPDATE counter SET value = value * 10');
    });
    // トランザクションが止まっている間に、外から書き込みを依頼する
    const outsideWrite = db.run('UPDATE counter SET value = value + 5');
    releaseTransaction();
    await Promise.all([transaction, outsideWrite]);

    // 割り込んでいれば (1 + 5) * 10 = 60、順番どおりなら 1 * 10 + 5 = 15
    expect(await readCounter(db)).toBe(15);
  });

  test('失敗した操作の後も、次の操作は実行される', async () => {
    const db = await createCounterTable();
    await expect(db.run('INSERT INTO missing_table VALUES (1)')).rejects.toThrow();
    await db.run('UPDATE counter SET value = 2');
    expect(await readCounter(db)).toBe(2);
  });

  test('トランザクションの中の transaction は外側に合流する', async () => {
    const db = await createCounterTable();
    await expect(
      db.transaction(async (tx) => {
        await tx.transaction(async (inner) => {
          await inner.run('UPDATE counter SET value = 1');
        });
        throw new Error('外側で失敗');
      }),
    ).rejects.toThrow('外側で失敗');
    expect(await readCounter(db)).toBe(0);
  });
});
