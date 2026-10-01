import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { IndexedDbCacheStore } from '../src/cache-store';

const entry = (key: string) => ({ key, expires: Date.now() + 60_000, title: key });

describe('device cache store', () => {
  it('round-trips entries across store instances', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbCacheStore('link-flair-cache:vault-a', factory);
    await first.save([entry('title:https://example.com/')]);
    first.close();
    const second = new IndexedDbCacheStore('link-flair-cache:vault-a', factory);
    expect(await second.load()).toEqual([entry('title:https://example.com/')].map(value => ({ ...value, expires: expect.any(Number) as number })));
  });

  it('keeps vaults apart and replaces the previous snapshot', async () => {
    const factory = new IDBFactory();
    const a = new IndexedDbCacheStore('link-flair-cache:vault-a', factory);
    const b = new IndexedDbCacheStore('link-flair-cache:vault-b', factory);
    await a.save([entry('a1'), entry('a2')]);
    await a.save([entry('a3')]);
    expect((await a.load()).map(value => (value as { key: string }).key)).toEqual(['a3']);
    expect(await b.load()).toEqual([]);
  });

  it('degrades to an empty in-memory cache without IndexedDB', async () => {
    const store = new IndexedDbCacheStore('link-flair-cache:none', undefined);
    await expect(store.save([entry('a')])).resolves.toBeUndefined();
    expect(await store.load()).toEqual([]);
  });

  it('degrades when opening the database fails', async () => {
    const failing = { open: () => { throw new Error('blocked by the platform'); } } as unknown as IDBFactory;
    const store = new IndexedDbCacheStore('link-flair-cache:fail', failing);
    await expect(store.save([entry('a')])).resolves.toBeUndefined();
    expect(await store.load()).toEqual([]);
  });
});
