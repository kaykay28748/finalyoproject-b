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
    description: "Prefers well-lit and well-used roads. Lighting data is incomplete, so busyness acts as a proxy",
    weights: {
      surface:   1.2,
      incline:   1.5,
      sidewalk:  1.5,
      lighting:  3.0,
      traffic:   1.8,
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
      traffic:   0.0,
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
// Grounded in Meeder, Aebi & Weidmann (2017), "The influence of slope on walking
// activity and the pedestrian modal share", Transportation Research Procedia 27:
// 141-147. Their logit model, fitted to live pedestrian counts on a steep street,
// found that a 1% increase in slope makes a walk roughly 10% LESS attractive —
// i.e. a multiplicative cost of 1 + 0.10 x slopePercent.
//
// The previous values (1.2 / 1.5 / 2.5 / 3.5) were ungrounded. These are the
// coefficient applied to the upper bound of each band that getInclineCategory
// assigns, so flat <=2% -> 1.0-1.2, gentle <=5% -> 1.5, moderate <=10% -> 2.0,
// steep <=15% -> 2.5, very_steep >15% -> 3.0.
//
// KNOWN LIMITATION: Meeder et al. fitted a single population-wide coefficient.
// The mode-specific multipliers applied later for bicycle/jogging (1.5x/2.0x on
// top of this) and the Accessible profile's 3.0 weight are NOT from this source
// and remain reasoned rather than measured. Papers that segment route choice by
// age and mobility (Lieu & Guhathakurta 2025; Borst et al. 2009 for elderly
// walkers) find materially different slope tolerances per group, so a single
// global slope cost is a known approximation.
//
// The table also flattens above 15%: the source formula (1 + 0.10 x pct) would
// keep rising, reaching 3.5x at a 25% gradient, whereas every gradient over 15%
// collapses to 3.0x here. That is a deliberate conservative cap — a 25% gradient
// is barely walkable, and letting the cost grow without bound distorts A* — but
// it does mean this table under-penalises extreme slopes relative to the paper.
// Bands exist because getInclineCategory must also handle the bare strings
// "steep"/"very_steep", which carry no percentage to compute from.
const INCLINE_PENALTIES = {
  flat:       1.0,
  gentle:     1.5,
  moderate:   2.0,
  steep:      2.5,
  very_steep: 3.0,
};

// How much of the full lighting penalty an untagged road receives.
//
// WHY NOT 1.0 (the previous behaviour, which conflated "untagged" with "dark"):
// the OSM wiki on key:lit is explicit that absence is not a negative claim —
// Trail Router's own docs warn that "unlit" ways "might simply have no data", and
// lit=yes is routinely applied to a footway lit only by a nearby billboard or
// motorway, so neither value reliably measures what a walker experiences.
//
// WHY NOT 0.0: Portnov et al. (2020, PLOS ONE 15(11):e0242172) measured the
// relationship between perceived illumination and feeling unsafe in Tel Aviv,
// Haifa and Beersheba: 20-35% probability of feeling unsafe when illumination is
// perceived low, falling below 1% when perceived high. The response is steep, so
// lighting carries most of the variance in after-dark safety and uncertainty
// about it cannot be scored as harmless.
//
// WHY 0.5 specifically: this is the weakest number in the file. It is a reasoned
// compromise between a steep lighting-safety response and unreliable tag
// coverage, NOT a measured value. The defensible statement is the reasoning and
// the citations, not the 0.5. Replace it with a surveyed campus figure if one
// ever exists.
const UNKNOWN_LIT_PENALTY_RATIO = 0.5;

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
// The uturn value is well supported: Lieu & Guhathakurta (2025), "Exploring
// pedestrian route choice preferences by demographic groups", Transportation
// Research Part A 181:104437, fitted a path-size logit to smartphone GPS
// trajectories in Chicago and found each additional turn associated with a loss
// of route utility equivalent to roughly 50 m of distance. Pedestrians there
// "avoid those with many turns". The intermediate values below are an assumed
// shape between that anchor and zero for a straight continuation, not measured.
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

// Proxy for "somebody is around". Sevtsuk et al. (2021), "A big data approach to
// understanding pedestrian route choice preferences: Evidence from San
// Francisco", Cities (MIT dspace 1721.1/139842), analysed anonymised GPS walking
// trajectories and found the presence of VACANT land significantly decreased the
// likelihood of choosing a route AT NIGHT, while mixed/residential land use was
// preferred. Related qualitative work (Journal of Urban Design, 10.1057/s41289-
// 020-00134-6) identifies "presence of others" as a core after-dark perceived-
// safety theme, noting pedestrian presence is self-reinforcing.
//
// This list is a coarse stand-in for that land-use signal, which we do not have.
// "residential" is the weakest member: a quiet residential street is not
// necessarily well-used after dark. Narrowing this list is preferable to tuning
// the night coefficient, if better data ever becomes available.
const BUSY_AREA_TYPES = ["footway", "pedestrian", "residential"];
const PEAK_HOURS = [8, 9, 12, 13, 16, 17];

// How strongly an isolated road is penalised after dark, before the profile's
// own traffic weight is applied.
//
// THIS IS NOT A MEASURED VALUE AND NO LITERATURE CAN MAKE IT ONE. It encodes
// how much a given user prefers a lit, populated detour over a shorter unlit
// one — a risk appetite, not a physical fact. The literature establishes only
// the direction of the effect, never its magnitude, and the same literature
// shows the magnitude is heterogeneous: Lieu & Guhathakurta (2025) segment by
// gender/age/income, and women report feeling unsafe walking at night at
// markedly higher rates than men, with knock-on reductions in nighttime
// physical activity (Lighting Engineering & Society, par.nsf.gov/servlets/
// purl/10635625).
//
// Treating this as a constant bakes one person's risk appetite into the
// product for every user. It is the strongest argument for exposing it as a
// user-facing "how much detour will you accept for a better-lit route"
// preference, defaulting to this value. Until then, 0.6 is a product decision
// and should be reviewed as one.
const NIGHT_ISOLATION_PENALTY = 0.6;

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

  if (timePeriod === "night") {
    // At night the risk runs the opposite way to daytime. Congestion is not the
    // hazard — an empty minor road is. So a night-safety profile should prefer
    // inhabited main roads, and the sign inverts relative to the daytime branch.
    // Without this the whole term collapses to 1.0 for every profile, because
    // 1 + (1.0 - 1) * weight === 1.0.
    //
    // The DIRECTION is literature-supported: vacant land deters night walking
    // (Sevtsuk et al. 2021) and "presence of others" drives after-dark route
    // choice (J. Urban Design 2020). The 0.6 coefficient is NOT — it sets how
    // strongly isolation is avoided, which is a risk-appetite decision, not an
    // empirical finding. See the note on NIGHT_ISOLATION_PENALTY below.
    const isIsolated = !isHighTrafficRoad && !isBusyArea;
    return isIsolated ? 1 + NIGHT_ISOLATION_PENALTY * trafficWeight : 1.0;
  }

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
 * Check if a point is near any routing decision and return the highest penalty.
 * Part B: consumes verdicts from the decision feed (never raw reports).
 * A "block" verdict is effectively impassable; "avoid" applies its confidence-
 * scaled penalty. Both decay linearly toward 1.0 as they approach expiry so a
 * stale report never permanently deforms routing.
 */
const DECISION_RADIUS_METERS = 50;

function decayDecisionPenalty(decision, now = Date.now()) {
  const decidedAt = new Date(decision.decided_at).getTime();
  const expiresAt = new Date(decision.expires_at).getTime();
  const total = expiresAt - decidedAt;
  if (!(total > 0)) return decision.penalty;
  const remaining = expiresAt - now;
  if (remaining <= 0) return 1.0;
  const decayFactor = Math.max(0, Math.min(1, remaining / total));
  return 1 + (decision.penalty - 1) * decayFactor;
}

function getDecisionPenalty(edge, decisions) {
  if (!decisions?.length) return 1.0;

  const midLat = ((edge.fromLat ?? 0) + (edge.toLat ?? 0)) / 2;
  const midLng = ((edge.fromLng ?? 0) + (edge.toLng ?? 0)) / 2;
  if (midLat === 0 && midLng === 0) return 1.0;

  let maxPenalty = 1.0;
  const R = 6371000;

  for (const decision of decisions) {
    if (decision.verdict === 'ignore' || decision.penalty == null) continue;
    const dLat = (decision.lat - midLat) * Math.PI / 180;
    const dLng = (decision.lng - midLng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(midLat * Math.PI / 180) * Math.cos(decision.lat * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    const distMeters = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distMeters <= DECISION_RADIUS_METERS) {
      const penalty = decayDecisionPenalty(decision);
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
  decisions = []
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
  // key:lit has more values than yes/no, and the extra ones are safety-relevant.
  // Per the OSM wiki: lit=disused means "lights installed, but broken or out of
  // use in the long-term", lit=limited means "not always on during the night",
  // lit=automatic means "only turns on when something passes by". Treating any of
  // those as fully lit is the dangerous direction — a walker relying on a broken
  // lamp has less usable light and a false sense of security. Full penalty for
  // disused, three-quarters for the intermittent/part-night values, half for
  // untagged, none for yes and 24/7.
  let lightingCost = 1.0;
  if (timePeriod === "dusk" || timePeriod === "night") {
    const litTag       = tags.lit?.toLowerCase();
    const periodWeight = timePeriod === "night" ? 1.0 : 0.5;
    const isUnknown    = litTag === undefined || litTag === null || litTag === "";

    // Multiplier applied to the profile's lighting weight, 1.0 = full penalty.
    let severity = null;
    if (litTag === "no" || litTag === "disused") {
      severity = 1.0;
    } else if (litTag === "limited" || litTag === "automatic") {
      severity = 0.75;
    } else if (isUnknown) {
      severity = UNKNOWN_LIT_PENALTY_RATIO;
    }
    // lit=yes and lit=24/7 stay at 1.0 (no penalty).

    if (severity !== null) {
      lightingCost = 1 + (severity * w.lighting * periodWeight);
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

  // ── Routing decision penalty ─────────────────────────────────────────────
  const reportPenalty = getDecisionPenalty(edge, decisions);

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

export function buildRouteContext(weatherMultipliers = undefined) {
  const now = new Date();
  return {
    timePeriod:        getTimePeriod(),
    vehicleRestricted: isVehicleRestrictedNow(),
    currentHour:       now.getHours(),
    timestamp:         now.toISOString(),
    weatherMultipliers,
  };
}

export function getActiveWarnings(context, profileKey, vehicleMode = "walk") {
  const warnings = [];
  const day       = new Date().getDay();
  const isWeekday = day >= 1 && day <= 5;

  if (context.timePeriod === "night") {
    warnings.push({ type: "danger", icon: "🌑", message: "Night mode active — unlit and quiet roads are avoided where possible" });
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