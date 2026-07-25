import L from "leaflet";

// Strict click boundary — full UG community
// Covers: main campus, diaspora halls, stadium, Liman, Kwapong, Sey, Nelson, Diamond Jubilee
export const UG_BOUNDS = L.latLngBounds(
  [5.6200, -0.2100], // southwest corner
  [5.6720, -0.1750]  // northeast corner
);

// Looser boundary — used for map pan and zoom (gives breathing room)
export const UG_MAX_BOUNDS = L.latLngBounds(
  [5.5800, -0.2600],
  [5.7100, -0.1300]
);

// Geographic center of UG Legon campus
export const UG_CENTER = { lat: 5.6502, lng: -0.1962 };

// Default map zoom levels
export const DEFAULT_ZOOM = 16;
export const MIN_ZOOM     = 12;
export const MAX_ZOOM     = 19;