import { useState, useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Circle, useMapEvents, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";


// ─── Tile layers ──────────────────────────────────────────────────────────────
const TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_DARK  = "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png";

// ─── Marker icons ─────────────────────────────────────────────────────────────
const makePin = (color, label) => L.divIcon({
  className: "",
  html: `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="background:${color};color:#fff;font-size:10px;font-weight:700;
        font-family:'Outfit',sans-serif;padding:2px 6px;border-radius:4px;
        margin-bottom:3px;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.25);">
        ${label}
      </div>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="26" height="38">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z"
          fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle cx="12" cy="12" r="4" fill="#fff"/>
      </svg>
    </div>`,
  iconSize: [60, 58],
  iconAnchor: [30, 58],
  popupAnchor: [0, -58],
});

// Pulsing dot for current location — draggable
const currentLocationIcon = L.divIcon({
  className: "",
  html: `<div class="ug-location-dot"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

L.Marker.prototype.options.icon = makePin("#2563eb", "START");

// ─── Campus bounds ────────────────────────────────────────────────────────────
const UG_BOUNDS = L.latLngBounds(
  [5.6200, -0.2100], // southwest — stadium, Liman, Kwapong, Sey, Nelson, Diamond Jubilee
  [5.6720, -0.1750]  // northeast — diaspora halls and upper campus
);
const UG_MAX_BOUNDS = L.latLngBounds(
  [5.6100, -0.2200],
  [5.6800, -0.1650]
);

// Campus center — used to sort results by proximity
const UG_CENTER = { lat: 5.6502, lng: -0.1962 };

// ─── Distance helper ──────────────────────────────────────────────────────────
// Returns distance in km between two lat/lng points (Haversine formula)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Geocoding ────────────────────────────────────────────────────────────────
// Strategy:
// 1. Search near the center with a proximity bias (not bounded — so partial matches work)
// 2. If nothing comes back, retry without the suffix
// 3. Sort all results by distance to center so nearby locations float to the top
async function geocode(query) {
  try {
    const headers = { "Accept-Language": "en", "User-Agent": "TransitGuide/1.0" };

    // First pass — bias search toward center area
    const q1  = encodeURIComponent(query + " University of Ghana Legon Accra");
    const url1 = `https://nominatim.openstreetmap.org/search?q=${q1}&format=json&limit=8&countrycodes=gh&lat=${UG_CENTER.lat}&lon=${UG_CENTER.lng}`;
    const res1 = await fetch(url1, { headers });
    let data   = await res1.json();

    // Second pass — if first pass returned nothing, search with just the raw query in Ghana
    if (!data.length) {
      const q2  = encodeURIComponent(query + " Legon Accra Ghana");
      const url2 = `https://nominatim.openstreetmap.org/search?q=${q2}&format=json&limit=8&countrycodes=gh`;
      const res2 = await fetch(url2, { headers });
      data       = await res2.json();
    }

    // Third pass — bare query, no suffix, in case the name is very short or informal
    if (!data.length) {
      const q3  = encodeURIComponent(query);
      const url3 = `https://nominatim.openstreetmap.org/search?q=${q3}&format=json&limit=8&countrycodes=gh&lat=${UG_CENTER.lat}&lon=${UG_CENTER.lng}`;
      const res3 = await fetch(url3, { headers });
      data       = await res3.json();
    }

    // Map to clean objects and sort by proximity to UG center
    return data
      .map(d => ({
        name: d.display_name.split(",").slice(0, 2).join(", "),  // show first two parts for context
        lat:  parseFloat(d.lat),
        lng:  parseFloat(d.lon),
        dist: distanceKm(UG_CENTER.lat, UG_CENTER.lng, parseFloat(d.lat), parseFloat(d.lon)),
      }))
      .sort((a, b) => a.dist - b.dist)  // closest to UG center first
      .slice(0, 5);                      // cap at 5 results

  } catch { return []; }
}

// Reverse geocode a lat/lng to a human readable name
async function reverseGeocode(lat, lng) {
  try {
    const res  = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { headers: { "Accept-Language": "en", "User-Agent": "TransitGuide/1.0" } }
    );
    const data = await res.json();
    return data.display_name?.split(",").slice(0, 2).join(", ") || "Selected point";
  } catch { return "Selected point"; }
}

// ─── Map helpers ──────────────────────────────────────────────────────────────
function TileLayerSwitcher({ darkMode }) {
  return <TileLayer url={darkMode ? TILE_DARK : TILE_LIGHT} />;
}

// Smoothly flies map to a target location
function SmoothFly({ target }) {
  const map  = useMap();
  const prev = useRef(null);
  useEffect(() => {
    if (target && target !== prev.current) {
      map.flyTo([target.lat, target.lng], 17, { duration: 1.2 });
      prev.current = target;
    }
  }, [target, map]);
  return null;
}

// Flies to current location once on first GPS fix
function InitialFly({ location }) {
  const map  = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (location && !done.current) {
      map.flyTo([location.lat, location.lng], 17, { duration: 1.5 });
      done.current = true;
    }
  }, [location, map]);
  return null;
}

// Handles map clicks — sets destination or start depending on active mode
function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
      if (!UG_BOUNDS.contains(e.latlng)) return;
      onMapClick(e.latlng);
    }
  });
  return null;
}

// ─── Search box ───────────────────────────────────────────────────────────────
function SearchBox({ placeholder, value, onChange, onSelect, onUseCurrentLocation, showCurrentLocationOption, accentColor }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [open, setOpen]               = useState(false);
  const debounceRef                   = useRef(null);
  const wrapRef                       = useRef(null);

  const handleChange = (e) => {
    const val = e.target.value;
    onChange(val);
    clearTimeout(debounceRef.current);
    // Start searching after just 1 character — lower bar than before
    if (val.length < 1) { setOpen(showCurrentLocationOption); setSuggestions([]); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const results = await geocode(val);
      setSuggestions(results);
      setLoading(false);
      setOpen(true);
    }, 350);  // slightly faster debounce for a snappier feel
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const showDropdown = open && (showCurrentLocationOption || suggestions.length > 0 || loading);

  return (
    <div ref={wrapRef} className="ug-search-wrap">
      <div className="ug-search-inner">
        <div
          className="ug-search-dot"
          style={{ background: accentColor, boxShadow: `0 0 6px ${accentColor}` }}
        />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          className="ug-search-input"
          onMouseEnter={e => e.target.style.borderColor = accentColor}
          onMouseLeave={e => e.target.style.borderColor = ""}
        />
        {loading && (
          <div
            className="ug-search-spinner"
            style={{ border: `2px solid ${accentColor}`, borderTopColor: "transparent" }}
          />
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="ug-dropdown">

          {/* Use current location — shown at top of FROM dropdown */}
          {showCurrentLocationOption && (
            <div className="ug-dropdown-cl" onClick={() => { onUseCurrentLocation(); setOpen(false); }}>
              <div className="ug-dropdown-cl-dot" />
              Use my current location
            </div>
          )}

          {/* Loading state */}
          {loading && (
            <div className="ug-dropdown-empty">Searching...</div>
          )}

          {/* Geocoded results */}
          {!loading && suggestions.map((loc, i) => (
            <div
              key={i}
              className="ug-dropdown-item"
              onClick={() => { onChange(loc.name); onSelect(loc); setOpen(false); }}
            >
              <svg width="10" height="14" viewBox="0 0 12 16" fill="none" style={{ flexShrink: 0 }}>
                <path d="M6 0C2.686 0 0 2.686 0 6c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6z" fill={accentColor}/>
                <circle cx="6" cy="6" r="2" fill="white"/>
              </svg>
              <span>{loc.name}</span>
              {/* Show distance from UG center if more than 0.5km away */}
              {loc.dist > 0.5 && (
                <span style={{ marginLeft: "auto", fontSize: "11px", opacity: 0.5, flexShrink: 0 }}>
                  {loc.dist.toFixed(1)}km
                </span>
              )}
            </div>
          ))}

          {/* No results */}
          {!loading && suggestions.length === 0 && !showCurrentLocationOption && (
            <div className="ug-dropdown-empty">No results found — try a different name</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Map() {
  const [startPoint, setStartPoint]           = useState(null);   // start marker position
  const [destPoint, setDestPoint]             = useState(null);   // destination marker position
  const [startText, setStartText]             = useState("");     // start input text
  const [destText, setDestText]               = useState("");     // destination input text
  const [currentLocation, setCurrentLocation] = useState(null);  // live GPS position
  const [accuracy, setAccuracy]               = useState(null);  // GPS accuracy in metres
  const [locationError, setLocationError]     = useState(null);  // GPS error message
  const [flyTarget, setFlyTarget]             = useState(null);  // map fly-to target
  const [darkMode, setDarkMode]               = useState(false); // dark/light toggle
  const [markersVisible, setMarkersVisible]   = useState(false); // whether to show markers
  const [waitingForStart, setWaitingForStart] = useState(false); // pin-start tap mode
  const [isResolving, setIsResolving]         = useState(false); // geocoding in progress

  // Watch GPS continuously — only update when accuracy improves
  useEffect(() => {
    if (!navigator.geolocation) { setLocationError("Geolocation not supported"); return; }
    let bestAccuracy = Infinity;
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy: acc } = pos.coords;
        if (acc < bestAccuracy) {
          bestAccuracy = acc;
          const loc = { lat: latitude, lng: longitude };
          setCurrentLocation(loc);
          setAccuracy(Math.round(acc));
          setLocationError(null);
          // Auto-fill FROM with current location on first fix
          setStartPoint(loc);
          setStartText("My current location");
        }
      },
      (err) => setLocationError(err.message),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Use GPS as start — called from dropdown
  const handleUseCurrentLocationAsStart = () => {
    if (!currentLocation) return;
    setStartPoint(currentLocation);
    setStartText("My current location");
    setWaitingForStart(false);
  };

  // Start picked from search suggestion
  const handleStartSelect = (loc) => {
    setStartPoint(loc);
    setStartText(loc.name);
    setWaitingForStart(false);
    setFlyTarget(loc);
  };

  // Destination picked from search suggestion
  const handleDestSelect = (loc) => {
    setDestPoint(loc);
    setDestText(loc.name);
    setFlyTarget(loc);
  };

  // Map click — sets start or destination depending on active pin mode
  const handleMapClick = useCallback(async (latlng) => {
    const name = await reverseGeocode(latlng.lat, latlng.lng);
    const loc  = { lat: latlng.lat, lng: latlng.lng, name };
    if (waitingForStart) {
      setStartPoint(loc); setStartText(name); setWaitingForStart(false);
    } else {
      // Default tap always sets destination
      setDestPoint(loc); setDestText(name);
    }
  }, [waitingForStart]);

  // Dragging the blue dot updates current location
  // If FROM was "My current location", it updates to match the dragged position
  const handleLocationDragEnd = useCallback(async (e) => {
    const { lat, lng } = e.target.getLatLng();
    const name = await reverseGeocode(lat, lng);
    setCurrentLocation({ lat, lng });
    if (startText === "My current location") {
      setStartPoint({ lat, lng, name });
      setStartText(name);
    }
  }, [startText]);

  // Show on Map — geocodes any typed text that wasn't picked from suggestions
  const handleShowOnMap = async () => {
    setIsResolving(true);
    let resolvedStart = startPoint;
    let resolvedDest  = destPoint;

    if (!resolvedStart && startText.trim().length > 0) {
      const results = await geocode(startText);
      if (results.length > 0) {
        resolvedStart = results[0];
        setStartPoint(results[0]);
        setStartText(results[0].name);
      }
    }

    if (!resolvedDest && destText.trim().length > 0) {
      const results = await geocode(destText);
      if (results.length > 0) {
        resolvedDest = results[0];
        setDestPoint(results[0]);
        setDestText(results[0].name);
      }
    }

    setIsResolving(false);

    if (resolvedStart && resolvedDest) {
      setMarkersVisible(true);
      setFlyTarget(resolvedStart);
    }
  };

  // Reset — restore current location to FROM if available
  const handleReset = () => {
    setDestPoint(null); setDestText("");
    setFlyTarget(null); setMarkersVisible(false);
    setWaitingForStart(false);
    if (currentLocation) {
      setStartPoint(currentLocation);
      setStartText("My current location");
    } else {
      setStartPoint(null); setStartText("");
    }
  };

  // Show on Map button enabled when either field has text or a resolved point
  const canShow = (startPoint || startText.trim().length > 0) && (destPoint || destText.trim().length > 0);

  // Status message
  const statusClass = locationError ? "error" : markersVisible ? "ready" : "idle";
  const statusMsg = locationError
    ? `⚠️ ${locationError}`
    : markersVisible
    ? "✓ Route points shown on map"
    : canShow
    ? "✓ Ready — tap \"Show on Map\""
    : startText && !destText
    ? "Now set your destination"
    : !startText && destText
    ? "Now set your start point"
    : "Tap the map or search to set locations";

  return (
    <div className={`ug-root${darkMode ? " dark" : ""}`}>

      {/* ── Top panel ─────────────────────────────────────────────────────── */}
      <div className="ug-panel">

        {/* Header */}
        <div className="ug-header">
          <div className="ug-header-left">
            <div className="ug-logo">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" fill="white"/>
              </svg>
            </div>
            <div>
              <p className="ug-title">TransitGuide</p>
              <p className="ug-subtitle">
                Accessibility-first navigation
                {accuracy && (
                  <span className={accuracy < 20 ? "ug-accuracy-good" : accuracy < 50 ? "ug-accuracy-ok" : "ug-accuracy-poor"}>
                    · GPS ±{accuracy}m
                  </span>
                )}
              </p>
            </div>
          </div>
          <button className="ug-mode-btn" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>

        {/* FROM input */}
        <SearchBox
          placeholder="From — your start location"
          value={startText}
          onChange={setStartText}
          onSelect={handleStartSelect}
          onUseCurrentLocation={handleUseCurrentLocationAsStart}
          showCurrentLocationOption={!!currentLocation}
          accentColor="#2563eb"
        />

        {/* Connector + swap */}
        <div className="ug-connector">
          <div className="ug-connector-dots">
            {[0,1,2].map(i => <div key={i} className="ug-connector-dot" />)}
          </div>
          <div className="ug-connector-line" />
          <button
            className="ug-swap-btn"
            onClick={() => {
              const sp = startPoint, dp = destPoint, st = startText, dt = destText;
              setStartPoint(dp); setDestPoint(sp);
              setStartText(dt); setDestText(st);
            }}
          >⇅ Swap</button>
          <div className="ug-connector-line" />
        </div>

        {/* TO input */}
        <SearchBox
          placeholder="To — search or tap map"
          value={destText}
          onChange={setDestText}
          onSelect={handleDestSelect}
          onUseCurrentLocation={() => {}}
          showCurrentLocationOption={false}
          accentColor="#22c55e"
        />

        {/* Action buttons */}
        <div className="ug-action-row">
          <button
            className={`ug-show-btn ${canShow ? "ready" : "disabled"}`}
            onClick={handleShowOnMap}
            disabled={!canShow || isResolving}
          >
            {isResolving
              ? <><div className="ug-spinner" />Resolving...</>
              : markersVisible ? "Update Map" : "Show on Map"
            }
          </button>

          {(startPoint || destPoint) && (
            <button className="ug-reset-btn" onClick={handleReset}>✕ Reset</button>
          )}
        </div>

        {/* Status */}
        <p className={`ug-status ${statusClass}`}>{statusMsg}</p>
      </div>

      {/* ── Map ───────────────────────────────────────────────────────────── */}
      <div className="ug-map-wrap">
        <MapContainer
          center={[5.6502, -0.1962]}   // center of UG Legon campus
          zoom={15}
          maxBounds={UG_MAX_BOUNDS}     // soft outer pan boundary
          maxBoundsViscosity={0.7}      // slight resistance at edges
          minZoom={13}
          maxZoom={19}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayerSwitcher darkMode={darkMode} />
          <SmoothFly target={flyTarget} />
          <InitialFly location={currentLocation} />
          <MapClickHandler onMapClick={handleMapClick} />

          {/* Pulsing dot — draggable so user can correct GPS if needed */}
          {currentLocation && (
            <>
              <Marker
                position={[currentLocation.lat, currentLocation.lng]}
                icon={currentLocationIcon}
                draggable={true}
                zIndexOffset={1000}
                eventHandlers={{ dragend: handleLocationDragEnd }}
              />
              <Circle
                center={[currentLocation.lat, currentLocation.lng]}
                radius={accuracy || 30}
                pathOptions={{ color: "#2563eb", fillColor: "#2563eb", fillOpacity: 0.1, weight: 1.5 }}
              />
            </>
          )}

          {/* Start marker — only shown after Show on Map */}
          {markersVisible && startPoint && (
            <Marker position={[startPoint.lat, startPoint.lng]} icon={makePin("#2563eb", "START")} />
          )}

          {/* Destination marker — only shown after Show on Map */}
          {markersVisible && destPoint && (
            <Marker position={[destPoint.lat, destPoint.lng]} icon={makePin("#22c55e", "DEST")} />
          )}
        </MapContainer>

        {/* Recenter button */}
        <button
          className="ug-recenter-btn"
          onClick={() => { if (currentLocation) setFlyTarget({ ...currentLocation, _t: Date.now() }); }}
          title="Go to my location"
        >🎯</button>

        {/* Legend card */}
        {markersVisible && (startPoint || destPoint) && (
          <div className="ug-legend">
            {startPoint && (
              <div className="ug-legend-row">
                <div className="ug-legend-dot" style={{ background: "#2563eb", boxShadow: "0 0 6px #2563eb" }} />
                <span className="ug-legend-label">FROM</span>
                <span className="ug-legend-value">{startText}</span>
              </div>
            )}
            {destPoint && (
              <div className="ug-legend-row">
                <div className="ug-legend-dot" style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                <span className="ug-legend-label">TO</span>
                <span className="ug-legend-value">{destText}</span>
              </div>
            )}
          </div>
        )}

        {/* Tap hint banner */}
        {waitingForStart && (
          <div className="ug-tap-hint" style={{ background: "#2563eb" }}>
            📍 Tap to set start point
          </div>
        )}
      </div>
    </div>
  );
}