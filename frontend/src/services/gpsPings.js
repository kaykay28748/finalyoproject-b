import { API_URL } from "../config";

const BATCH_INTERVAL_MS = 30000;
const BATCH_MAX_SIZE = 50;
const MIN_CELL_INTERVAL_MS = 15000;
const BUCKET_PRECISION = 4;

let buffer = [];
let intervalId = null;
let lastPingPerCell = new Map();
let lastFlushTime = Date.now();

function bucket(v) {
  return parseFloat(v.toFixed(BUCKET_PRECISION));
}

function cellKey(lat, lng) {
  return `${bucket(lat)},${bucket(lng)}`;
}

async function flush() {
  if (buffer.length === 0) return;
  lastFlushTime = Date.now();
  const batch = buffer;
  buffer = [];

  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();

  try {
    await fetch(`${API_URL}/analytics/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pings: batch, hour, dayOfWeek }),
    });
  } catch {
    // Silently fail
  }
}

export function recordPing(lat, lng) {
  if (lat == null || lng == null) return;

  const key = cellKey(lat, lng);
  const now = Date.now();
  const lastPing = lastPingPerCell.get(key);

  if (lastPing && (now - lastPing) < MIN_CELL_INTERVAL_MS) return;

  lastPingPerCell.set(key, now);
  buffer.push({ lat: bucket(lat), lng: bucket(lng) });

  if (buffer.length >= BATCH_MAX_SIZE || (now - lastFlushTime) >= BATCH_INTERVAL_MS) {
    flush();
  }
}

export function startPinger() {
  if (intervalId) return;
  intervalId = setInterval(flush, BATCH_INTERVAL_MS);
}

export function stopPinger() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  flush();
}

export function resetPingSession() {
  lastPingPerCell.clear();
}
