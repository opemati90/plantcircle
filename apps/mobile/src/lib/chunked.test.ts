import { chunked, type KeyValueStore } from './storage';

jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-secure-store', () => ({}));

function memoryStore(limit: number): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => Promise.resolve(data.get(key) ?? null),
    setItem: (key, value) => {
      if (value.length > limit) return Promise.reject(new Error('value too large'));
      data.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      data.delete(key);
      return Promise.resolve();
    },
  };
}

describe('chunked storage', () => {
  it('round-trips values larger than the underlying limit', async () => {
    const store = chunked(memoryStore(2048));
    const session = 'x'.repeat(5000) + 'end';
    await store.setItem('session', session);
    expect(await store.getItem('session')).toBe(session);
  });

  it('leaves nothing behind when a value shrinks or is removed', async () => {
    const raw = memoryStore(2048);
    const store = chunked(raw);
    await store.setItem('session', 'y'.repeat(5000));
    await store.setItem('session', 'short');
    expect(await store.getItem('session')).toBe('short');
    expect(raw.data.size).toBe(2);
    await store.removeItem('session');
    expect(raw.data.size).toBe(0);
    expect(await store.getItem('session')).toBeNull();
  });
});
