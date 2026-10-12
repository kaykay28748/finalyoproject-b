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

// Accra metropolitan data coverage — the region actually imported into
// public.regional_pedestrian_edges. Corners are the true extent of the
// imported edges (plus the small overspill of ways that cross the clip box
// from ghana-261011.osm.pbf), so anything on the map here is routable and, in
// particular, Tema neighbours around lng ≈ −0.017 count as "in coverage" for
// the GPS auto-locate.
export const METRO_BOUNDS = L.latLngBounds(
  [5.4978, -0.3881], // south-west: coast / Weija
  [5.8706, 0.0026]   // north-east: toward Tema
);

// Geographic center of the imported coverage box.
export const METRO_CENTER = { lat: 5.6842, lng: -0.1928 };

// Default map zoom levels
export const DEFAULT_ZOOM = 16;
export const MIN_ZOOM     = 12;
export const MAX_ZOOM     = 19;

// Panning/clicking is no longer bounded to the campus.
//
// UG_BOUNDS and UG_MAX_BOUNDS are kept above rather than deleted, because they
// are still meaningful for a different job: UG_BOUNDS defines the campus
// Overpass warm-up box (graphBuilder.js), and the GPS auto-fly in
// MapView.jsx/MapLibre3DView.jsx now uses METRO_BOUNDS to decide whether a fix
// is close enough to auto-recentre onto the user. That is a presentation
// concern — "should the app jump to where I am?" — and it is not the same
// question as "may the user route from here?", which is what the old clamps
// were answering.
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