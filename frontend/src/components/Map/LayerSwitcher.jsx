import { useState, useRef, useEffect, useCallback } from "react";
import { useHaptics } from "../../hooks/useHaptics";
import "./LayerSwitcher.css";

const LAYERS = [
  { id: "standard", label: "Standard", icon: "M3 3h18v18H3z" },
  { id: "dark", label: "Dark", icon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" },
  { id: "cycle", label: "Cycle", icon: "M5 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM14 8l-2 6m0 0l-3 6m3-6h5m-5 0H8" },
  { id: "transport", label: "Transit", icon: "M3 7h18M3 17h18M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" },
  { id: "humanitarian", label: "Humanitarian", icon: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" },
];

export default function LayerSwitcher({ mapLayer, onMapLayerChange }) {
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

  const current = LAYERS.find((l) => l.id === mapLayer) || LAYERS[0];

  return (
    <div className="layer-switcher" ref={ref}>
      <button
        className="layer-switcher-btn"
        onClick={() => { trigger(8); setOpen((o) => !o); }}
        aria-label="Switch map layer"
        title={current.label}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d={current.icon} />
        </svg>
      </button>

      {open && (
        <div className="layer-switcher-popover">
          {LAYERS.map((layer) => (
            <button
              key={layer.id}
              className={`layer-switcher-option${layer.id === mapLayer ? " layer-switcher-option--active" : ""}`}
              onClick={() => { trigger(8); onMapLayerChange(layer.id); setOpen(false); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={layer.icon} />
              </svg>
              <span>{layer.label}</span>
              {layer.id === mapLayer && (
                <svg className="layer-switcher-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
