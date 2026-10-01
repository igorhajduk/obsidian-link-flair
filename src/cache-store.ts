import type { CacheEntry } from './metadata';

export interface CacheStore {
  load(): Promise<unknown[]>;
  save(entries: readonly CacheEntry[]): Promise<void>;
  close(): void;
}

const STORE = 'cache';
const RECORD = 'entries';

/**
 * Fetched titles and icons stay on this device. They never enter data.json, so
 * Obsidian Sync and file-based vault sync carry only settings. Any IndexedDB
 * failure degrades to an in-memory cache for the session.
 */
export class IndexedDbCacheStore implements CacheStore {
  private db?: Promise<IDBDatabase | undefined>;

  constructor(private name: string, private factory: IDBFactory | undefined = window.indexedDB) {}

  private open(): Promise<IDBDatabase | undefined> {
    this.db ??= new Promise(resolve => {
      try {
        if (!this.factory) { resolve(undefined); return; }
        const request = this.factory.open(this.name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      } catch { resolve(undefined); }
    });
    return this.db;
  }

  async load(): Promise<unknown[]> {
    const db = await this.open();
    if (!db) return [];
    return new Promise(resolve => {
      try {
        const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(RECORD);
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as unknown[] : []);
        request.onerror = () => resolve([]);
      } catch { resolve([]); }
    });
  }

  async save(entries: readonly CacheEntry[]): Promise<void> {
    const db = await this.open();
    if (!db) return;
    return new Promise(resolve => {
      try {
        const transaction = db.transaction(STORE, 'readwrite');
        transaction.objectStore(STORE).put([...entries], RECORD);
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
      } catch { resolve(); }
    });
  }

  close(): void { void this.db?.then(db => db?.close()); }
}
