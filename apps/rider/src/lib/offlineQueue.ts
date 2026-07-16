// IndexedDB-backed action queue. A pick/deliver action that fails to reach
// the network is stored here instead of lost, and flushed in order once
// connectivity returns — this is the "offline-first: queue actions, sync
// on reconnect" requirement from plan.md App 2.
const DB_NAME = "daak-rider-queue";
const STORE_NAME = "pending-actions";

export interface QueuedAction {
  id: string;
  kind: "pick" | "deliver";
  shipmentId: number;
  payload: unknown;
  createdAt: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueueAction(action: Omit<QueuedAction, "id" | "createdAt">): Promise<QueuedAction> {
  const db = await openDb();
  const full: QueuedAction = { ...action, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(full);
    tx.oncomplete = () => resolve(full);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueuedActions(): Promise<QueuedAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as QueuedAction[]);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedAction(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** True for a network-level failure (offline, DNS, connection refused) —
 *  as opposed to the server responding with a real HTTP error, which
 *  should NOT be queued and retried since it'll just fail again. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}
