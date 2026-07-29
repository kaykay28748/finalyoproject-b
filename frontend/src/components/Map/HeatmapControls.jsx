// frontend/src/components/Map/HeatmapControls.jsx
import { useState, useEffect } from "react";
import { useHaptics } from "../../hooks/useHaptics";
import { fetchHeatmapData } from "../../services/heatmapAnalytics";
import "./HeatmapControls.css";

const TIME_SLOTS = [
  { label: "All day", hour: undefined },
  { label: "Morning", hour: 8 },
  { label: "Midday", hour: 12 },
  { label: "Afternoon", hour: 16 },
  { label: "Evening", hour: 19 },
  { label: "Night", hour: 22 },
];

export default function HeatmapControls({ visible, onToggle, mapBounds, selectedHour, onSelectedHourChange }) {
  const { trigger } = useHaptics();
  const [isLoading, setIsLoading] = useState(false);
  const [pointCount, setPointCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState(null);

  const refreshStats = async () => {
    if (!visible || !mapBounds) return;
    
    setIsLoading(true);
    try {
      const points = await fetchHeatmapData(mapBounds, { hour: selectedHour });
      setPointCount(points.length);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("[HeatmapControls] Fetch failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (visible && mapBounds) {
      refreshStats();
    }
  }, [visible, mapBounds, selectedHour]);

  if (!visible) return null;

  const stopPropagation = (e) => {
    e.stopPropagation();
  };

  return (
    <div 
      className="heatmap-controls"
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onClick={stopPropagation}
    >
      <div className="heatmap-header">
        <span className="heatmap-title">
          🔥 Congestion
          {isLoading && <span className="heatmap-spinner" />}
        </span>
        <button 
          className="heatmap-close" 
          onClick={(e) => {
            e.stopPropagation();
            trigger(10);
            onToggle();
          }}
          onMouseDown={stopPropagation}
          onTouchStart={stopPropagation}
          aria-label="Hide heatmap"
        >
          ✕
        </button>
      </div>

      <div className="heatmap-time-pills">
        {TIME_SLOTS.map((slot) => (
          <button
            key={slot.label}
            className={`heatmap-pill ${selectedHour === slot.hour ? "heatmap-pill--active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              trigger(8);
              onSelectedHourChange(slot.hour);
            }}
            onMouseDown={stopPropagation}
            onTouchStart={stopPropagation}
          >
            {slot.label}
          </button>
        ))}
      </div>

      <div className="heatmap-stats">
        {pointCount > 0 ? (
          <span>{pointCount.toLocaleString()} data point{pointCount !== 1 ? 's' : ''}</span>
        ) : (
          <span className="heatmap-empty">No data yet — routes you calculate will appear here</span>
        )}
        {lastRefresh && (
          <span className="heatmap-refresh-time">
            Updated {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      <div className="heatmap-legend">
        <span className="heatmap-legend-label">Low</span>
        <div className="heatmap-legend-bar" />
        <span className="heatmap-legend-label">High</span>
      </div>
    </div>
  );
}