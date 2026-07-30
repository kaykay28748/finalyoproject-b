// services/recentSearches.js
const RECENT_KEY = "tg_recent";
const MAX_RECENT = 10;
const MAX_AGE_DAYS = 30;

export function saveRecentSearch(location) {
  if (!location || !location.name) return;

  let recent = [];
  try {
    recent = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch (e) {
    recent = [];
  }

  // Remove duplicate if exists
  recent = recent.filter((item) => item.name !== location.name);

  // Add to front with timestamp
  recent.unshift({
    name: location.name,
    lat: location.lat,
    lng: location.lng,
    type: location.type,
    source: location.source,
    timestamp: Date.now(),
  });

  // Remove older than 30 days
  const thirtyDaysAgo = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  recent = recent.filter((item) => item.timestamp > thirtyDaysAgo);

  // Keep only last 10
  recent = recent.slice(0, MAX_RECENT);

  localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
  
  // Dispatch event so SearchBox can refresh
  window.dispatchEvent(new Event('recentSearchesUpdated'));
}

export function getRecentSearches() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY);
  window.dispatchEvent(new Event('recentSearchesUpdated'));
}