import { notifyDataChanged, subscribeDataChanged } from './dataChanges';

test('購読中のすべてのリスナーに通知し、解除後は通知しない', () => {
  const first = jest.fn();
  const second = jest.fn();
  const unsubscribeFirst = subscribeDataChanged(first);
  const unsubscribeSecond = subscribeDataChanged(second);

  notifyDataChanged();
  unsubscribeFirst();
  notifyDataChanged();
  unsubscribeSecond();

  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(2);
});

test('通知の途中でリスナーが購読を解除しても、他のリスナーには届く', () => {
  const later = jest.fn();
  const unsubscribeSelf: { current: () => void } = { current: () => {} };
  unsubscribeSelf.current = subscribeDataChanged(() => unsubscribeSelf.current());
  const unsubscribeLater = subscribeDataChanged(later);

  notifyDataChanged();

  expect(later).toHaveBeenCalledTimes(1);
  unsubscribeLater();
});
