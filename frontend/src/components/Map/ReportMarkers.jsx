// components/Map/ReportMarkers.jsx
// Displays approved accessibility reports as color-coded markers on the map.
// Fetches from the public GET /api/reports/approved endpoint.

import { useEffect, useState, memo } from "react";
import { Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { API_URL } from "../../config";

const SEVERITY_CONFIG = {
  1: { color: "#22c55e", label: "Mild",    emoji: "⚠️" },
  2: { color: "#f59e0b", label: "Moderate", emoji: "🔶" },
  3: { color: "#ef4444", label: "Severe",   emoji: "🛑" },
};

// Part B verdict styling — a report's routing verdict overrides its severity colour.
const VERDICT_CONFIG = {
  block: { color: "#dc2626", glyph: "×", label: "Blocked for routing" },
  avoid: { color: "#d97706", glyph: "!", label: "Avoid in routing" },
};

const ISSUE_LABELS = {
  broken_surface:   "Broken Surface",
  blocked_ramp:     "Blocked Ramp",
  missing_curb:     "Missing Curb Cut",
  poor_lighting:    "Poor Lighting",
  construction:     "Construction Zone",
  other:            "Other Issue",
};

function createSeverityIcon(severity) {
  const cfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG[2];
  return L.divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${cfg.color};border:2.5px solid #fff;
      box-shadow:0 1px 6px rgba(0,0,0,0.3);
      display:flex;align-items:center;justify-content:center;
      font-size:10px;color:#fff;font-weight:700;
    ">!</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function createReportIcon(verdict, severity) {
  if (verdict && VERDICT_CONFIG[verdict]) {
    const cfg = VERDICT_CONFIG[verdict];
    return L.divIcon({
      className: "",
      html: `<div style="
        width:24px;height:24px;border-radius:50%;
        background:${cfg.color};border:2.5px solid #fff;
        box-shadow:0 1px 6px rgba(0,0,0,0.35);
        display:flex;align-items:center;justify-content:center;
        font-size:13px;color:#fff;font-weight:800;line-height:1;
      ">${cfg.glyph}</div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }
  return createSeverityIcon(severity);
}

function ReportMarkers() {
  const [reports, setReports] = useState([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchReports() {
      try {
        // Raw reports (popup details) + routing verdicts (marker styling).
        const [approved, feed] = await Promise.all([
          fetch(`${API_URL}/api/reports/approved`).then((r) => r.json()),
          fetch(`${API_URL}/api/reports/decision-feed`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const verdicts = {};
        (feed?.reports ?? []).forEach((d) => { verdicts[d.id] = d.verdict; });
        const merged = (approved?.reports ?? [])
          .filter((r) => r.deleted_at == null)
          .map((r) => ({ ...r, verdict: verdicts[r.id] || null }));
        if (approved?.success || feed?.success) setReports(merged);
      } catch (err) {
        console.warn("[ReportMarkers] Failed to load reports:", err.message);
      }
    }

    fetchReports();
    const interval = setInterval(fetchReports, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  if (!reports.length) return null;

  return (
    <>
      {reports.map((report) => {
        const cfg = SEVERITY_CONFIG[report.severity] || SEVERITY_CONFIG[2];
        return (
          <Marker
            key={report.id}
            position={[report.lat, report.lng]}
            icon={createReportIcon(report.verdict, report.severity)}
          >
            <Popup>
              <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: 220, lineHeight: 1.4 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                  {cfg.emoji} {ISSUE_LABELS[report.issue_type] || report.issue_type}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                  <span style={{ color: cfg.color, fontWeight: 600 }}>{cfg.label}</span>
                  {report.location_name && <> · {report.location_name}</>}
                </div>
                {report.verdict && VERDICT_CONFIG[report.verdict] && (
                  <div style={{ fontSize: 12, color: VERDICT_CONFIG[report.verdict].color, fontWeight: 700, marginBottom: 4 }}>
                    {VERDICT_CONFIG[report.verdict].label}
                  </div>
                )}
                {report.custom_description && (
                  <div style={{ fontSize: 12, color: "#475569", fontStyle: "italic", marginTop: 2 }}>
                    "{report.custom_description}"
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                  Reported {new Date(report.created_at).toLocaleDateString()}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

export default memo(ReportMarkers);
