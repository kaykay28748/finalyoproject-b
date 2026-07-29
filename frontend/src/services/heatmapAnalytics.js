// frontend/src/services/heatmapAnalytics.js
// Handles sampling route coordinates and posting them to the heatmap endpoint,
// and fetching aggregated heatmap data for the map overlay.

import { API_URL } from "../config";

// ── Sampling config ───────────────────────────────────────────────────────────
// Sample every Nth coordinate to keep payloads small.
// With ~100 coord routes this gives ~25 points per route — enough for a smooth
// heatmap without hammering the DB with every single node.
const SAMPLE_EVERY_N = 4;

// Bucket precision — 5 decimal places ≈ 1.1m at the equator.
// All points within ~1m of each other aggregate into the same cell.
const BUCKET_PRECISION = 5;

// Minimum coordinates required before we bother logging — avoids logging
// trivially short routes (e.g. start === end fallback paths)
const MIN_COORDS_TO_LOG = 5;

// ── In-memory dedup ───────────────────────────────────────────────────────────
// Don't log the same route twice in the same session (e.g. profile switches
// that produce an identical path). Key = first+last coord bucketed.
const loggedRouteKeys = new Set();

/**
 * Rounds a coordinate to BUCKET_PRECISION decimal places.
 * This clusters nearby points into the same grid cell in the DB.
 */
function bucket(value) {
  return parseFloat(value.toFixed(BUCKET_PRECISION));
}

/**
 * Samples a coordinate array, bucketing each point.
 * Takes every Nth point plus always includes start and end.
 */
function sampleCoordinates(coordinates) {
  if (!coordinates?.length) return [];

  const sampled = [];
  for (let i = 0; i < coordinates.length; i++) {
    if (i === 0 || i === coordinates.length - 1 || i % SAMPLE_EVERY_N === 0) {
      sampled.push({
        lat: bucket(coordinates[i].lat),
        lng: bucket(coordinates[i].lng),
      });
    }
  }
  return sampled;
}

/**
 * Builds a dedup key from the first and last coordinate of a route.
 * Prevents logging the same path twice in a session.
 */
function routeKey(coordinates) {
  if (!coordinates?.length) return null;
  const first = coordinates[0];
  const last  = coordinates[coordinates.length - 1];
  return `${bucket(first.lat)},${bucket(first.lng)}-${bucket(last.lat)},${bucket(last.lng)}`;
}

/**
 * Logs a single route's sampled coordinates to the heatmap endpoint.
 * Fire-and-forget — errors are swallowed so they never affect routing UX.
 *
 * @param {Array<{lat, lng}>} coordinates - Full route coordinate array
 */
export async function logRouteSegments(coordinates) {
  try {
    if (!coordinates || coordinates.length < MIN_COORDS_TO_LOG) return;

    const key = routeKey(coordinates);
    if (!key || loggedRouteKeys.has(key)) return;
    loggedRouteKeys.add(key);

    const segments = sampleCoordinates(coordinates);
    if (!segments.length) return;

    const now        = new Date();
    const hour       = now.getHours();
    const dayOfWeek  = now.getDay();

    // Non-blocking — we don't await the response in the call site
    fetch(`${API_URL}/analytics/heatmap`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ segments, hour, dayOfWeek }),
    }).catch(() => {
      // Silently fail — never surface heatmap errors to the user
    });

  } catch {
    // Never throw from analytics
  }
}

/**
 * Fetches aggregated heatmap data for the current map bounds.
 *
 * @param {Object} bounds - Leaflet LatLngBounds object or { south, west, north, east }
 * @param {Object} options - Optional time filters
 * @param {number} [options.hour] - Filter to a specific hour (0–23)
 * @param {number} [options.dayOfWeek] - Filter to a specific day (0=Sun … 6=Sat)
 * @returns {Promise<Array<{lat, lng, weight}>>} Normalised heatmap points
 */
export async function fetchHeatmapData(bounds, options = {}) {
  try {
    let south, west, north, east;

    if (typeof bounds.getSouth === 'function') {
      south = bounds.getSouth();
      west  = bounds.getWest();
      north = bounds.getNorth();
      east  = bounds.getEast();
    } else if (bounds._southWest) {
      south = bounds._southWest.lat;
      west  = bounds._southWest.lng;
      north = bounds._northEast.lat;
      east  = bounds._northEast.lng;
    } else {
      ({ south, west, north, east } = bounds);
    }

    if (south == null || west == null || north == null || east == null) {
      console.warn('[HeatmapAnalytics] Invalid bounds:', bounds);
      return [];
    }

    const params = new URLSearchParams({ south, west, north, east });
    if (options.hour      !== undefined) params.set('hour',      options.hour);
    if (options.dayOfWeek !== undefined) params.set('dayOfWeek', options.dayOfWeek);

    const response = await fetch(`${API_URL}/analytics/heatmap?${params}`);
    if (!response.ok) {
      console.warn('[HeatmapAnalytics] API returned', response.status);
      return [];
    }

    const data = await response.json();
    return data.points || [];

  } catch {
    return [];
  }
}

/**
 * Clears the in-memory dedup set — call this when the user starts a new
 * navigation session so the same route can be logged again.
 */
export function resetHeatmapSession() {
  loggedRouteKeys.clear();
}