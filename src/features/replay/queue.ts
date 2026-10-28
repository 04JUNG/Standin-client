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
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("queue", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}
async function transaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = database.transaction("queue", mode);
    const request = operation(tx.objectStore("queue"));
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
