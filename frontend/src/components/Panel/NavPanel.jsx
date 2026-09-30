// components/Panel/NavPanel.jsx
import { useState, useCallback } from "react";
import { useAuthContext } from "../../context/AuthContext";
import { useFocus } from "../../context/FocusContext";
import { useHaptics } from "../../hooks/useHaptics";
import PortalSearchBox from "../Search/PortalSearchBox";
import VoiceSearchModal from "../Search/VoiceSearchModal";
import { useNavigate } from "react-router-dom";
import logo from "./icon-192.png";
import {
  IconSwap,
  IconDirections,
  IconMic,
} from "../ui/icon";
import "./NavPanel.css";

// Integrated Avatar component (Google Maps style)
function Avatar({ username, size = 36, onClick, accuracy }) {
  const { trigger } = useHaptics();
  const seed = username || "guest";
  const avatarUrl = `https://api.navii.dev/avatar/${encodeURIComponent(seed)}?size=${size}&motion=true`;

  const getAccuracyColor = () => {
    if (!accuracy) return "transparent";
    if (accuracy < 20) return "#22c55e"; // Good
    if (accuracy < 50) return "#f59e0b"; // OK
    return "#ef4444"; // Poor
  };

  return (
    <button
      className="nav-pill-avatar"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onTouchStart={() => trigger(10)}
      aria-label="Profile settings"
      title={`Account: ${username || "User"}${accuracy ? ` (GPS ±${accuracy}m)` : ""}`}
      style={{ 
        borderColor: getAccuracyColor(),
        zIndex: 10,
      }}
    >
      <img
        src={avatarUrl}
        alt="Profile"
      />
    </button>
  );
}

// ─── Inline SVG icons ──────────────────────────────────────────────────────

function IconFrom() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle
        cx="12"
        cy="12"
        r="7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        opacity="0.35"
      />
    </svg>
  );
}

function IconTo() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"
        fill="currentColor"
      />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function IconArrowRight() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DISCOVERY_CATEGORIES = [
  { id: "food", label: "Food", icon: "food" },
  { id: "health", label: "Health", icon: "health" },
  { id: "printing", label: "Printing", icon: "printing" },
  { id: "admin", label: "Offices", icon: "office" },
  { id: "hall", label: "Halls", icon: "hall" },
  { id: "library", label: "Library", icon: "library" },
  { id: "sport", label: "Sports", icon: "sport" },
];

function DiscoveryIcon({ name }) {
  const paths = {
    food: <><path d="M4 3v7m0-4h3m-3 4v11M16 3v18m0-18c3 3 3 7 0 9" /></>,
    health: <><path d="M12 3v18M3 12h18" /><circle cx="12" cy="12" r="9" /></>,
    printing: <><path d="M7 8V3h10v5M7 17H4V9h16v8h-3M7 14h10v7H7z" /><path d="M17 11h.01" /></>,
    office: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 9h.01M15 9h.01M9 12h.01M15 12h.01" /></>,
    hall: <><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></>,
    library: <><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2zM4 17h14M8 7h6M8 11h6" /></>,
    sport: <><circle cx="12" cy="12" r="9" /><path d="m12 3 2.5 5.5L20 12l-5.5 2.5L12 21l-2.5-6.5L4 12l5.5-3.5z" /></>,
  };

  return (
    <svg className="nav-discovery-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────

export default function NavPanel({
  startText,
  destText,
  onStartSelect,
  onDestSelect,
  onUseCurrentLocation,
  onSwap,
  onShowOnMap,
  onReset,
  hasCurrentLocation,
  canShow,
  isResolving,
  markersVisible,
  activeProfile,
  accuracy,
  locationError,
  browseCategory,
  browseListOpen,
  browsePlaces = [],
  selectedBrowsePlace,
  onBrowseCategoryChange,
  onBrowseListToggle,
  onBrowsePlaceClear,
  onBrowsePlaceSelect,
  onBrowseDirections,
  isExpanded: externalIsExpanded,
  onExpandRequest,
  onClose,
  onStartTextChange,
  onDestTextChange,
}) {
  const [internalIsExpanded, setInternalIsExpanded] = useState(false);
  const [swapRotation, setSwapRotation] = useState(0);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [voiceSearchNonce, setVoiceSearchNonce] = useState(0);
  // Senior Dev Fix: Initialize derived state BEFORE hooks that depend on it
  const isExpanded =
    externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;

  const { user } = useAuthContext();
  const focus = useFocus();
  const navigate = useNavigate();
  const { trigger } = useHaptics();

  const setIsExpanded = (value) => {
    if (onExpandRequest) {
      onExpandRequest(value);
    } else {
      setInternalIsExpanded(value);
    }
  };

  const handleSwapClick = useCallback(() => {
    trigger(10);
    setSwapRotation(prev => prev + 180);
    onSwap();
  }, [onSwap, trigger]);

  const handleDirectionsClick = () => {
    if (canShow && !isResolving) {
      trigger([15, 20, 15]);
      onShowOnMap();
      setIsExpanded(false);
    }
  };

  const handleSearchFocus = () => {
    trigger(10);
    setIsExpanded(true);
  };

  const handleResetClick = () => {
    trigger([30, 50, 30]);
    onReset();
    setIsExpanded(false);
  };

  const handleClose = () => {
    trigger(10);
    setIsExpanded(false);
    if (onClose) onClose();
  };

  const handleMicClick = () => {
    trigger(10);
    setVoiceModalOpen(true);
  };

  const handleVoiceUseText = (text) => {
    onDestTextChange(text);
    setVoiceSearchNonce((n) => n + 1);
    setIsExpanded(true);
  };

  const statusClass = locationError
    ? "error"
    : markersVisible
      ? "ready"
      : "idle";

  const statusMsg = locationError
    ? locationError
    : markersVisible
      ? "Route ready"
      : canShow
        ? "Ready — tap Directions"
        : startText && !destText
          ? "Now set your destination"
          : !startText && destText
            ? "Now set your start point"
            : "Tap the map or search to set locations";

  // Senior Design: Define profile colors for visual continuity with the map route
  const profileColors = {
    standard: "#2563eb",   // Navigation Blue
    accessible: "#8b5cf6", // Accessibility Purple
    night: "#f59e0b",      // Safety Amber
    fastest: "#22c55e",    // Speed Green
  };

  const activeColor = profileColors[activeProfile] || profileColors.standard;

  // ─── Expanded / collapsed view ───────────────────────────────────────────
  return (
    <>
      {isExpanded && (
        <div
          className="nav-backdrop"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      <div
        className={`nav-panel ${isExpanded ? "nav-panel--expanded" : "nav-panel--pill"}${markersVisible ? " nav-panel--with-legend" : ""}`}
      >
        {!isExpanded ? (
          markersVisible && startText && destText ? (
            /* 1. Compact Route Summary (Active Route State) */
            <div className="nav-compact-row">
              <div 
                className="nav-pill-logo-wrap nav-pill-logo-wrap--active" 
                style={{ "--profile-glow": activeColor }}
              >
                <img src={logo} alt="TransitGuide" className="nav-pill-logo" />
              </div>
              <div
                className="nav-pill-content"
                onClick={handleSearchFocus}
                role="button"
                tabIndex={0}
                aria-label={`Route from ${startText} to ${destText}. Click to edit.`}
                title={`${startText} → ${destText}`}
                onKeyDown={(e) => e.key === "Enter" && handleSearchFocus()}
              >
                <span
                  className="nav-compact-dot nav-compact-dot--from"
                  aria-hidden="true"
                />
                <span className="nav-compact-start">{startText}</span>
                <span className="nav-compact-arrow" aria-hidden="true">
                  <IconArrowRight />
                </span>
                <span
                  className="nav-compact-dot nav-compact-dot--to"
                  aria-hidden="true"
                />
                <span className="nav-compact-dest">{destText}</span>
              </div>
              <button
                className="nav-glass-btn nav-compact-swap"
                onClick={handleSwapClick}
                title="Swap"
                aria-label="Swap start and destination"
                style={{ transform: `rotate(${swapRotation}deg)` }}
              >
                <IconSwap className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            /* 2. Standard Search Pill (Idle State) */
            <div className="nav-pill-row">
              <button
                className="nav-where-to-pill"
                onClick={() => setIsExpanded(true)}
                aria-label="Search for destination"
              >
                <div 
                  className="nav-pill-logo-wrap nav-pill-logo-wrap--active"
                  style={{ "--profile-glow": activeColor }}
                >
                  <img src={logo} alt="TransitGuide" className="nav-pill-logo" />
                </div>
                <span className="nav-search-text-hint">Search here...</span>
              </button>
              <button
                className="nav-mic-btn"
                onClick={handleMicClick}
                aria-label="Voice search destination"
                title="Search by voice"
              >
                <IconMic strokeWidth={2} />
              </button>
              <Avatar
                username={user?.username}
                size={32}
                onClick={() => navigate("/profile")}
                accuracy={accuracy}
              />
            </div>
          )
        ) : (
          /* 3. Expanded Header (Editing State) */
          <div className="nav-header">
            <button 
              className="nav-back-btn" 
              onClick={handleClose}
              aria-label="Back to map"
            >
              <IconBack />
            </button>
            <span className="nav-title">Plan Route</span>
            <Avatar 
              username={user?.username}
              size={32}
              onClick={() => navigate("/profile")}
              accuracy={accuracy}
            />
          </div>
        )}

        {isExpanded && (
          <div className="nav-expanded-content">
            <div className="nav-input-section">
              <div className="nav-input-label">
                <span className="nav-input-icon from-icon" aria-hidden="true">
                  <IconFrom />
                </span>
                <span className="nav-input-label-text from-label">From</span>
              </div>
              <PortalSearchBox
                placeholder="Your location"
                value={startText}
                onChange={onStartTextChange}
                onSelect={(location) => {
                  focus.setFocus(
                    "location",
                    location.name || location.lat.toFixed(4),
                    "search",
                  );
                  onStartSelect(location);
                }}
                onUseCurrentLocation={onUseCurrentLocation}
                showCurrentLocationOption={hasCurrentLocation}
                accentColor="#2563eb"
                onFocus={handleSearchFocus}
              />
            </div>

            <div className="nav-input-section">
              <div className="nav-input-label">
                <span className="nav-input-icon to-icon" aria-hidden="true">
                  <IconTo />
                </span>
                <span className="nav-input-label-text to-label">To</span>
              </div>
              <PortalSearchBox
                placeholder="Where to?"
                value={destText}
                onChange={onDestTextChange}
                onSelect={(location) => {
                  focus.setFocus(
                    "location",
                    location.name || location.lat.toFixed(4),
                    "search",
                  );
                  onDestSelect(location);
                }}
                onUseCurrentLocation={() => {}}
                showCurrentLocationOption={false}
                accentColor="#22c55e"
                onFocus={handleSearchFocus}
                searchNonce={voiceSearchNonce}
              />
              <button
                className="nav-mic-btn nav-mic-btn--to"
                onClick={handleMicClick}
                aria-label="Speak the destination"
                title="Speak the destination"
              >
                <IconMic strokeWidth={2} />
              </button>
            </div>

            <div className="nav-action-row">
              <button
                className="nav-reset-btn"
                onClick={handleResetClick}
                aria-label="Reset current route and search"
                title="Clear your current search and route"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 12a9 9 0 109-9 9 9 0 00-6.16 2.42L3 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M3 3v5h5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Reset
              </button>

              <button
                className={`nav-directions-btn ${canShow ? "ready" : "disabled"}`}
                onClick={handleDirectionsClick}
                disabled={!canShow || isResolving}
                aria-label={canShow ? "Get directions to destination" : "Enter start and destination to get directions"}
                title={canShow ? "Calculate and show the best route" : "Complete your search to see directions"}
              >
                {isResolving ? (
                  <>
                    <div className="nav-spinner" aria-hidden="true" />
                    Finding…
                  </>
                ) : (
                  <>
                    <IconDirections className="w-4 h-4" aria-hidden="true" />
                    Directions
                  </>
                )}
              </button>
            </div>

            <p className={`nav-status ${statusClass}`}>
              {statusClass === "error" && (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  style={{
                    display: "inline",
                    marginRight: 4,
                    verticalAlign: "middle",
                  }}
                >
                  <path
                    d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {statusClass === "ready" && (
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  style={{
                    display: "inline",
                    marginRight: 4,
                    verticalAlign: "middle",
                  }}
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
              {statusMsg}
            </p>
          </div>
        )}
      </div>

      {!isExpanded && (
        <div className={`nav-discovery-shell${markersVisible ? " nav-discovery-shell--with-legend" : ""}`}>
          <span className="nav-discovery-label">Explore campus</span>
          <div className="nav-discovery-categories" role="group" aria-label="Explore campus places">
            {DISCOVERY_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`nav-discovery-chip${browseCategory === category.id ? " nav-discovery-chip--active" : ""}`}
                aria-pressed={browseCategory === category.id}
                onClick={() => onBrowseCategoryChange(category.id)}
              >
                <DiscoveryIcon name={category.icon} />
                {category.label}
                {browseCategory === category.id && browsePlaces.length > 0 && (
                  <span className="nav-discovery-count">{browsePlaces.length}</span>
                )}
              </button>
            ))}
          </div>

          {browseCategory && (
            <div className="nav-discovery-summary">
              <span>{browsePlaces.length} {DISCOVERY_CATEGORIES.find((category) => category.id === browseCategory)?.label.toLowerCase()} places on map</span>
              <button
                className={`nav-discovery-list-toggle${browseListOpen ? " nav-discovery-list-toggle--active" : ""}`}
                type="button"
                onClick={onBrowseListToggle}
                aria-expanded={browseListOpen}
                aria-controls="nav-discovery-tray"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
                </svg>
                <span>List</span>
              </button>
            </div>
          )}

          {selectedBrowsePlace && !browseListOpen && (
            <div className="nav-discovery-selection">
              <button
                className="nav-discovery-selection-place"
                type="button"
                onClick={() => onBrowsePlaceSelect(selectedBrowsePlace)}
                aria-label={`Focus ${selectedBrowsePlace.name} on map`}
              >
                <span className="nav-discovery-selection-name">{selectedBrowsePlace.name}</span>
                <span className="nav-discovery-place-distance">
                  {selectedBrowsePlace.distance.toFixed(1)} km {selectedBrowsePlace.distanceReference}
                </span>
              </button>
              <button
                className="nav-discovery-directions"
                type="button"
                onClick={() => onBrowseDirections(selectedBrowsePlace)}
                aria-label={`Directions to ${selectedBrowsePlace.name}`}
                title={`Directions to ${selectedBrowsePlace.name}`}
              >
                <IconDirections className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                className="nav-discovery-close"
                type="button"
                onClick={onBrowsePlaceClear}
                aria-label="Clear selected place"
                title="Clear selected place"
              >×</button>
            </div>
          )}

        </div>
      )}

      {browseCategory && browseListOpen && (
        <section id="nav-discovery-tray" className="nav-discovery-tray" aria-label={`${DISCOVERY_CATEGORIES.find((category) => category.id === browseCategory)?.label || "Campus"} places`}>
          <div className="nav-discovery-tray-header">
            <div className="nav-discovery-tray-title">
              <strong>{DISCOVERY_CATEGORIES.find((category) => category.id === browseCategory)?.label || "Places"}</strong>
              <span>{browsePlaces.length} places</span>
            </div>
            <button
              className="nav-discovery-close"
              type="button"
              onClick={onBrowseListToggle}
              aria-label="Close place list"
              title="Close list"
            >
              ×
            </button>
          </div>

          {browsePlaces.length ? (
            <div className="nav-discovery-list">
              {browsePlaces.map((place, index) => (
                <div className="nav-discovery-row" key={`${place.name}-${place.lat}-${place.lng}`}>
                  <button
                    type="button"
                    className={`nav-discovery-place${selectedBrowsePlace?.name === place.name ? " nav-discovery-place--selected" : ""}`}
                    onClick={() => onBrowsePlaceSelect(place)}
                    aria-pressed={selectedBrowsePlace?.name === place.name}
                  >
                    <span className="nav-discovery-index">{index + 1}</span>
                    <span className="nav-discovery-place-copy">
                      <span className="nav-discovery-place-name">{place.name}</span>
                      <span className="nav-discovery-place-distance">
                        {place.distance.toFixed(1)} km {place.distanceReference}
                      </span>
                    </span>
                  </button>
                  <button
                    className="nav-discovery-directions"
                    type="button"
                    onClick={() => onBrowseDirections(place)}
                    aria-label={`Directions to ${place.name}`}
                    title={`Directions to ${place.name}`}
                  >
                    <IconDirections className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="nav-discovery-empty">No mapped places in this category yet.</p>
          )}
        </section>
      )}

      <VoiceSearchModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onUseText={handleVoiceUseText}
        accentColor="#22c55e"
      />
    </>
  );
}