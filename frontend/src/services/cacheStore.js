// services/cacheStore.js
// IndexedDB wrapper for large graph caching (much higher quota than localStorage)

const DB_NAME = 'ug-routing-cache';
const STORE_NAME = 'graphs';
const CACHE_KEY = 'graph';

let dbInstance = null;

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
 * Initialize IndexedDB connection
 */
async function initDB() {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      // A schema upgrade in another tab force-closes this handle; discard it so
      // the next call reopens instead of throwing on a dead connection.
      db.onversionchange = () => closeDB();
      db.onclose = () => {
        if (dbInstance === db) dbInstance = null;
      };
      dbInstance = db;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

/**
 * Run a read/write against the graph store, reopening once if the cached
 * connection turns out to be closed.
 */
async function withStore(mode, run) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const db = await initDB();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = run(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      const staleConnection = error?.name === 'InvalidStateError';
      if (!staleConnection || attempt === 1) throw error;
      console.warn('[CacheStore] Stale IndexedDB connection, reopening...');
      closeDB();
    }
  }
  return null;
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
    console.warn('[CacheStore] Could not cache to IndexedDB:', error.message);
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
    console.warn('[CacheStore] Could not read from IndexedDB:', error.message);
    return null;
  }
}

/**
 * Load graph from IndexedDB cache, preserving its age.
 * Same contract as getCachedGraph, but returns { graph, cachedAt, ageMs } so
 * callers can disclose data freshness instead of only logging it.
 */
export async function getCachedGraphWithAge() {
  try {
    const data = await withStore('readonly', (store) => store.get(CACHE_KEY));
    if (!data) return null;

    const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
    const ageMs = Date.now() - data.timestamp;

    if (ageMs < CACHE_DURATION_MS) {
      return { graph: data.graph, cachedAt: data.timestamp, ageMs };
    }

    return null;
  } catch (error) {
    console.warn('[CacheStore] Could not read from IndexedDB:', error.message);
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
    console.warn('[CacheStore] Could not clear cache:', error.message);
  }
}
