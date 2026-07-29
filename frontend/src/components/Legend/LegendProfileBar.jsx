import { PROFILES } from "./constants";
import { useHaptics } from "../../hooks/useHaptics";

export default function LegendProfileBar({ activeProfile, onProfileChange }) {
  const { trigger } = useHaptics();

  return (
    <div className="legend-profiles-bar-inline" role="toolbar" aria-label="Route profiles">
      {PROFILES.map((p) => {
        const IconComponent = p.icon;
        const isActive = activeProfile === p.key;
        return (
          <button
            key={p.key}
            data-profile={p.key}
            className={`legend-profile-btn ${isActive ? "legend-profile-btn--active" : ""}`}
            onClick={() => { trigger(10); onProfileChange?.(p.key); }}
            title={p.label}
            aria-label={`Switch to ${p.label} profile`}
            aria-pressed={isActive}
          >
            <span className="legend-profile-icon">
              <IconComponent className="w-4 h-4" color={isActive ? p.color : "currentColor"} />
            </span>
            <span className="legend-profile-label">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
