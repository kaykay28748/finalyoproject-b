// services/costFunction.js
// Calculates the contextual cost of travelling an edge
// Used by A* instead of raw distance so routes reflect real-world conditions

import { getTimePeriod, isVehicleRestrictedNow } from "./gateSchedule";

// ─── Gate node IDs ────────────────────────────────────────────────────────────
let gateNodeIds = {
  main:    null,
  stadium: null,
  north:   null,
  south:   null,
  link:    null,
};

export function setGateNodeIds(ids) {
  gateNodeIds = { ...gateNodeIds, ...ids };
  console.log("[CostFunction] Gate node IDs registered:", gateNodeIds);
}

// ─── VEHICLE MODES ────────────────────────────────────────────────────────────
export const VEHICLE_MODES = {
  walk: {
    key: 'walk',
    label: 'Walking',
    icon: '🚶',
    speedKmh: 5,
    description: 'Pedestrian routes - uses footpaths and walkways',
    allowedRoads: ['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'residential', 'service', 'track', 'living_street', 'unclassified', 'tertiary', 'secondary_link', 'tertiary_link'],
    blockedRoads: ['motorway', 'motorway_link', 'primary', 'secondary', 'trunk'],
    baseSpeedMs: 1.39,
  },
  car: {
    key: 'car',
    label: 'Car',
    icon: '🚗',
    speedKmh: 30,
    description: 'Driving routes - follows roads, avoids footpaths',
    allowedRoads: ['residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'living_street'],
    blockedRoads: ['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track', 'motorway', 'motorway_link'],
    baseSpeedMs: 8.33,
  },
  motorcycle: {
    key: 'motorcycle',
    label: 'Motorcycle',
    icon: '🏍️',
    speedKmh: 25,
    description: 'Motorcycle routes - more flexible than cars',
    allowedRoads: ['residential', 'service', 'unclassified', 'tertiary', 'secondary', 'primary', 'living_street', 'track', 'cycleway'],
    blockedRoads: ['footway', 'path', 'pedestrian', 'steps', 'motorway', 'motorway_link'],
    baseSpeedMs: 6.94,
  },
  bicycle: {
    key: 'bicycle',
    label: 'Bicycle',
    icon: '🚴',
    speedKmh: 15,
    description: 'Cycling routes - prefers cycleways and smooth surfaces',
    allowedRoads: ['cycleway', 'footway', 'path', 'residential', 'service', 'track', 'living_street', 'unclassified', 'tertiary', 'tertiary_link', 'secondary_link', 'bridleway'],
    blockedRoads: ['steps', 'pedestrian', 'motorway', 'motorway_link', 'primary', 'secondary'],
    baseSpeedMs: 4.17,
  },
  jogging: {
    key: 'jogging',
    label: 'Jogging',
    icon: '🏃',
    speedKmh: 10,
    description: 'Running routes - prefers soft surfaces and shaded paths',
    allowedRoads: ['footway', 'path', 'pedestrian', 'cycleway', 'residential', 'service', 'track', 'living_street', 'unclassified', 'tertiary_link', 'secondary_link', 'bridleway'],
    blockedRoads: ['steps', 'motorway', 'motorway_link', 'primary', 'secondary', 'trunk'],
    baseSpeedMs: 2.78,
  },
};

// ─── Default weather multipliers (no weather impact) ──────────────────────────
export const DEFAULT_WEATHER_MULTIPLIERS = {
  unpavedMultiplier: 1.0,
  lightingMultiplier: 1.0,
  exposedMultiplier: 1.0,
  shadeBonus: 1.0,
  speedReduction: 1.0,
  message: null
};

// ─── User profiles ────────────────────────────────────────────────────────────
export const PROFILES = {
  standard: {
    label: "Standard",
    icon: "🗺️",
    color: "#2563eb",
    description: "Balanced route — shortest with basic safety",
    weights: {
      surface:   1.0,
      incline:   1.0,
      sidewalk:  1.0,
      lighting:  1.2,
      traffic:   1.3,
      gate:      1.0,
    },
  },
  accessible: {
    label: "Accessible",
    icon: "♿",
    color: "#8b5cf6",
    description: "Avoids steep inclines, unpaved surfaces and roads without sidewalks",
    weights: {
      surface:   2.5,
      incline:   3.0,
      sidewalk:  2.0,
      lighting:  1.2,
      traffic:   1.5,
      gate:      1.0,
    },
  },
  night: {
    label: "Night Safety",
    icon: "🌙",
    color: "#f59e0b",
    description: "Prioritises well-lit, busy roads for safer night navigation",
    weights: {
      surface:   1.2,
      incline:   1.5,
      sidewalk:  1.5,
      lighting:  3.0,
      traffic:   0.8,
      gate:      1.0,
    },
  },
  fastest: {
    label: "Fastest",
    icon: "⚡",
    color: "#22c55e",
    description: "Pure shortest path — ignores comfort and safety factors",
    weights: {
      surface:   1.0,
      incline:   1.0,
      sidewalk:  1.0,
      lighting:  1.0,
      traffic:   1.0,
      gate:      1.0,
    },
  },
};

// ─── Surface penalties ────────────────────────────────────────────────────────
const SURFACE_PENALTIES = {
  paved:         1.0,
  asphalt:       1.0,
  concrete:      1.0,
  paving_stones: 1.1,
  sett:          1.1,
  compacted:     1.2,
  gravel:        1.4,
  fine_gravel:   1.3,
  dirt:          1.6,
  grass:         1.7,
  unpaved:       1.5,
  ground:        1.5,
  sand:          1.8,
  mud:           2.0,
};

// ─── Incline penalties ────────────────────────────────────────────────────────
const INCLINE_PENALTIES = {
  flat:       1.0,
  gentle:     1.2,
  moderate:   1.5,
  steep:      2.5,
  very_steep: 3.5,
};

// ─── Highway base costs ───────────────────────────────────────────────────────
const HIGHWAY_BASE_COST_WALK = {
  footway:        0.9,
  path:           0.9,
  pedestrian:     0.85,
  steps:          1.8,
  cycleway:       1.05,
  living_street:  1.0,
  residential:    1.1,
  service:        1.2,
  track:          1.3,
  unclassified:   1.2,
  tertiary_link:  1.3,
  secondary_link: 1.4,
  tertiary:       1.5,
  secondary:      2.0,
  primary:        3.0,
  trunk:          9999,
  motorway:       9999,
  motorway_link:  9999,
  connection:     1.1,
};

const HIGHWAY_BASE_COST_VEHICLE = {
  footway:        9999,
  path:           9999,
  pedestrian:     9999,
  steps:          9999,
  cycleway:       9999,
  living_street:  1.2,
  residential:    1.1,
  service:        1.2,
  track:          1.4,
  unclassified:   1.1,
  tertiary_link:  1.0,
  secondary_link: 1.0,
  tertiary:       0.95,
  secondary:      0.9,
  primary:        0.85,
  trunk:          9999,
  motorway:       9999,
  motorway_link:  9999,
  connection:     1.3,
};

const HIGHWAY_BASE_COST_BICYCLE = {
  cycleway:       0.7,
  footway:        1.1,
  path:           1.1,
  pedestrian:     9999,
  steps:          9999,
  bridleway:      1.2,
  living_street:  1.0,
  residential:    1.0,
  service:        1.1,
  track:          1.4,
  unclassified:   1.05,
  tertiary_link:  1.05,
  secondary_link: 1.1,
  tertiary:       1.15,
  secondary:      1.4,
  primary:        2.0,
  trunk:          9999,
  motorway:       9999,
  motorway_link:  9999,
  connection:     1.15,
};

const HIGHWAY_BASE_COST_JOGGING = {
  footway:        0.9,
  path:           0.9,
  pedestrian:     0.95,
  steps:          1.0,
  cycleway:       1.0,
  bridleway:      1.0,
  living_street:  1.0,
  residential:    1.05,
  service:        1.1,
  track:          1.0,
  unclassified:   1.1,
  tertiary_link:  1.15,
  secondary_link: 1.2,
  tertiary:       1.3,
  secondary:      1.5,
  primary:        2.0,
  trunk:          9999,
  motorway:       9999,
  motorway_link:  9999,
  connection:     1.1,
};

// ─── Campus core preference ───────────────────────────────────────────────────
const CAMPUS_CORE_BONUS     = 0.85;
const PERIMETER_ROAD_PENALTY = 1.2;

const CAMPUS_CORE_ROADS = [
  'Nsia Road', 'Akuafo Road', 'Onyaa Road', 'E.A. Boateng Road',
  'Legon Road', 'Ivan Addae Mensah Intersection', 'JQB Road'
];

const PERIMETER_ROADS = [
  'Ring Road West', 'Ring Road East', 'J.J. Rawlings Avenue',
  'N4', 'Legon Boundary Road', 'McCarthy Link'
];

// ─── Turn penalty ─────────────────────────────────────────────────────────────
const TURN_PENALTIES_METRES = {
  slight:    0,
  moderate:  5,
  sharp:     15,
  very_sharp: 30,
  uturn:     50,
};

export function getBearing(lat1, lng1, lat2, lng2) {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function calculateTurnPenalty(incomingBearing, outgoingBearing) {
  const diff = Math.abs(((outgoingBearing - incomingBearing) + 540) % 360 - 180);

  if (diff < 30)  return TURN_PENALTIES_METRES.slight;
  if (diff < 60)  return TURN_PENALTIES_METRES.moderate;
  if (diff < 120) return TURN_PENALTIES_METRES.sharp;
  if (diff < 150) return TURN_PENALTIES_METRES.very_sharp;
  return TURN_PENALTIES_METRES.uturn;
}

const MAX_DIRECTION_PENALTY_METRES = 20;

export function calculateDirectionPenalty(goalBearing, edgeBearing) {
  const diff = Math.abs(((edgeBearing - goalBearing) + 540) % 360 - 180);
  return MAX_DIRECTION_PENALTY_METRES * (1 - Math.cos(diff * Math.PI / 180)) / 2;
}

const BUSY_AREA_TYPES = ["footway", "pedestrian", "residential"];
const PEAK_HOURS = [8, 9, 12, 13, 16, 17];

function isWeekend()  { const d = new Date().getDay(); return d === 0 || d === 6; }
function isSunday()   { return new Date().getDay() === 0; }
function isSaturday() { return new Date().getDay() === 6; }

function getInclineCategory(inclineTag) {
  if (!inclineTag) return "flat";
  const tag = String(inclineTag).toLowerCase().trim();
  if (tag === "flat" || tag === "0%") return "flat";
  if (tag === "steep" || tag === "very_steep") return tag.replace(" ", "_");
  const pct = parseFloat(tag.replace("%", ""));
  if (isNaN(pct)) return "flat";
  const abs = Math.abs(pct);
  if (abs <= 2)  return "flat";
  if (abs <= 5)  return "gentle";
  if (abs <= 10) return "moderate";
  if (abs <= 15) return "steep";
  return "very_steep";
}

function getTrafficMultiplier(highwayType, timePeriod, currentHour, trafficWeight) {
  const isPeakHour       = PEAK_HOURS.includes(currentHour);
  const isBusyArea       = BUSY_AREA_TYPES.includes(highwayType);
  const isHighTrafficRoad = ["primary", "secondary", "trunk"].includes(highwayType);
  const weekend  = isWeekend();
  const saturday = isSaturday();
  const sunday   = isSunday();

  let baseMultiplier = 1.0;

  if (weekend) {
    baseMultiplier = sunday ? 1.0 : 1.1;
  } else {
    if      (isPeakHour && (isBusyArea || isHighTrafficRoad))             baseMultiplier = 1.6;
    else if (timePeriod === "day"  && (isBusyArea || isHighTrafficRoad))  baseMultiplier = 1.3;
    else if (timePeriod === "dusk" && (isBusyArea || isHighTrafficRoad))  baseMultiplier = 1.1;
    else if (timePeriod === "night")                                        baseMultiplier = 1.0;
  }

  return 1 + (baseMultiplier - 1) * trafficWeight;
}

export function isEdgeAllowed(edge, vehicleMode) {
  const highwayType  = edge.tags?.highway || edge.type || 'residential';
  const vehicleConfig = VEHICLE_MODES[vehicleMode];
  if (!vehicleConfig) return true;
  return !vehicleConfig.blockedRoads.includes(highwayType);
}

function isCampusCoreRoad(roadName, tags) {
  if (!roadName && !tags?.name) return false;
  const name = (roadName || tags?.name || '').toLowerCase();
  return CAMPUS_CORE_ROADS.some(r => name.includes(r.toLowerCase()));
}

function isPerimeterRoad(roadName, tags) {
  if (!roadName && !tags?.name) return false;
  const name = (roadName || tags?.name || '').toLowerCase();
  return PERIMETER_ROADS.some(r => name.includes(r.toLowerCase()));
}

export function getEstimatedTime(distanceMeters, vehicleMode) {
  const vehicleConfig = VEHICLE_MODES[vehicleMode] || VEHICLE_MODES.walk;
  const timeSeconds   = distanceMeters / vehicleConfig.baseSpeedMs;
  return Math.ceil(timeSeconds / 60);
}

/**
 * Check if a point is near any approved report and return the highest severity penalty.
 * Reports within REPORT_RADIUS_METERS of the edge midpoint affect routing.
 */
const REPORT_RADIUS_METERS = 50;
const REPORT_SEVERITY_MULTIPLIERS = { 1: 1.5, 2: 2.0, 3: 3.0 };

function getReportPenalty(edge, approvedReports) {
  if (!approvedReports?.length) return 1.0;

  const midLat = ((edge.fromLat ?? 0) + (edge.toLat ?? 0)) / 2;
  const midLng = ((edge.fromLng ?? 0) + (edge.toLng ?? 0)) / 2;
  if (midLat === 0 && midLng === 0) return 1.0;

  let maxPenalty = 1.0;
  const R = 6371000;

  for (const report of approvedReports) {
    if (!report.lat || !report.lng) continue;
    const dLat = (report.lat - midLat) * Math.PI / 180;
    const dLng = (report.lng - midLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(midLat * Math.PI / 180) * Math.cos(report.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distMeters <= REPORT_RADIUS_METERS) {
      const severity = report.severity || 2;
      let penalty = REPORT_SEVERITY_MULTIPLIERS[severity] || 2.0;
      if (report.issue_type === 'construction' && severity === 3) penalty = 9999;
      if (penalty > maxPenalty) maxPenalty = penalty;
    }
  }

  return maxPenalty;
}

/**
 * Calculates the weighted cost of traversing an edge.
 * Now includes weather multipliers for context-aware routing.
 */
export function calculateEdgeCost(
  edge,
  profile,
  timePeriod,
  vehicleRestricted,
  currentHour,
  vehicleMode = 'walk',
  incomingBearing = null,
  goalBearing = null,
  weatherMultipliers = DEFAULT_WEATHER_MULTIPLIERS,
  approvedReports = []
) {
  // Hard block for this vehicle mode
  if (!isEdgeAllowed(edge, vehicleMode)) {
    return 9999 * edge.distance;
  }

  const tags     = edge.tags || {};
  const distance = edge.distance;
  const w        = profile.weights;

  const highwayType = tags.highway || edge.type || "residential";

  let baseCostTable;
  if (vehicleMode === 'walk') {
    baseCostTable = HIGHWAY_BASE_COST_WALK;
  } else if (vehicleMode === 'bicycle') {
    baseCostTable = HIGHWAY_BASE_COST_BICYCLE;
  } else if (vehicleMode === 'jogging') {
    baseCostTable = HIGHWAY_BASE_COST_JOGGING;
  } else {
    baseCostTable = HIGHWAY_BASE_COST_VEHICLE;
  }

  const highwayCost = baseCostTable[highwayType] ?? 1.3;

  if (highwayCost >= 9999) return 9999 * distance;

  // ── Campus road preference ─────────────────────────────────────────────────
  let campusBonus = 1.0;
  if (vehicleMode === 'walk' || vehicleMode === 'bicycle' || vehicleMode === 'jogging') {
    const roadName = tags.name || '';
    if      (isCampusCoreRoad(roadName, tags))  campusBonus = CAMPUS_CORE_BONUS;
    else if (isPerimeterRoad(roadName, tags))    campusBonus = PERIMETER_ROAD_PENALTY;
  }

  // ── Surface ───────────────────────────────────────────────────────────────
  const surfaceTag     = tags.surface?.toLowerCase() || "unknown";
  const surfacePenalty = SURFACE_PENALTIES[surfaceTag] ?? 1.3;
  let surfaceCost    = 1 + (surfacePenalty - 1) * w.surface;

  // Mode-specific surface modifiers
  if (vehicleMode === 'bicycle') {
    const unpavedSurfaces = ['grass', 'dirt', 'gravel', 'unpaved', 'ground', 'sand', 'mud'];
    if (unpavedSurfaces.includes(surfaceTag)) {
      surfaceCost *= 1.8;
    }
  } else if (vehicleMode === 'jogging') {
    const softSurfaces = ['grass', 'dirt', 'compacted', 'ground', 'fine_gravel', 'track'];
    if (softSurfaces.includes(surfaceTag)) {
      surfaceCost *= 0.88;
    }
  }

  // ── Incline ───────────────────────────────────────────────────────────────
  const inclineCat     = getInclineCategory(tags.incline);
  const inclinePenalty = INCLINE_PENALTIES[inclineCat] ?? 1.0;
  let inclineCost    = 1 + (inclinePenalty - 1) * w.incline;

  // Cyclists penalize steep inclines more
  if (vehicleMode === 'bicycle') {
    if (inclineCat === 'steep') inclineCost *= 1.5;
    else if (inclineCat === 'very_steep') inclineCost *= 2.0;
  }

  // ── Sidewalk ──────────────────────────────────────────────────────────────
  const sidewalkTag  = tags.sidewalk?.toLowerCase();
  const noSidewalk   = sidewalkTag === "none" || sidewalkTag === "no";
  const sidewalkCost = noSidewalk ? 1 + (0.4 * w.sidewalk) : 1.0;

  // ── Lighting ──────────────────────────────────────────────────────────────
  let lightingCost = 1.0;
  if (timePeriod === "dusk" || timePeriod === "night") {
    const litTag    = tags.lit?.toLowerCase();
    const isUnlit   = litTag === "no" || litTag === undefined;
    if (isUnlit) {
      const nightMultiplier = timePeriod === "night" ? 1.0 : 0.5;
      lightingCost = 1 + (1.0 * w.lighting * nightMultiplier);
    }
  }

  // ── Traffic ───────────────────────────────────────────────────────────────
  let trafficCost = getTrafficMultiplier(highwayType, timePeriod, currentHour, w.traffic);

  // Cyclists and joggers avoid busy roads more
  if (vehicleMode === 'bicycle' || vehicleMode === 'jogging') {
    const busyRoads = ['primary', 'secondary', 'tertiary'];
    if (busyRoads.includes(highwayType)) {
      trafficCost *= 1.3;
    }
  }

  // ── Gate ──────────────────────────────────────────────────────────────────
  let gateCost = 1.0;
  const nonGateModes = ['car', 'motorcycle'];
  if (vehicleRestricted && nonGateModes.includes(vehicleMode)) {
    const gate = isEdgeNearGate(edge);
    if (gate?.requiresEcard) gateCost = 9999;
  }

  // ── WEATHER MULTIPLIERS ───────────────────────────────────────────────────
  let weatherSurfaceMultiplier = 1.0;
  let weatherLightingMultiplier = 1.0;
  let shadeCost = 1.0;
  let exposedCost = 1.0;
  
  if (weatherMultipliers) {
    const isUnpaved = ['grass', 'dirt', 'gravel', 'unpaved', 'ground', 'sand', 'mud'].includes(surfaceTag);

    // Cyclists and joggers more affected by wet unpaved surfaces
    if (isUnpaved) {
      weatherSurfaceMultiplier = weatherMultipliers.unpavedMultiplier || 1.0;
      if ((vehicleMode === 'bicycle' || vehicleMode === 'jogging') && weatherMultipliers.unpavedMultiplier > 1.0) {
        weatherSurfaceMultiplier += (weatherMultipliers.unpavedMultiplier - 1.0) * 0.5;
      }
    }
    
    // Apply weather lighting multiplier
    if (timePeriod === "night" || timePeriod === "dusk") {
      weatherLightingMultiplier = weatherMultipliers.lightingMultiplier || 1.0;
    }
    
    // Apply shade bonus for hot weather — enhanced for joggers
    const hasShade = tags?.shaded === 'yes' || tags?.trees === 'yes';
    if (hasShade && weatherMultipliers.shadeBonus && weatherMultipliers.shadeBonus < 1.0) {
      shadeCost = weatherMultipliers.shadeBonus;
      if (vehicleMode === 'jogging') shadeCost *= 0.92;
    }
    
    // Apply exposed penalty for open areas in rain/storm
    const isExposed = tags?.sheltered === 'no' || tags?.trees === 'no';
    if (isExposed) {
      exposedCost = weatherMultipliers.exposedMultiplier || 1.0;
      if (vehicleMode === 'bicycle' && isUnpaved && weatherMultipliers.exposedMultiplier > 1.0) {
        exposedCost += (weatherMultipliers.exposedMultiplier - 1.0) * 0.5;
      }
    }
  }

  // Apply weather multipliers to surface and lighting
  const surfaceCostWithWeather = surfaceCost * weatherSurfaceMultiplier;
  const lightingCostWithWeather = lightingCost * weatherLightingMultiplier;

  // ── Mode-specific highway type bonus ──────────────────────────────────────
  let modeHighwayBonus = 1.0;
  if (vehicleMode === 'bicycle' && highwayType === 'cycleway') {
    modeHighwayBonus = 0.82;
  } else if (vehicleMode === 'jogging' && (highwayType === 'track' || highwayType === 'path')) {
    modeHighwayBonus = 0.9;
  }

  // ── Approved report penalty ──────────────────────────────────────────────
  const reportPenalty = getReportPenalty(edge, approvedReports);

  // ── Base weighted distance with weather ────────────────────────────────────
  const baseCost =
    distance *
    campusBonus *
    modeHighwayBonus *
    highwayCost *
    surfaceCostWithWeather *
    inclineCost *
    sidewalkCost *
    lightingCostWithWeather *
    trafficCost *
    gateCost *
    shadeCost *
    exposedCost *
    reportPenalty;

  // ── Turn penalty ─────────────────────────────────────────────────────────
  let turnPenalty = 0;
  if (incomingBearing !== null && profile !== PROFILES.fastest) {
    const outgoingBearing = getBearing(
      edge.fromLat ?? 0, edge.fromLng ?? 0,
      edge.toLat   ?? 0, edge.toLng   ?? 0
    );
    if (outgoingBearing !== 0 || edge.fromLat) {
      turnPenalty = calculateTurnPenalty(incomingBearing, outgoingBearing);
    }
  }

  // ── Direction consistency penalty ─────────────────────────────────────────
  let directionPenalty = 0;
  if (goalBearing !== null && vehicleMode === 'walk' && profile !== PROFILES.fastest) {
    const outgoingBearing = getBearing(
      edge.fromLat ?? 0, edge.fromLng ?? 0,
      edge.toLat   ?? 0, edge.toLng   ?? 0
    );
    if (edge.fromLat) {
      directionPenalty = calculateDirectionPenalty(goalBearing, outgoingBearing);
    }
  }

  return baseCost + turnPenalty + directionPenalty;
}

function isEdgeNearGate(edge) {
  for (const [key, nodeId] of Object.entries(gateNodeIds)) {
    if (!nodeId) continue;
    if (edge.from === nodeId || edge.to === nodeId) {
      const { UG_GATES } = require("./gateSchedule");
      return UG_GATES[key];
    }
  }
  return null;
}

export function buildRouteContext() {
  const now = new Date();
  return {
    timePeriod:        getTimePeriod(),
    vehicleRestricted: isVehicleRestrictedNow(),
    currentHour:       now.getHours(),
    timestamp:         now.toISOString(),
  };
}

export function getActiveWarnings(context, profileKey, vehicleMode = "walk") {
  const warnings = [];
  const day       = new Date().getDay();
  const isWeekday = day >= 1 && day <= 5;

  if (context.timePeriod === "night") {
    warnings.push({ type: "danger", icon: "🌑", message: "Night mode active — poorly lit routes are avoided" });
  } else if (context.timePeriod === "dusk") {
    warnings.push({ type: "warn",   icon: "🌆", message: "Dusk mode active — lighting penalties applied" });
  }

  if (context.vehicleRestricted) {
    warnings.push({ type: "warn", icon: "🚪", message: "Gates closed 00:00–05:00 — Open to pedestrians" });
  }

  if (profileKey === "accessible") {
    warnings.push({ type: "info", icon: "♿", message: "Accessibility mode — steep and unpaved paths avoided" });
  }

  // Mode-specific warnings
  if (vehicleMode === 'bicycle') {
    warnings.push({ type: "info", icon: "🚴", message: "Cycle mode — smooth surfaces and cycleways preferred" });
  } else if (vehicleMode === 'jogging') {
    warnings.push({ type: "info", icon: "🏃", message: "Jogging mode — soft surfaces and shaded paths preferred" });
  }

  const isPeakHour = [8, 9, 12, 13, 16, 17].includes(context.currentHour);
  if (isWeekday && isPeakHour && context.timePeriod === "day") {
    warnings.push({ type: "info", icon: "🚶‍♂️", message: "Peak hours — busy paths may be slower" });
  }

  return warnings;
}