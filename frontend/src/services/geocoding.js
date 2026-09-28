import { UG_CENTER } from "../function/utils/bounds";
import { distanceKm } from "../function/utils/distance";
import { API_URL } from "../config";
import ugLocations from "../data/ugLocations.json";

const apiCache = new Map();

// Reachable search radius, measured from UG centre.
//
// Was 6km, which covered only Legon and its immediate neighbourhood — a search
// run from home or a lecture outside the main campus returned nothing, and the
// dropdown was simply empty with no error shown.
//
// 50km covers the Greater Accra metropolitan area in every direction: Accra
// proper spans roughly 25km east-west, Tema is ~25km, and Madina to the north is
// ~15km, so a 50km circle contains all of them with margin. The value is a
// "drop the clearly unreachable tail" guard, not a routing limit — the real
// limit is whether the server-side graph compiler has an edge for the region,
// and that is decided at request time by /api/admin/sync-region rather than
// being baked into the search box.
const METRO_MAX_RADIUS_KM = 50;

// ── Local fuzzy search ───────────────────────────────────────────────────────

function scoreLocalMatch(location, query) {
  const q = query.toLowerCase().trim();
  const name = location.name.toLowerCase();
  const aliases = location.aliases || [];
  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  if (aliases.some((a) => a === q)) return 85;
  if (aliases.some((a) => a.startsWith(q))) return 80;
  if (name.includes(` ${q}`) || name.includes(`${q} `)) return 70;
  if (name.includes(q)) return 60;
  if (aliases.some((a) => a.includes(q))) return 50;
  const tokens = q.split(" ").filter((t) => t.length >= 2);
  if (tokens.length > 1) {
    const hits = tokens.filter(
      (t) => name.includes(t) || aliases.some((a) => a.includes(t))
    ).length;
    if (hits === tokens.length) return 45;
    if (hits > 0) return 30;
  }
  return 0;
}

export function searchLocal(query) {
  if (!query || query.trim().length < 2) return [];
  const cleanQuery = query.trim().toLowerCase();
  const queryWords = cleanQuery.split(/\s+/);

  let allWordsValid = true;
  for (const word of queryWords) {
    if (word.length < 3) continue;
    const wordExists = ugLocations.some(
      (loc) =>
        loc.name.toLowerCase().includes(word) ||
        (loc.aliases && loc.aliases.some((alias) => alias.toLowerCase().includes(word)))
    );
    if (!wordExists) {
      allWordsValid = false;
      break;
    }
  }

  if (!allWordsValid) return [];

  return ugLocations
    .map((loc) => ({ ...loc, score: scoreLocalMatch(loc, cleanQuery) }))
    .filter((loc) => loc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((loc) => ({
      name: loc.name,
      lat: loc.lat,
      lng: loc.lng,
      type: loc.type,
      dist: distanceKm(UG_CENTER.lat, UG_CENTER.lng, loc.lat, loc.lng),
      source: "local",
    }));
}

// ── Area label extraction ────────────────────────────────────────────────────
// Reads the structured address object that LocationIQ returns when
// addressdetails=1 is set on the backend request.
// Priority: suburb > neighbourhood > quarter > district > county > city
// Falls back to the second segment of display_name (usually a road name)
// so something useful always appears even in low-coverage areas.
function extractArea(address = {}, displayName = "") {
  if (address.town)          return address.town;
  if (address.suburb)        return address.suburb;
  if (address.neighbourhood) return address.neighbourhood;
  if (address.quarter)       return address.quarter;
  if (address.district)      return address.district;
  if (address.county)        return address.county;
  if (address.city_district) return address.city_district;
  if (address.city)          return address.city;
  const segment = displayName.split(",")[1]?.trim();
  return segment || null;
}

// ── Place name extraction ────────────────────────────────────────────────────
// LocationIQ stores the place name under the OSM type key in the address object
// e.g. type="fast_food" → address.fast_food = "KFC"
//      type="restaurant" → address.restaurant = "Pizza Man"
//      type="bank" → address.bank = "Stanbic"
// Falls back to common fixed keys, then display_name first segment.
function extractName(item) {
  return (
    (item.type && item.address?.[item.type]) ||
    (item.class && item.address?.[item.class]) ||
    item.address?.amenity  ||
    item.address?.shop     ||
    item.address?.office   ||
    item.address?.building ||
    item.address?.tourism  ||
    item.address?.leisure  ||
    item.display_name.split(",")[0].trim()
  );
}

// ── Main geocode function ────────────────────────────────────────────────────
export async function geocode(query, signal) {
  if (!query || query.trim().length < 3) return [];

  const localResults = searchLocal(query);
  if (localResults.length >= 2) return localResults;

  const cacheKey = query.trim().toLowerCase();
  if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);

  try {
    const url = `${API_URL}/api/locationiq/search?q=${encodeURIComponent(query.trim())}`;
    const response = await fetch(url, { signal });

    if (!response.ok) return localResults;

    const data = await response.json();
    if (!data || data.length === 0) return localResults;

    const formatted = data
      .map((item) => {
        const lat  = parseFloat(item.lat);
        const lng  = parseFloat(item.lon);
        const dist = distanceKm(UG_CENTER.lat, UG_CENTER.lng, lat, lng);
        const name = extractName(item);
        const area = extractArea(item.address || {}, item.display_name);

        // displayLabel is what the dropdown shows as the primary line:
        // "KFC — East Legon" instead of just "KFC"
        const displayLabel = area ? `${name} — ${area}` : name;

        return {
          name,
          displayLabel,
          area,
          fullAddress: item.display_name,
          lat,
          lng,
          dist,
          source: "locationiq",
          type: "place",
        };
      })
      // Reachable window: 50km from campus, so the whole Greater Accra
      // metropolitan area is searchable.
      //
      // This was a hard `.filter((r) => r.dist <= UG_MAX_RADIUS_KM)` at 6km,
      // which made a search from home return an empty dropdown with no error —
      // the same chain in Kumasi was in the API response and was simply being
      // discarded. The filter is not deleted, it is widened: without ANY bound
      // the LocationIQ response is ranked by relevance, and a query like
      // "KFC" can otherwise fill the whole dropdown with branches in Tema or
      // Takoradi that the user cannot route to.
      .filter((r) => r.dist <= METRO_MAX_RADIUS_KM)
      // Closest branch first — still the right order now that the window is
      // wide, because the user almost always wants the nearest match.
      .sort((a, b) => a.dist - b.dist)
      // Cap at 8 for the dropdown (was 5): a wider window needs more rows
      // before the nearest useful one appears.
      .slice(0, 8);

    apiCache.set(cacheKey, formatted);
    // Keep cache from growing unbounded
    if (apiCache.size > 200) {
      apiCache.delete(apiCache.keys().next().value);
    }

    return formatted;
  } catch (err) {
    if (err.name === "AbortError") return null;
    return localResults;
  }
}

// ── Reverse geocode ──────────────────────────────────────────────────────────
export async function reverseGeocode(lat, lng) {
  try {
    const url = `${API_URL}/api/locationiq/reverse?lat=${lat}&lon=${lng}&format=json`;
    const response = await fetch(url);

    if (!response.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    const data = await response.json();

    if (data.address?.building) return data.address.building;
    if (data.address?.road)     return data.address.road;
    if (data.address?.footway)  return data.address.footway;

    return data.display_name?.split(",")[0] || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}