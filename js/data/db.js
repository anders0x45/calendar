/**
 * IndexedDB bootstrap. Database "calendar" with stores: events (by id,
 * index on date), images (by event id), settings (single record).
 * Pure plumbing; domain access lives in events.js / settings.js.
 */

/** @type {Promise<IDBDatabase> | null} */
let openPromise = null;

/**
 * Forget the cached connection so the next openDb() starts fresh.
 * Only tests and recovery paths need this (e.g. after deleteDatabase).
 * @returns {Promise<void>} resolves when the connection, if open, closes
 */
export async function closeDb() {
  if (!openPromise) return;
  const db = await openPromise.catch(() => null);
  openPromise = null;
  db?.close();
}

/**
 * Open (and upgrade) the database. Reuses a single connection.
 * @returns {Promise<IDBDatabase>}
 */
export function openDb() {
  if (openPromise) return openPromise;
  openPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is unavailable"));
      return;
    }
    const request = indexedDB.open("calendar", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("events")) {
        const events = db.createObjectStore("events", { keyPath: "id" });
        events.createIndex("date", "date", { unique: false });
      }
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images");
      }
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("open failed"));
    request.onblocked = () => reject(new Error("database upgrade blocked"));
  });
  return openPromise;
}

/**
 * Run one transaction-scoped operation.
 * @template T
 * @param {("events"|"images"|"settings")[]} storeNames
 * @param {IDBTransactionMode} mode
 * @param {(stores: Record<string, IDBObjectStore>) => IDBRequest<T> | T} work
 *   may receive store handles and must synchronously return either a request
 *   or a plain value (plain values resolve immediately).
 * @returns {Promise<T>}
 */
export function withTransaction(storeNames, mode, work) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        let result;
        try {
          const tx = db.transaction(storeNames, mode);
          const stores = Object.fromEntries(storeNames.map((n) => [n, tx.objectStore(n)]));
          const outcome = work(stores);
          if (outcome instanceof IDBRequest) {
            outcome.onsuccess = () => result = outcome.result;
            outcome.onerror = () => reject(outcome.error ?? new Error("request failed"));
          } else {
            result = outcome;
          }
          tx.oncomplete = () => resolve(result);
          tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("transaction aborted"));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }),
  );
}

/**
 * Wrap a bare IDBRequest in a promise (for cursor walks etc.).
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
export function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("request failed"));
  });
}

/** Call once on first run: ask the browser to treat storage as durable. */
export function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !navigator.storage.persisted()) {
      navigator.storage.persist().catch(() => {});
    }
  } catch {
    // non-fatal
  }
}
