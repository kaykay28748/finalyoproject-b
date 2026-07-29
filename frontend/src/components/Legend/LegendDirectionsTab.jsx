import { useState } from "react";
import { IconSpeakerWave, IconShare } from "../ui/icon";
import { useHaptics } from "../../hooks/useHaptics";
import { formatDistance } from "./hooks/useRouteMetrics";

const ArrowMap = {
  straight: "\u2191", "slight-right": "\u2197", "turn-right": "\u2192",
  "sharp-right": "\u2198", "slight-left": "\u2196", "turn-left": "\u2190",
  "sharp-left": "\u2199", destination: "\uD83D\uDCCD", start: "\uD83D\uDE97",
};

function DirectionStep({ step, idx, isActive, isLast }) {
  const arrow = ArrowMap[step.maneuver] || "\u2022";

  return (
    <div
      data-step-index={idx}
      className={`legend-direction-step ${isActive ? "legend-direction-step--active" : ""} ${isLast ? "legend-direction-step--destination" : ""}`}
      aria-current={isActive ? "step" : undefined}
    >
      <div className="direction-icon">
        <span style={{ fontSize: "15px", fontWeight: 500 }}>{arrow}</span>
      </div>
      <div className="direction-content">
        <div className="direction-instruction">
          {step.instruction}
          {step.isDestination && <span className="direction-destination-badge"> Destination</span>}
        </div>
        {!step.isDestination && step.distance > 0 && (
          <div className="direction-distance">{formatDistance(step.distance)}</div>
        )}
      </div>
      {isActive && <div className="direction-active-indicator" />}
    </div>
  );
}

export default function LegendDirectionsTab({
  directions,
  currentStepIndex,
  completedDistance,
  isVoiceEnabled,
  onVoiceToggle,
  alternatives,
  activeAlternativeIndex,
  onSelectAlternative,
  currentLocation,
  hasWarnings,
  warnings,
  isFallback,
  estimatedTime,
}) {
  const { trigger } = useHaptics();
  const [toast, setToast] = useState(null);

  const handleShare = async () => {
    trigger(10);
    if (!currentLocation) {
      setToast("Location not available yet. Please wait for GPS fix.");
      setTimeout(() => setToast(null), 3000);
      return;
    }
    const baseUrl = import.meta.env.PROD
      ? "https://ugnavigator.onrender.com"
      : window.location.origin;
    const link = `${baseUrl}?lat=${currentLocation.lat}&lng=${currentLocation.lng}&name=Shared%20Location`;
    try {
      await navigator.clipboard.writeText(link);
      setToast("Location link copied!");
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast("Could not copy link.");
      setTimeout(() => setToast(null), 3000);
    }
  };

  return (
    <div className="legend-tab-content directions-tab">
      <div className="legend-voice-row">
        <button
          className={`legend-voice-btn ${isVoiceEnabled ? "legend-voice-btn--active" : ""}`}
          onClick={() => { trigger(10); onVoiceToggle?.(); }}
          title={isVoiceEnabled ? "Disable voice guidance" : "Enable voice guidance"}
          aria-pressed={isVoiceEnabled}
        >
          <IconSpeakerWave className="w-3.5 h-3.5" color={isVoiceEnabled ? "#3b82f6" : "#9ca3af"} />
          <span>{isVoiceEnabled ? "Voice guidance ON" : "Voice guidance OFF"}</span>
        </button>
      </div>

      {directions.length > 0 ? (
        <div className="legend-directions-section" role="list" aria-label="Turn-by-turn directions">
          <div className="legend-directions-header">
            <span className="directions-title">Directions</span>
            <span className="directions-steps-count">{directions.length - 1} turns</span>
          </div>
          <div className="legend-directions-list">
            {directions.map((step, idx) => (
              <DirectionStep
                key={idx}
                step={step}
                idx={idx}
                isActive={currentStepIndex === idx}
                isLast={step.isDestination}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="legend-empty-state">No directions available</div>
      )}

      {alternatives.length > 0 && (
        <>
          <div className="legend-divider" />
          <p className="legend-alts-label">Alternative routes</p>
          <div className="legend-alts">
            {[null, ...alternatives].map((alt, i) => (
              <div
                key={i}
                className={`legend-alt ${activeAlternativeIndex === i ? "legend-alt--active" : ""}`}
                onClick={() => { trigger(10); onSelectAlternative?.(i); }}
                role="button"
                tabIndex={0}
                aria-pressed={activeAlternativeIndex === i}
              >
                <span className={`alt-line ${i === 0 ? "alt-line--primary" : "alt-line--secondary"}`} />
                <div className="alt-info">
                  <span className="alt-name">{i === 0 ? "Recommended" : `Alternative ${i}`}</span>
                  <span className="alt-time">
                    {i === 0 ? estimatedTime : formatDistance(alt.totalDistance)}
                  </span>
                </div>
                <span className="alt-dist">{i === 0 ? "" : formatDistance(alt.totalDistance)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <button className="legend-share-btn" onClick={handleShare}>
        <IconShare className="w-3.5 h-3.5" color="#3b82f6" />
        <span>Share my location</span>
      </button>

      {toast && <div className="legend-toast" role="status" aria-live="polite">{toast}</div>}

      {isFallback && (
        <div className="legend-fallback-note">
          Direct connection used — small gap in road data
        </div>
      )}

      {hasWarnings && (
        <div className="legend-warnings">
          {warnings.map((w, i) => (
            <div key={i} className={`legend-warning legend-warning--${w.type || "info"}`}>
              <span className="warning-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {w.type === "danger" ? (
                    <path d="M12 9v4M12 17h.01M10.29 3.86l-8.4 14.6a2 2 0 001.7 2.94h16.82a2 2 0 001.7-2.94l-8.4-14.6a2 2 0 00-3.42 0z" />
                  ) : (
                    <circle cx="12" cy="12" r="10" />
                  )}
                </svg>
              </span>
              <span className="warning-text">{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
