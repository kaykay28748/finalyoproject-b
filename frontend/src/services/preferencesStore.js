// services/preferencesStore.js
// IndexedDB storage for user preferences + localStorage for route state

const DB_NAME = 'tg-routing-preferences';
const STORE_NAME = 'prefs';
const PREFS_KEY = 'user-preferences';

let dbInstance = null;

// localStorage keys for route persistence
const ROUTE_STATE_KEYS = {
  START_POINT: 'tg_nav_start_point',
  DEST_POINT: 'tg_nav_dest_point',
  START_TEXT: 'tg_nav_start_text',
  DEST_TEXT: 'tg_nav_dest_text',
  MARKERS_VISIBLE: 'tg_nav_markers_visible',
  VEHICLE_MODE: 'tg_nav_vehicle_mode',
  ACTIVE_PROFILE: 'tg_nav_active_profile'
};

/**
 * Initialize preferences database
 */
async function initPreferencesDB() {
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
 * Default preferences object
 */
const DEFAULT_PREFERENCES = {
  activeProfile: 'standard',
  darkMode: false,
  recentSearches: [],
  savedLocations: [],
  notificationsEnabled: true,
  timestamp: Date.now(),
};

/**
 * Save preferences to IndexedDB
 */
export async function savePreferences(prefs) {
  try {
    const db = await initPreferencesDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const data = {
        ...DEFAULT_PREFERENCES,
        ...prefs,
        timestamp: Date.now(),
      };

      const request = store.put(data, PREFS_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[PreferencesStore] Preferences saved');
        resolve(data);
      };
    });
  } catch (error) {
    console.warn('[PreferencesStore] Could not save preferences:', error.message);
    return null;
  }
}

/**
 * Load preferences from IndexedDB
 */
export async function loadPreferences() {
  try {
    const db = await initPreferencesDB();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(PREFS_KEY);

      request.onerror = () => {
        console.log('[PreferencesStore] Loading defaults (no saved prefs)');
        resolve(DEFAULT_PREFERENCES);
      };

      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          console.log('[PreferencesStore] Loading defaults (first time)');
          resolve(DEFAULT_PREFERENCES);
        } else {
          console.log('[PreferencesStore] Loaded preferences from IndexedDB');
          resolve(data);
        }
      };
    });
  } catch (error) {
    console.warn('[PreferencesStore] Could not read preferences:', error.message);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save route state to localStorage (survives page refresh)
 */
export function saveRouteState(state) {
  try {
    if (state.startPoint) {
      localStorage.setItem(ROUTE_STATE_KEYS.START_POINT, JSON.stringify(state.startPoint));
    }
    if (state.destPoint) {
      localStorage.setItem(ROUTE_STATE_KEYS.DEST_POINT, JSON.stringify(state.destPoint));
    }
    if (state.startText) {
      localStorage.setItem(ROUTE_STATE_KEYS.START_TEXT, state.startText);
    }
    if (state.destText) {
      localStorage.setItem(ROUTE_STATE_KEYS.DEST_TEXT, state.destText);
    }
    if (typeof state.markersVisible !== 'undefined') {
      localStorage.setItem(ROUTE_STATE_KEYS.MARKERS_VISIBLE, JSON.stringify(state.markersVisible));
    }
    if (state.vehicleMode) {
      localStorage.setItem(ROUTE_STATE_KEYS.VEHICLE_MODE, state.vehicleMode);
    }
    if (state.activeProfile) {
      localStorage.setItem(ROUTE_STATE_KEYS.ACTIVE_PROFILE, state.activeProfile);
    }
    console.log('[Preferences] Route state saved to localStorage');
  } catch (err) {
    console.warn('[Preferences] Failed to save route state:', err);
  }
}

/**
 * Load route state from localStorage
 */
export function loadRouteState() {
  try {
    return {
      startPoint: JSON.parse(localStorage.getItem(ROUTE_STATE_KEYS.START_POINT) || 'null'),
      destPoint: JSON.parse(localStorage.getItem(ROUTE_STATE_KEYS.DEST_POINT) || 'null'),
      startText: localStorage.getItem(ROUTE_STATE_KEYS.START_TEXT) || '',
      destText: localStorage.getItem(ROUTE_STATE_KEYS.DEST_TEXT) || '',
      markersVisible: JSON.parse(localStorage.getItem(ROUTE_STATE_KEYS.MARKERS_VISIBLE) || 'false'),
      vehicleMode: localStorage.getItem(ROUTE_STATE_KEYS.VEHICLE_MODE) || 'walk',
      activeProfile: localStorage.getItem(ROUTE_STATE_KEYS.ACTIVE_PROFILE) || 'standard'
    };
  } catch (err) {
    console.warn('[Preferences] Failed to load route state:', err);
    return null;
  }
}

/**
 * Clear route state from localStorage
 */
export function clearRouteState() {
  Object.values(ROUTE_STATE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
  console.log('[Preferences] Route state cleared');
}

/**
 * Add a location to recent searches
 */
export async function addRecentSearch(location) {
  try {
    const prefs = await loadPreferences();
    const recentSearches = prefs.recentSearches || [];

    const filtered = recentSearches.filter(
      (s) => s.name !== location.name || s.lat !== location.lat || s.lng !== location.lng
    );

    const updated = [
      { ...location, timestamp: Date.now() },
      ...filtered,
    ].slice(0, 10);

    await savePreferences({
      ...prefs,
      recentSearches: updated,
    });

    return updated;
  } catch (error) {
    console.warn('[PreferencesStore] Could not add recent search:', error.message);
    return [];
  }
}

/**
 * Save a favorite location
 */
export async function saveFavoriteLocation(location) {
  try {
    const prefs = await loadPreferences();
    const savedLocations = prefs.savedLocations || [];

    const exists = savedLocations.find((l) => l.name === location.name);
    if (exists) return savedLocations;

    const updated = [...savedLocations, { ...location, savedAt: Date.now() }];
    await savePreferences({
      ...prefs,
      savedLocations: updated,
    });

    return updated;
  } catch (error) {
    console.warn('[PreferencesStore] Could not save favorite:', error.message);
    return [];
  }
}

/**
 * Remove a favorite location
 */
export async function removeFavoriteLocation(locationName) {
  try {
    const prefs = await loadPreferences();
    const updated = (prefs.savedLocations || []).filter((l) => l.name !== locationName);

    await savePreferences({
      ...prefs,
      savedLocations: updated,
    });

    return updated;
  } catch (error) {
    console.warn('[PreferencesStore] Could not remove favorite:', error.message);
    return [];
  }
}

/**
 * Clear all preferences (for logout or reset)
 */
export async function clearPreferences() {
  try {
    const db = await initPreferencesDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(PREFS_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log('[PreferencesStore] Preferences cleared');
        resolve();
      };
    });
  } catch (error) {
    console.warn('[PreferencesStore] Could not clear preferences:', error.message);
  }
}