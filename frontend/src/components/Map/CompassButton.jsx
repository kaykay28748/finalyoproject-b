// components/Map/CompassButton.jsx
import { useState, useEffect, useRef } from "react";
import "./CompassButton.css";

export default function CompassButton({
  heading,
  mapBearing = 0,
  isHeadingUp,
  onToggle,
  permissionState,
  onRequestPermission,
}) {
  const [showPrompt, setShowPrompt] = useState(false);
  const timeoutRef = useRef(null);

  // Show permission prompt once when heading is unsupported and user hasn't denied
  useEffect(() => {
    if (permissionState === "unsupported" && !showPrompt) {
      timeoutRef.current = setTimeout(() => setShowPrompt(true), 2000);
      return () => clearTimeout(timeoutRef.current);
    }
  }, [permissionState, showPrompt]);

  const handleClick = async () => {
    if (permissionState === "unsupported" || permissionState === "denied") {
      const granted = await onRequestPermission();
      if (granted) {
        onToggle();
        setShowPrompt(false);
      } else {
        // Even without device heading, allow manual toggle for route bearing
        onToggle();
      }
    } else {
      onToggle();
    }
  };

  // Compass needle rotation: show actual map bearing (manual rotation, heading-up, etc.)
  // Negative because the needle points to north relative to the rotated map
  const isRotated = Math.abs(mapBearing) > 0.5;
  const needleRotation = -mapBearing;

  return (
    <div className="compass-container">
      {showPrompt && permissionState === "unsupported" && (
        <div className="compass-prompt">
          <span>Enable compass for heading-up mode?</span>
          <div className="compass-prompt-actions">
            <button
              className="compass-prompt-btn compass-prompt-btn--yes"
              onClick={async () => {
                const granted = await onRequestPermission();
                setShowPrompt(false);
                if (granted) onToggle();
              }}
            >
              Enable
            </button>
            <button
              className="compass-prompt-btn"
              onClick={() => setShowPrompt(false)}
            >
              Later
            </button>
          </div>
        </div>
      )}

      <button
        className={`compass-btn ${isHeadingUp ? "compass-btn--active" : ""} ${isRotated ? "compass-btn--rotated" : ""}`}
        onClick={handleClick}
        aria-label={isHeadingUp ? "Switch to north up" : "Switch to heading up"}
        title={isHeadingUp ? "North up" : "Heading up"}
      >
        <div
          className="compass-needle-wrap"
          style={{
            transform: `rotate(${needleRotation}deg)`,
            transition: isHeadingUp ? "none" : "transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)",
          }}
        >
          {/* North (red) */}
          <div className="compass-needle compass-needle--north" />
          {/* South (white) */}
          <div className="compass-needle compass-needle--south" />
          {/* Center dot */}
          <div className="compass-center" />
        </div>
      </button>
    </div>
  );
}
