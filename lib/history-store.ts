import type { HistoryRecord } from "./types";

const DB_NAME = "scenelens-history";
const STORE_NAME = "records";
const DB_VERSION = 1;
const MAX_RECORDS = 40;

export interface HistoryStore {
  list(): Promise<HistoryRecord[]>;
  add(record: HistoryRecord): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Storage request failed"));
  });
}

class IndexedDbHistoryStore implements HistoryStore {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private open() {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open local history"));
    });
    return this.databasePromise;
  }

  async list() {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestToPromise(
      transaction.objectStore(STORE_NAME).getAll() as IDBRequest<HistoryRecord[]>,
    );
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async add(record: HistoryRecord) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    const overflow = (await this.list()).slice(MAX_RECORDS);
    await Promise.all(overflow.map((item) => this.delete(item.id)));
  }

  async delete(id: string) {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async clear() {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

export function createMemoryHistoryStore(
  initial: HistoryRecord[] = [],
): HistoryStore {
  const records = new Map(initial.map((record) => [record.id, record]));
  return {
    async list() {
      return [...records.values()].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
    },
    async add(record) {
      records.set(record.id, record);
      const overflow = (await this.list()).slice(MAX_RECORDS);
      overflow.forEach((item) => records.delete(item.id));
    },
    async delete(id) {
      records.delete(id);
    },
    async clear() {
      records.clear();
    },
  };
}

let browserStore: HistoryStore | null = null;
export function getHistoryStore(): HistoryStore {
  if (typeof indexedDB === "undefined") return createMemoryHistoryStore();
  browserStore ??= new IndexedDbHistoryStore();
  return browserStore;
}

