// backend/src/utils/metrics.js
//
// In-process system metrics for the admin System tab.
//
// WHY IN-MEMORY
// -------------
// The backend runs as a single Render instance and already relies on that for
// the route LRU (see utils/lruCache.js). These counters are a live view of THIS
// process, so there is nothing to persist: writing a row per request or query
// would add load to the very database we are trying to measure, and the numbers
// are naturally reset by a deploy. The registry is fixed-size so it can never
// grow without bound.
//
// WHAT IS TRACKED
// ---------------
//   http.*      request counts, status classes, latency percentiles, per-route
//   db.*        query counts, errors, latency percentiles, per-verb counts
//   routing.server.*   off-campus A*: load vs search time, graph size, cache hits
//   routing.client.*   campus A* reported back by browsers (POST /analytics/perf)
//
// Latency percentiles are computed over a bounded rolling window of the most
// recent samples, while counts/sums accumulate for the lifetime of the process.
// "Average" therefore uses every sample; percentiles describe recent behaviour,
// which is what an operator wants when latency degrades.

const DEFAULT_SAMPLE_CAPACITY = 512;
const DEFAULT_MAX_ENDPOINTS = 60;

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Running stats for a stream of numeric samples (latency in ms, node counts,
 * etc.). Keeps a bounded ring buffer so memory is independent of traffic.
 *
 * `min` starts at Infinity and is only reported when at least one sample has
 * arrived, which is why every accessor guards on `count`.
 */
class Series {
  constructor(capacity = DEFAULT_SAMPLE_CAPACITY) {
    this.capacity = capacity;
    this.values = [];
    this.cursor = 0;
    this.count = 0;
    this.sum = 0;
    this.min = Infinity;
    this.max = 0;
  }

  add(value) {
    // A NaN from a bad clock reading must not poison sum/min/max, so drop it
    // rather than record it as a real observation.
    if (!Number.isFinite(value)) return;
    this.count += 1;
    this.sum += value;
    if (value < this.min) this.min = value;
    if (value > this.max) this.max = value;

    if (this.values.length < this.capacity) {
      this.values.push(value);
    } else {
      this.values[this.cursor] = value;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
  }

  get average() {
    return this.count > 0 ? this.sum / this.count : 0;
  }

  percentile(p) {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a - b);
    // Nearest-rank: for p=95 over N samples take the ceil(0.95*N)-th (1-indexed),
    // clamped to the last element. Over a small sample this is steadier than an
    // interpolated percentile and easier to reason about.
    const rank = Math.ceil((p / 100) * sorted.length);
    const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
    return sorted[index];
  }

  snapshot() {
    return {
      count: this.count,
      avg: round(this.average),
      min: this.count > 0 ? round(this.min) : 0,
      max: round(this.max),
      p50: round(this.percentile(50)),
      p95: round(this.percentile(95)),
      p99: round(this.percentile(99)),
    };
  }
}

function emptySeries() {
  return { count: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
}

/**
 * Collapse high-cardinality URL segments so one endpoint cannot spawn unlimited
 * metric keys: `/api/reports/8f3c...` and `/admin/users/42` both become `:id`.
 */
function normalisePath(path) {
  return String(path || '')
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, ':id')
    .replace(/\/\d+/g, '/:id');
}

class MetricsRegistry {
  constructor({ sampleCapacity = DEFAULT_SAMPLE_CAPACITY, maxEndpoints = DEFAULT_MAX_ENDPOINTS } = {}) {
    this.startedAt = Date.now();
    this.sampleCapacity = sampleCapacity;
    this.maxEndpoints = maxEndpoints;
    this.counters = new Map();
    this.series = new Map();
    this.endpoints = new Map();
  }

  increment(name, by = 1) {
    this.counters.set(name, (this.counters.get(name) || 0) + by);
  }

  counter(name) {
    return this.counters.get(name) || 0;
  }

  observe(name, value) {
    let series = this.series.get(name);
    if (!series) {
      series = new Series(this.sampleCapacity);
      this.series.set(name, series);
    }
    series.add(value);
    return series;
  }

  seriesSnapshot(name) {
    return this.series.get(name)?.snapshot() ?? emptySeries();
  }

  // ── HTTP ────────────────────────────────────────────────────────────────────
  recordHttpRequest({ method, path, status, ms }) {
    this.increment('http.requests');
    const code = Number(status) || 0;
    const statusClass = `${Math.floor(code / 100)}xx`;
    this.increment(`http.status.${statusClass}`);
    this.observe('http.latency', ms);

    const key = `${method} ${normalisePath(path)}`;
    let endpoint = this.endpoints.get(key);
    if (!endpoint) {
      // Past the cap, fold everything into one overflow bucket rather than
      // silently dropping (a drop would understate traffic and look like a bug).
      if (this.endpoints.size >= this.maxEndpoints) {
        endpoint = this.endpoints.get('other');
        if (!endpoint) {
          endpoint = this.#newEndpoint('other');
          this.endpoints.set('other', endpoint);
        }
      } else {
        endpoint = this.#newEndpoint(key);
        this.endpoints.set(key, endpoint);
      }
    }
    endpoint.count += 1;
    endpoint.statuses.set(code, (endpoint.statuses.get(code) || 0) + 1);
    endpoint.series.add(ms);
  }

  #newEndpoint(key) {
    return { key, count: 0, statuses: new Map(), series: new Series(this.sampleCapacity) };
  }

  // ── Database ────────────────────────────────────────────────────────────────
  recordDbQuery({ ms, ok, verb }) {
    this.increment('db.queries');
    this.observe('db.latency', ms);
    if (!ok) this.increment('db.errors');
    if (verb) this.increment(`db.verb.${verb}`);
  }

  // ── Server-side routing (off-campus) ─────────────────────────────────────────
  recordServerRoute({ ok, reason, cacheHit, mode, totalMs, graphLoadMs, astarMs, edgeCount, nodeCount }) {
    this.increment('routing.server.requests');
    if (cacheHit) this.increment('routing.server.cacheHits');
    if (!ok) {
      this.increment('routing.server.failures');
      if (reason) this.increment(`routing.server.reason.${reason}`);
    }
    if (mode) this.increment(`routing.server.mode.${mode}`);

    if (Number.isFinite(totalMs)) this.observe('routing.server.totalMs', totalMs);
    if (Number.isFinite(graphLoadMs)) this.observe('routing.server.graphLoadMs', graphLoadMs);
    if (Number.isFinite(astarMs)) this.observe('routing.server.astarMs', astarMs);

    if (Number.isFinite(edgeCount)) {
      this.increment('routing.server.edges.sum', edgeCount);
      this.increment('routing.server.edges.n');
    }
    if (Number.isFinite(nodeCount)) {
      this.increment('routing.server.nodes.sum', nodeCount);
      this.increment('routing.server.nodes.n');
    }
  }

  // ── Client-side routing (reported by browsers) ───────────────────────────────
  recordClientRoute({ kind, astarMs, nodesExplored, edgeCount, roundTripMs, ok }) {
    this.increment('routing.client.reports');
    const campus = kind !== 'offcampus';

    if (campus) {
      this.increment('routing.client.campus.requests');
      if (Number.isFinite(astarMs)) this.observe('routing.client.campus.astarMs', astarMs);
      if (Number.isFinite(nodesExplored)) this.observe('routing.client.campus.nodesExplored', nodesExplored);
      if (Number.isFinite(edgeCount)) {
        this.increment('routing.client.campus.edges.sum', edgeCount);
        this.increment('routing.client.campus.edges.n');
      }
    } else {
      this.increment('routing.client.offcampus.requests');
      if (ok === false) this.increment('routing.client.offcampus.failures');
      if (Number.isFinite(roundTripMs)) this.observe('routing.client.offcampus.roundTripMs', roundTripMs);
      if (Number.isFinite(edgeCount)) {
        this.increment('routing.client.offcampus.edges.sum', edgeCount);
        this.increment('routing.client.offcampus.edges.n');
      }
    }
  }

  /** Average of a running sum, or 0 when nothing has been recorded. */
  #sumAverage(sumName, countName) {
    const n = this.counter(countName);
    return n > 0 ? round(this.counter(sumName) / n) : 0;
  }

  snapshot() {
    const uptimeMs = Date.now() - this.startedAt;
    const uptimeMinutes = uptimeMs / 60000;

    const total = this.counter('http.requests');
    const err4 = this.counter('http.status.4xx');
    const err5 = this.counter('http.status.5xx');

    const endpoints = [...this.endpoints.values()]
      .map((ep) => {
        const worstStatus = [...ep.statuses.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          route: ep.key,
          count: ep.count,
          avgMs: round(ep.series.average),
          p95Ms: round(ep.series.percentile(95)),
          lastStatus: worstStatus ? worstStatus[0] : 0,
        };
      })
      .sort((a, b) => b.count - a.count);

    const serverRequests = this.counter('routing.server.requests');
    const clientCampus = this.counter('routing.client.campus.requests');
    const clientOff = this.counter('routing.client.offcampus.requests');

    return {
      startedAt: new Date(this.startedAt).toISOString(),
      uptimeMs,
      http: {
        total,
        requestsPerMinute: uptimeMinutes > 0 ? round(total / uptimeMinutes, 2) : 0,
        byStatus: {
          '2xx': this.counter('http.status.2xx'),
          '3xx': this.counter('http.status.3xx'),
          '4xx': err4,
          '5xx': err5,
        },
        errorRate: total > 0 ? round((err4 + err5) / total, 4) : 0,
        latency: this.seriesSnapshot('http.latency'),
        endpoints: endpoints.slice(0, 20),
      },
      db: {
        queries: this.counter('db.queries'),
        errors: this.counter('db.errors'),
        latency: this.seriesSnapshot('db.latency'),
        byVerb: {
          SELECT: this.counter('db.verb.SELECT'),
          INSERT: this.counter('db.verb.INSERT'),
          UPDATE: this.counter('db.verb.UPDATE'),
          DELETE: this.counter('db.verb.DELETE'),
          WITH: this.counter('db.verb.WITH'),
        },
      },
      serverRouting: {
        requests: serverRequests,
        cacheHits: this.counter('routing.server.cacheHits'),
        cacheHitRate: serverRequests > 0 ? round(this.counter('routing.server.cacheHits') / serverRequests, 4) : 0,
        failures: this.counter('routing.server.failures'),
        corridorLoads: this.counter('routing.server.mode.corridor'),
        bboxFallbacks: this.counter('routing.server.mode.bbox'),
        avgEdgeCount: this.#sumAverage('routing.server.edges.sum', 'routing.server.edges.n'),
        avgNodeCount: this.#sumAverage('routing.server.nodes.sum', 'routing.server.nodes.n'),
        totalMs: this.seriesSnapshot('routing.server.totalMs'),
        graphLoadMs: this.seriesSnapshot('routing.server.graphLoadMs'),
        astarMs: this.seriesSnapshot('routing.server.astarMs'),
      },
      clientRouting: {
        reports: this.counter('routing.client.reports'),
        campus: {
          requests: clientCampus,
          avgEdgeCount: this.#sumAverage('routing.client.campus.edges.sum', 'routing.client.campus.edges.n'),
          astarMs: this.seriesSnapshot('routing.client.campus.astarMs'),
          nodesExplored: this.seriesSnapshot('routing.client.campus.nodesExplored'),
        },
        offcampus: {
          requests: clientOff,
          failures: this.counter('routing.client.offcampus.failures'),
          avgEdgeCount: this.#sumAverage('routing.client.offcampus.edges.sum', 'routing.client.offcampus.edges.n'),
          roundTripMs: this.seriesSnapshot('routing.client.offcampus.roundTripMs'),
        },
      },
    };
  } 

  /** Test/maintenance seam: wipe all counters and samples. */
  reset() {
    this.counters.clear();
    this.series.clear();
    this.endpoints.clear();
    this.startedAt = Date.now();
  }
}

export const metrics = new MetricsRegistry();

export function recordHttpRequest(payload) { metrics.recordHttpRequest(payload); }
export function recordDbQuery(payload) { metrics.recordDbQuery(payload); }
export function recordServerRoute(payload) { metrics.recordServerRoute(payload); }
export function recordClientRoute(payload) { metrics.recordClientRoute(payload); }
export function snapshotSystemMetrics() { return metrics.snapshot(); }
export function resetSystemMetrics() { metrics.reset(); }

export { Series, normalisePath };
