import { useState } from "react";

function formatAge(ms) {
  if (ms == null) return null;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1)   return "just now";
  if (minutes < 60)  return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24)    return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// Stated as the actual inputs to the route, not as generic legal boilerplate.
// A specific disclosure ("2 community hazards, weather not factored in") both
// tells the user something useful and records that the basis was communicated.
export default function RouteProvenance({ provenance }) {
  const [open, setOpen] = useState(false);
  if (!provenance) return null;

  const { graphSource, graphAgeMs, hazardCount, hazardFeed, weatherBasis } = provenance;

  const graphLabel =
    graphSource === "live"  ? "Road data: live OpenStreetMap fetch"
  : graphSource === "cache" ? `Road data: cached ${formatAge(graphAgeMs) ?? "recently"}`
  : "Road data: source unknown";

  const hazardLabel =
    hazardFeed === "unavailable"
      ? "Community hazards: unavailable — not applied to this route"
      : hazardCount === 0
        ? "Community hazards: none reported nearby"
        : `Community hazards: ${hazardCount} active report${hazardCount === 1 ? "" : "s"} applied`;

  const weatherLabel =
    weatherBasis?.fallback ? "Weather: estimated only — not applied"
    : weatherBasis?.applied ? `Weather: ${weatherBasis.message}`
    : "Weather: no adjustment needed";

  const items = [graphLabel, hazardLabel, weatherLabel];

  return (
    <div className="legend-provenance">
      <button
        type="button"
        className="legend-provenance-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="legend-provenance-label">What this route is based on</span>
        <span className="legend-provenance-chevron" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <>
          <ul className="legend-provenance-list">
            {items.map((item) => <li key={item}>{item}</li>)}
          </ul>
          <p className="legend-provenance-how">
            Not filters or detours — weather, lighting and reported hazards each
            change the cost of the edges they touch, so the route is chosen
            across all of them at once.
          </p>
          <p className="legend-provenance-note">
            Lighting, surfaces and access can differ from the map — worth a quick look
            on the ground. Every hazard report you add makes the next route better for
            everyone.
          </p>
        </>
      )}
    </div>
  );
}
