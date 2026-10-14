// services/gateSchedule.js
// Manages gate open/close status based on live time
// Gates are checked on every route calculation so the result is always current

export const UG_GATES = {
  main: {
    name: "Main Gate",
    lat: 5.6416, lng: -0.1852,
    requiresEcard: true,
    alwaysOpen: false,
  },
  stadium: {
    name: "Stadium Gate (Okponglo)",
    lat: 5.6385, lng: -0.1750,
    requiresEcard: false,
    alwaysOpen: true,   // only 24/7 public access gate
  },
  north: {
    name: "North Gate",
    lat: 5.6664, lng: -0.1882,
    requiresEcard: true,
    alwaysOpen: false,
  },
  south: {
    name: "South Gate",
    lat: 5.6324, lng: -0.1704,
    requiresEcard: true,
    alwaysOpen: false,
  },
  link: {
    name: "Link Gate",
    lat: 5.6453, lng: -0.1994,
    requiresEcard: true,
    alwaysOpen: false,
  },
};

// Restricted gates are closed to vehicles between midnight and 05:00
// Pedestrians can always pass through gates regardless of time
const VEHICLE_RESTRICTED_HOURS = { start: 0, end: 5 }; // 00:00 – 05:00

/**
 * Returns true if the current time falls within the vehicle restriction window
 * Uses Ghana time (GMT+0 — Ghana does not observe daylight saving)
 */
export function isVehicleRestrictedNow() {
  const now  = new Date();
  const hour = now.getUTCHours(); // Ghana is UTC+0
  return hour >= VEHICLE_RESTRICTED_HOURS.start && hour < VEHICLE_RESTRICTED_HOURS.end;
}

/**
 * Returns true if a specific gate is currently open for vehicles
 * Stadium gate is always open — others close 00:00–05:00
 */
export function isGateOpenForVehicles(gateKey) {
  const gate = UG_GATES[gateKey];
  if (!gate) return true;
  if (gate.alwaysOpen) return true;
  return !isVehicleRestrictedNow();
}

/**
 * Returns the current time period for routing decisions
 * - "day"   : 06:00–19:00 — standard routing
 * - "dusk"  : 19:00–22:00 — lighting penalty activates, post-class movement
 * - "night" : 22:00–06:00 — full night mode, danger zone warnings
 */
export function getTimePeriod() {
  const hour = new Date().getUTCHours();
  if (hour >= 6  && hour < 19) return "day";
  if (hour >= 19 && hour < 22) return "dusk";
  return "night";
}

/**
 * Returns a human-readable string of when the next gate status change occurs
 * Useful for showing users "Gates reopen at 05:00" in the UI
 */
export function getNextGateStatusChange() {
  if (isVehicleRestrictedNow()) {
    return "Gates reopen at 05:00";
  }
  return "Gates close at 00:00";
}

/**
 * Finds the closest gate to a given coordinate
 * Used to snap gate nodes onto the road network
 */
export function getClosestGate(lat, lng) {
  let closest  = null;
  let minDist  = Infinity;

  for (const [key, gate] of Object.entries(UG_GATES)) {
    const dist = Math.hypot(gate.lat - lat, gate.lng - lng);
    if (dist < minDist) {
      minDist  = dist;
      closest  = { key, ...gate };
    }
  }

  return closest;
}