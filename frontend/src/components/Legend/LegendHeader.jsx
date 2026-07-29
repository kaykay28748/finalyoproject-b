import { MODES, PROFILE_CONFIG } from "./constants";

export default function LegendHeader({
  expanded, hasRoute, routeActive, vehicleMode,
  onVehicleModeChange, onDragStart, toggleExpanded, metrics, activeProfile,
}) {
  const config = MODES.find((m) => m.key === vehicleMode) || MODES[0];
  const VehicleIcon = config.icon;
  const profile = PROFILE_CONFIG[activeProfile];

  return (
    <div
      className="legend-drag-header"
      onMouseDown={onDragStart}
      onTouchStart={onDragStart}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded?.(); } }}
      tabIndex={0}
      role="button"
      aria-label={hasRoute ? "Route details" : "Search for a destination"}
      aria-expanded={expanded}
    >
      <div className="legend-handle-wrap">
        <div className="legend-handle" />
      </div>

      <div className="legend-peek-row">
        <VehicleIcon className="peek-icon" color={config.color} />
        {hasRoute && metrics ? (
          <>
            <span className="peek-mode-label">{config.label}</span>
            <span className="peek-time">{metrics.time}</span>
            <span className="peek-sep">·</span>
            <span className="peek-dist">{metrics.distance}</span>
            <span
              className="peek-profile-badge"
              style={{ background: profile?.color || "#2563eb" }}
              title={profile?.label || "Standard"}
            />
          </>
        ) : (
          <span className="peek-mode-label">{config.label}</span>
        )}
      </div>

      {hasRoute ? (
        <div
          className="legend-mode-strip"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          {MODES.map((m) => {
            const MIcon = m.icon;
            const isActive = vehicleMode === m.key;
            return (
              <button
                key={m.key}
                className={`legend-mode-btn ${isActive ? "legend-mode-btn--active" : ""}`}
                style={{ "--mode-color": m.color }}
                onClick={() => onVehicleModeChange?.(m.key)}
                title={m.label}
                aria-label={`Switch to ${m.label}`}
                aria-pressed={isActive}
              >
                <MIcon className="w-5 h-5" color={isActive ? m.color : "#9ca3af"} />
              </button>
            );
          })}
        </div>
      ) : (
        <div className="legend-peek-hint">
          <span>{routeActive ? "Restoring your route..." : "Search for a destination to get directions"}</span>
        </div>
      )}
    </div>
  );
}
