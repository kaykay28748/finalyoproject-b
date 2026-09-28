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

// Panning/clicking is no longer bounded to the campus.
//
// UG_BOUNDS and UG_MAX_BOUNDS are kept above rather than deleted, because they
// are still meaningful for a different job: `isGpsOnCampus` in MapView.jsx uses
// UG_MAX_BOUNDS to decide whether a GPS fix is close enough to auto-recentre
// the campus view. That is a presentation concern — "should the app jump to the
// campus when I open it?" — and it is not the same question as "may the user
// route from here?", which is what the old clamps were answering.
//
// A separate world window keeps the map usable (Leaflet needs *some* limit or a
// zoom-out can request a tile that does not exist) without re-imposing a campus
// boundary. MIN_ZOOM is lowered so the wider window is actually reachable:
// at zoom 12 the old viscosity boundary produced a rubber-band fight where the
// map sprang back before the user could pan anywhere useful.
export const WORLD_BOUNDS = L.latLngBounds(
  [-85, -180], // south-west: Web Mercator's latitude limit
  [85, 180]    // north-east
);