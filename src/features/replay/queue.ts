export type QueueItem = {
  id: string;
  owner: string;
  replayId: string;
  path: string;
  method: "PUT" | "POST";
  body: unknown;
  createdAt: number;
  bytes: number;
};
const DB = "standin-replay-v1";
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_AGE = 24 * 60 * 60_000;
let database: Promise<IDBDatabase> | undefined;
function db() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("queue"))
        request.result.createObjectStore("queue", { keyPath: "id" });
      if (!request.result.objectStoreNames.contains("control"))
        request.result.createObjectStore("control");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onblocked = () => reject(new Error("replay_queue_upgrade_blocked"));
    request.onerror = () => reject(request.error);
  }));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
  storeName = "queue",
) {
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction(storeName, mode);
    const request = operation(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const queueItems = () =>
  transaction("readonly", (store) => store.getAll()) as Promise<QueueItem[]>;
export const removeQueued = (id: string) => transaction("readwrite", (store) => store.delete(id));
export const clearReplayQueue = () => transaction("readwrite", (store) => store.clear());
export async function enqueue(item: QueueItem): Promise<number> {
  await transaction("readwrite", (store) => store.put(item));
  const items = (await queueItems()).sort((a, b) => a.createdAt - b.createdAt);
  let size = items.reduce((sum, entry) => sum + entry.bytes, 0);
  let dropped = 0;
  for (const entry of items) {
    if (Date.now() - entry.createdAt > MAX_AGE || size > MAX_BYTES) {
      await removeQueued(entry.id);
      size -= entry.bytes;
      dropped++;
    }
  }
  return dropped;
}

/** Stored separately from payloads so clearing uploads cannot erase a withdrawal. */
export const persistedWithdrawal = () =>
  transaction("readonly", (store) => store.get("withdrawn"), "control") as Promise<
    boolean | undefined
  >;
export const persistWithdrawal = (value: boolean) =>
  transaction("readwrite", (store) => store.put(value, "withdrawn"), "control");

/** Owner-scoped control work survives payload eviction, expiry and process restart. */
export const pendingWithdrawal = (owner: string) =>
  transaction("readonly", (store) => store.get(`delete:${owner}`), "control") as Promise<
    boolean | undefined
  >;
export const persistPendingWithdrawal = (owner: string, pending: boolean) =>
  pending
    ? transaction("readwrite", (store) => store.put(true, `delete:${owner}`), "control")
    : transaction("readwrite", (store) => store.delete(`delete:${owner}`), "control");
