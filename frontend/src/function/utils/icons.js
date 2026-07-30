import L from "leaflet";

// Heroicons SVG paths - modern, clean icon set
const heroiconPaths = {
  flag: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3a1 1 0 011-1h12a1 1 0 011 1v13h2V3a3 3 0 00-3-3H4a3 3 0 00-3 3v13h2V3z"/><path d="M3 16h14v5a1 1 0 11-2 0v-3H5v3a1 1 0 11-2 0v-5z"/></svg>',
  mapPin: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M11.54 22.351l.07.04.028.016a.75.75 0 00.723 0l.028-.015.071-.041a60.856 60.856 0 002.6-1.951c2.165-1.73 4.583-4.032 6.332-6.51C21.75 11.561 24 8.531 24 5.75 24 2.468 21.53 0 18.75 0c-1.362 0-2.716.254-3.972.744C12.987.644 12.528.624 12 .624c-.528 0-.987.02-1.778.12B8.22.744A5.975 5.975 0 00 5.25 0C2.47 0 0 2.468 0 5.75c0 2.78 2.25 5.81 3.955 7.793 1.75 2.478 4.168 4.78 6.332 6.51.886.705 1.754 1.393 2.6 1.952.181.127.389.196.598.196s.417-.069.598-.196.898-.517 1.754-1.393 4.168-4.032 6.332-6.51Z"/></svg>',
  checkCircle: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.061l2.25 3.25a.75.75 0 001.19-.102l3.75-5.25z"/></svg>',
  share: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M15 13.5H5.5c-1.1 0-2 .9-2 2v5.5c0 1.1.9 2 2 2h13c1.1 0 2-.9 2-2V15.5c0-1.1-.9-2-2-2zm0 7H5.5v-5.5h13v5.5zM19.5 7h-4.5V2.5H8.5V7H4L12 15l8-8z"/></svg>'
};

// Creates a modern Heroicon marker with label and custom color
export const makeHeroPin = (color, icon, label) =>
  L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.2));">
        <div style="background:${color};color:#fff;font-size:11px;font-weight:700;
          font-family:'Outfit',sans-serif;padding:4px 8px;border-radius:6px;
          margin-bottom:2px;white-space:nowrap;letter-spacing:0.5px;">
          ${label}
        </div>
        <div style="background:${color};border:3px solid #fff;border-radius:50% 50% 50% 0;
          width:32px;height:32px;display:flex;align-items:center;justify-content:center;
          transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.15);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" style="transform:rotate(45deg);filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));">
            ${icon}
          </svg>
        </div>
      </div>`,
    iconSize: [48, 56],
    iconAnchor: [24, 56],
    popupAnchor: [0, -56],
  });

// Pulsing blue dot with Heroicons map-pin
export const currentLocationIcon = L.divIcon({
  className: "",
  html: `
    <div style="display:flex;align-items:center;justify-content:center;animation:pulse 2s infinite;">
      <div style="position:absolute;width:24px;height:24px;border-radius:50%;background:#2563eb;opacity:0.3;animation:expand 2s infinite;"></div>
      <div style="width:16px;height:16px;background:#2563eb;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(37,99,235,0.4);"></div>
    </div>
    <style>
      @keyframes expand { 0% { width:24px;height:24px;opacity:0.3; } 100% { width:48px;height:48px;opacity:0; } }
      @keyframes pulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.1); } }
    </style>`,
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

// Modern green marker with check icon for draggable custom location
export const customLocationIcon = makeHeroPin("#22c55e", heroiconPaths.checkCircle, "");

// Modern purple marker with share icon for shared locations
export const sharedLocationIcon = makeHeroPin("#a855f7", heroiconPaths.share, "SHARED");

// Start location pin — 18px dark slate circle with white border, same size & style as GPS blue dot
export const startDotIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;background:#1e293b;border:2.5px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Modern blue START marker with flag icon (legacy)
export const startIcon = makeHeroPin("#2563eb", heroiconPaths.flag, "START");

// Modern green DEST marker with check icon (no label)
export const destIcon = makeHeroPin("#22c55e", heroiconPaths.checkCircle, "");

// ── Type-specific destination icons (Apple Maps style) ────────────────
const TYPE_SVG = {
  hall:          '<path d="M3 21h18M6 21V7a2 2 0 012-2h8a2 2 0 012 2v14M10 21v-4h4v4"/>',
  academic:      '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/><path d="M7 8l5 3 5-3"/>',
  library:       '<path d="M4 4h4a2 2 0 012 2v14a2 2 0 01-2 2H4V4zm12 0h4v18h-4a2 2 0 01-2-2V6a2 2 0 012-2z"/>',
  gate:          '<path d="M3 21V3h18v18H3z"/><path d="M9 21V9h6v12"/><path d="M3 9h18"/>',
  health:        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15v-4H6v-2h4V7h2v4h4v2h-4v4h-2z"/>',
  admin:         '<path d="M5 21h14M7 21V5a2 2 0 012 2h6a2 2 0 012 2v12"/><path d="M9 21V9h6v12"/>',
  service:       '<path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16l-6.4 5.2L8 14l-6-4.8h7.6L12 2z"/>',
  food:          '<path d="M12 2C8 2 4 5 4 9c0 2.5 1.5 4.5 3 6l1 5h8l1-5c1.5-1.5 3-3.5 3-6 0-4-4-7-8-7z"/><path d="M9 16h6"/>',
  sport:         '<path d="M18 8a3 3 0 100-6 3 3 0 000 6z"/><path d="M12 12c-2 0-4 1-5 3l-2 5h4l2-4 2 4h4l-2-5c-1-2-3-3-5-3z"/>',
  worship:       '<path d="M12 2L8 10h8L12 2z"/><path d="M5 22l7-8 7 8H5z"/>',
  research:      '<path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z"/>',
  landmark:      '<path d="M12 2L3 8v13h18V8L12 2zM8 21v-7h8v7"/>',
  road:          '<path d="M12 2v20"/><path d="M2 12h20"/><path d="M4 4l16 16"/><path d="M20 4L4 16"/>',
  commercial:    '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4H6z"/><path d="M16 10a4 4 0 01-8 0"/>',
  accommodation: '<path d="M3 7v11a2 2 0 002 2h14a2 2 0 002-2V7M3 7l9 5 9-5M3 7l9-5 9 5"/>',
  place:         '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>',
};

const TYPE_COLORS = {
  hall:          "#f59e0b",
  academic:      "#6366f1",
  library:       "#8b5cf6",
  gate:          "#64748b",
  health:        "#ef4444",
  admin:         "#1d4ed8",
  service:       "#f97316",
  food:          "#e11d48",
  sport:         "#10b981",
  worship:       "#d946ef",
  research:      "#0ea5e9",
  landmark:      "#78716c",
  road:          "#a1a1aa",
  commercial:    "#d97706",
  accommodation: "#0891b2",
  place:         "#6b7280",
};

const TYPE_LABELS = {
  hall:          "HALL",
  academic:      "ACADEMIC",
  library:       "LIBRARY",
  gate:          "GATE",
  health:        "HEALTH",
  admin:         "ADMIN",
  service:       "SERVICE",
  food:          "FOOD",
  sport:         "SPORT",
  worship:       "WORSHIP",
  research:      "RESEARCH",
  landmark:      "LANDMARK",
  road:          "ROAD",
  commercial:    "SHOP",
  accommodation: "LODGE",
  place:         "PLACE",
};

// Apple Maps-style category pin — no label, just big colored pin + white icon
export const makeAnimatedHeroPin = (color, icon) =>
  L.divIcon({
    className: "",
    html: `
      <div class="pin-wrap">
        <div class="pin-body" style="background:${color};border:4px solid #fff;border-radius:50% 50% 50% 0;
          width:48px;height:48px;display:flex;align-items:center;justify-content:center;
          transform:rotate(-45deg);box-shadow:0 3px 10px rgba(0,0,0,0.22);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" style="transform:rotate(45deg);filter:drop-shadow(0 1px 1px rgba(0,0,0,0.1));">
            ${icon}
          </svg>
        </div>
      </div>
      <style>
        @keyframes pinPop { 0% { transform:rotate(-45deg) scale(0); opacity:0; } 60% { transform:rotate(-45deg) scale(1.2); opacity:1; } 100% { transform:rotate(-45deg) scale(1); opacity:1; } }
        .pin-body { animation:pinPop 0.35s cubic-bezier(0.34,1.56,0.64,1) both; }
      </style>`,
    iconSize: [56, 56],
    iconAnchor: [28, 56],
    popupAnchor: [0, -56],
  });

// Pre-built icons for every destination type (Apple Maps style, animated)
export const typeIconMap = Object.fromEntries(
  Object.keys(TYPE_SVG).map((key) => [
    key,
    makeAnimatedHeroPin(TYPE_COLORS[key], TYPE_SVG[key]),
  ])
);

// Fallback: use the default green DEST pin when type is unknown
export function getDestIcon(type) {
  return typeIconMap[type] || destIcon;
}

// Override Leaflet's broken default icon globally
L.Marker.prototype.options.icon = startIcon;