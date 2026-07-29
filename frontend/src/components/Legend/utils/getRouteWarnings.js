import { UG_GATES, isGateOpenForVehicles, getNextGateStatusChange } from "../../../services/gateSchedule";

const GATE_PROXIMITY_M = 100;
const REPORT_PROXIMITY_M = 150;
const WX_UNPAVED_CODES = [51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99];

const REPORT_TYPE_LABELS = {
  closure: "Road closed",
  hazard: "Hazard ahead",
  construction: "Construction",
  uneven_surface: "Uneven surface",
  poor_lighting: "Poor lighting",
  other: "Issue reported",
};

function nearCoord(coords, lat, lng, threshold) {
  return coords.some((c) => Math.hypot(c.lat - lat, c.lng - lng) * 111319 < threshold);
}

export function getGateWarnings(route, vehicleMode) {
  if (!route?.coordinates?.length) return [];
  const warnings = [];
  for (const [key, gate] of Object.entries(UG_GATES)) {
    if (!nearCoord(route.coordinates, gate.lat, gate.lng, GATE_PROXIMITY_M)) continue;
    if (gate.requiresEcard) {
      warnings.push({ type: "info", message: `${gate.name} requires eCard — have your ID ready` });
    }
    if (vehicleMode === "car" && !isGateOpenForVehicles(key)) {
      warnings.push({ type: "warn", message: `${gate.name} is currently closed for vehicles. ${getNextGateStatusChange()}` });
    }
  }
  return warnings;
}

export function getReportWarnings(route, reports) {
  if (!route?.coordinates?.length || !reports?.length) return [];
  const seen = new Set();
  const warnings = [];
  for (const r of reports) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    if (!nearCoord(route.coordinates, r.lat, r.lng, REPORT_PROXIMITY_M)) continue;
    const label = REPORT_TYPE_LABELS[r.issue_type] || "Issue reported";
    warnings.push({ type: r.severity >= 3 ? "warn" : "info", message: `${label} near your route` });
  }
  return warnings;
}

export function getWeatherWarning(weather, route) {
  if (!weather?.weather || !route?.coordinates?.length) return null;
  if (WX_UNPAVED_CODES.includes(weather.weather.weatherCode)) {
    return { type: "warn", message: "Rain detected — campus paths may be slippery. Allow extra travel time." };
  }
  return null;
}
