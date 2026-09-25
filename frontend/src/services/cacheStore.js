// services/cacheStore.js
// IndexedDB wrapper for large graph caching (much higher quota than localStorage)

const DB_NAME = 'ug-routing-cache';
const STORE_NAME = 'graphs';
const CACHE_KEY = 'graph';

let dbInstance = null;

/**
 * Initialize IndexedDB connection
 */
async function initDB() {
  if (dbInstance) return dbInstance;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
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
 * Save graph to IndexedDB cache
 */
export async function cacheGraph(graph) {
  try {
    const db = await initDB();
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      const data = {
        timestamp: Date.now(),
        graph: graph
      };
      
      const request = store.put(data, CACHE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[CacheStore] Graph cached to IndexedDB');
        resolve();
      };
    });
  } catch (error) {
    console.warn('[CacheStore] Could not cache to IndexedDB:', error.message);
  }
}

/**
 * Load graph from IndexedDB cache
 */
export async function getCachedGraph() {
  try {
    const db = await initDB();
    
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(CACHE_KEY);
      
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          resolve(null);
          return;
        }
        
        const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
        const age = Date.now() - data.timestamp;
        
        if (age < CACHE_DURATION_MS) {
          console.log(`[CacheStore] Loading from IndexedDB cache (${(age / 1000).toFixed(1)}s old)`);
          resolve(data.graph);
        } else {
          console.log('[CacheStore] Cache expired, will rebuild');
          resolve(null);
        }
      };
    });
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
    const db = await initDB();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(CACHE_KEY);

      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          resolve(null);
          return;
        }

        const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
        const ageMs = Date.now() - data.timestamp;

        if (ageMs < CACHE_DURATION_MS) {
          resolve({ graph: data.graph, cachedAt: data.timestamp, ageMs });
        } else {
          resolve(null);
        }
      };
    });
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
    const db = await initDB();
    
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(CACHE_KEY);
      
      request.onsuccess = () => {
        console.log('[CacheStore] Cache cleared');
        resolve();
      };
    });
  } catch (error) {
    console.warn('[CacheStore] Could not clear cache:', error.message);
  }
}
