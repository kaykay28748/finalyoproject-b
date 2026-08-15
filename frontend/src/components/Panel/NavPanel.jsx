// components/Panel/NavPanel.jsx
import { useState, useEffect, useCallback } from "react";
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
        className={`nav-panel ${isExpanded ? "nav-panel--expanded" : "nav-panel--pill"}`}
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
                className="nav-mic-btn nav-mic-btn--compact"
                onClick={handleMicClick}
                aria-label="Voice search a new destination"
                title="Search a new destination by voice"
              >
                <IconMic strokeWidth={2} />
              </button>
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

      <VoiceSearchModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onUseText={handleVoiceUseText}
        accentColor="#22c55e"
      />
    </>
  );
}