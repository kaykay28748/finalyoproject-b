// services/cacheStore.js
// IndexedDB wrapper for large graph caching (much higher quota than localStorage)

const DB_NAME = 'ug-routing-cache';
const STORE_NAME = 'graphs';
const CACHE_KEY = 'graph';

// Safari/WebKit leaves indexedDB.open() pending indefinitely when another tab
// holds an older connection open (the request fires onblocked and nothing else),
// and commonly right after the user clears site data. With no ceiling the
// caller waits forever, so the graph build stalls silently before it ever
// reaches Overpass. Bounding it degrades that case into a plain cache miss.
const DB_OPEN_TIMEOUT_MS = 4000;

// Safari aborts the whole transaction when a write exceeds its storage quota
// but does not reliably fire the request's error event, leaving tx.onabort as
// the only signal that the write died.
const TX_TIMEOUT_MS = 15000;

// Marks "this browser will not give us a usable database" so callers can skip
// the scary warning for an expected condition rather than a real fault.
const CACHE_UNAVAILABLE = 'CacheUnavailableError';

let dbInstance = null;
let dbPending  = null;

function cacheUnavailable(reason) {
  const error = new Error(reason);
  error.name = CACHE_UNAVAILABLE;
  return error;
}

function reportReadFailure(error) {
  if (error?.name !== CACHE_UNAVAILABLE) {
    console.warn('[CacheStore] Could not read from IndexedDB:', error.message);
  }
}

/**
 * Drop the cached handle. The browser can close an IndexedDB connection at any
 * time (PWA backgrounding, storage eviction, or another tab upgrading the
 * schema), which leaves a handle that throws on the next transaction.
 */
function closeDB() {
  if (!dbInstance) return;
  try {
    dbInstance.close();
  } catch {
    // Already closed — nothing to release.
  }
  dbInstance = null;
}

/**
 * Resolve a usable connection, or null if this browser/context cannot provide
 * one. Never rejects and never hangs, so a dead cache can only cost a rebuild.
 */
async function initDB() {
  if (dbInstance) return dbInstance;
  if (dbPending)  return dbPending;

  // Safari private browsing and locked-down contexts can omit IndexedDB
  // entirely; treat that as "no cache" rather than a hard failure.
  if (typeof indexedDB === 'undefined' || indexedDB === null) return null;

  dbPending = new Promise((resolve) => {
    let settled   = false;
    let openTimer = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (openTimer) clearTimeout(openTimer);
      resolve(value);
    };

    let request;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch {
      // Safari throws synchronously (SecurityError) in restricted contexts.
      finish(null);
      return;
    }

    openTimer = setTimeout(() => {
      console.warn('[CacheStore] IndexedDB open timed out — treating as cache miss');
      finish(null);
    }, DB_OPEN_TIMEOUT_MS);

    request.onerror = () => finish(null);

    // Another connection is holding an older version open. The request will
    // not settle until that tab goes away, so deliberately do not wait on it.
    request.onblocked = () => {
      console.warn('[CacheStore] IndexedDB open blocked by another connection');
    };

    request.onsuccess = () => {
      const db = request.result;
      // A schema upgrade in another tab force-closes this handle; discard it so
      // the next call reopens instead of throwing on a dead connection.
      db.onversionchange = () => closeDB();
      db.onclose = () => {
        if (dbInstance === db) dbInstance = null;
      };
      dbInstance = db;
      finish(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });

  const db = await dbPending;
  dbPending = null;
  return db;
}

/**
 * Run a read/write against the graph store, reopening once if the connection is
 * closed or unusable. Throws CacheUnavailableError when no database can be
 * obtained, which callers treat as a cache miss.
 */
async function withStore(mode, run) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const db = await initDB();
      if (!db) throw cacheUnavailable('IndexedDB unavailable');

      return await new Promise((resolve, reject) => {
        let settled = false;
        let txTimer = null;

        const succeed = (value) => {
          if (settled) return;
          settled = true;
          if (txTimer) clearTimeout(txTimer);
          resolve(value);
        };
        const fail = (error) => {
          if (settled) return;
          settled = true;
          if (txTimer) clearTimeout(txTimer);
          reject(error);
        };

        let tx;
        try {
          tx = db.transaction(STORE_NAME, mode);
        } catch (error) {
          fail(error);
          return;
        }

        txTimer = setTimeout(() => {
          try {
            tx.abort();
          } catch {
            // Transaction already settled.
          }
          fail(cacheUnavailable('IndexedDB transaction timed out'));
        }, TX_TIMEOUT_MS);

        tx.onabort = () => fail(tx.error || cacheUnavailable('IndexedDB transaction aborted'));
        tx.onerror = () => fail(tx.error);

        let request;
        try {
          request = run(tx.objectStore(STORE_NAME));
        } catch (error) {
          fail(error);
          return;
        }

        request.onsuccess = () => succeed(request.result);
        request.onerror   = () => fail(request.error);
      });
    } catch (error) {
      // A closed handle or an unavailable database is worth one fresh attempt;
      // Safari frequently opens cleanly on the second try after a data clear.
      const retryable =
        error?.name === 'InvalidStateError' || error?.name === CACHE_UNAVAILABLE;
      if (!retryable || attempt === 1) throw error;

      console.warn(`[CacheStore] ${error.name} — retrying with a fresh connection`);
      closeDB();
      dbPending = null;
    }
  }
  throw cacheUnavailable('IndexedDB unavailable');
}

/**
 * Save graph to IndexedDB cache
 */
export async function cacheGraph(graph) {
  try {
    const data = {
      timestamp: Date.now(),
      graph: graph
    };

    await withStore('readwrite', (store) => store.put(data, CACHE_KEY));
    console.log('[CacheStore] Graph cached to IndexedDB');
  } catch (error) {
    if (error?.name !== CACHE_UNAVAILABLE) {
      console.warn('[CacheStore] Could not cache to IndexedDB:', error.message);
    }
  }
}

/**
 * Load graph from IndexedDB cache
 */
export async function getCachedGraph() {
  try {
    const data = await withStore('readonly', (store) => store.get(CACHE_KEY));
    if (!data) return null;

    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
    const age = Date.now() - data.timestamp;

    if (age < CACHE_DURATION_MS) {
      console.log(`[CacheStore] Loading from IndexedDB cache (${(age / 1000).toFixed(1)}s old)`);
      return data.graph;
    }

    console.log('[CacheStore] Cache expired, will rebuild');
    return null;
  } catch (error) {
    reportReadFailure(error);
    return null;
  }
}

/**
 * Load graph from IndexedDB cache, preserving its age.
 *
 * Expired entries are still returned, flagged with `isStale`. Overpass is a
 * rate-limited public service that is frequently unreachable, so discarding a
 * perfectly usable graph after 24h only guarantees a broken map for anyone who
 * reloads while the mirrors are down. Callers revalidate stale data in the
 * background instead of blocking on it.
 */
export async function getCachedGraphWithAge() {
  try {
    const data = await withStore('readonly', (store) => store.get(CACHE_KEY));
    if (!data) return null;

    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
    const ageMs = Date.now() - data.timestamp;

    return {
      graph: data.graph,
      cachedAt: data.timestamp,
      ageMs,
      isStale: ageMs >= CACHE_DURATION_MS,
    };
  } catch (error) {
    reportReadFailure(error);
    return null;
  }
}

/**
 * Clear cache (for testing/debugging)
 */
export async function clearCache() {
  try {
    await withStore('readwrite', (store) => store.delete(CACHE_KEY));
    console.log('[CacheStore] Cache cleared');
  } catch (error) {
    if (error?.name !== CACHE_UNAVAILABLE) {
      console.warn('[CacheStore] Could not clear cache:', error.message);
    }
  }
}
