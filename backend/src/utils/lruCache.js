// src/utils/lruCache.js
// A small in-process LRU with a per-entry TTL.
//
// This is intentionally not Redis. A server-side route is a pure function of its
// inputs, and the backend runs as a single Render instance, so an in-memory cache
// avoids a network round-trip on every hit. The job here is narrow: remember the
// handful of recently computed routes so a reroute (the client re-asking after a
// GPS deviation, or a second user heading the same way) is served instantly
// instead of re-running four A* passes. Evict on TTL because hazards and weather
// change the answer; keep the map bounded so it can never grow without limit.

export class LruTtlCache {
  constructor({ max = 200, ttlMs = 60_000 } = {}) {
    if (!Number.isFinite(max) || max <= 0) throw new Error('LruTtlCache: max must be > 0');
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error('LruTtlCache: ttlMs must be > 0');
    this.max = max;
    this.ttlMs = ttlMs;
    // Map preserves insertion order, which is exactly the recency order we need:
    // re-inserting a key on read moves it to the newest end, and the first key of
    // the iterator is always the least-recently-used entry to evict.
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }
    // Promote to most-recently-used.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
  }

  clear() {
    this.map.clear();
  }

  get size() {
    return this.map.size;
  }
}
