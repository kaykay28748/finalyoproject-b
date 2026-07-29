import { useState, useRef, useEffect } from "react";
import { useHaptics } from "../../hooks/useHaptics";
import "./HeatmapControls.css";

const TIME_SLOTS = [
  { label: "All day", hour: undefined },
  { label: "Morning", hour: 8 },
  { label: "Afternoon", hour: 14 },
  { label: "Evening", hour: 19 },
];

export default function HeatmapControls({ visible, onToggle, selectedHour, onSelectedHourChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { trigger } = useHaptics();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const current = TIME_SLOTS.find((s) => s.hour === selectedHour) || TIME_SLOTS[0];

  if (!visible) return null;

  return (
    <div className="heatmap-switcher" ref={ref}>
      <button
        className="heatmap-switcher-btn heatmap-switcher-btn--active"
        onClick={() => { trigger(8); setOpen((o) => !o); }}
        aria-label="Heatmap time filter"
        title={current.label}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <path d="M12 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
        </svg>
      </button>

      {open && (
        <div className="heatmap-switcher-popover">
          {TIME_SLOTS.map((slot) => (
            <button
              key={slot.label}
              className={`heatmap-switcher-option${selectedHour === slot.hour ? " heatmap-switcher-option--active" : ""}`}
              onClick={() => { trigger(8); onSelectedHourChange(slot.hour); setOpen(false); }}
            >
              <span>{slot.label}</span>
              {selectedHour === slot.hour && (
                <svg className="heatmap-switcher-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
