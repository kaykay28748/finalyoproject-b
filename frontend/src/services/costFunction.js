// services/costFunction.js
// Calculates the contextual cost of travelling an edge
// Used by A* instead of raw distance so routes reflect real-world conditions

import { getTimePeriod, isVehicleRestrictedNow, UG_GATES } from "./gateSchedule";
import { distanceKm } from "../function/utils/distance";

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
    // NOTE: this description only became true as of the pessimistic-default fix.
    // `incline` (0.3% coverage) and `sidewalk` (2.3%) previously defaulted to their
    // BEST values, so this profile could not avoid a gradient or an unpaved
    // carriageway unless someone had explicitly tagged it. Both now carry a
    // structural penalty when the data is absent. See getInclinePenalty /
    // getSidewalkPenalty. Per ROUTING_SAFETY.md §7 rule 4, keep this in step with
    // the weights.
    description: "Avoids steep or unsurveyed inclines, unpaved surfaces and roads without a mapped footway",
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
    description: "Prefers well-used main roads over empty minor ones after dark. Only 1.5% of paths here have verified lighting data, so road busyness - not lighting - does most of the work",
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

// Every factor in calculateEdgeCost is built as `1 + (raw - 1) * w.<factor>`, so one
// undefined or non-numeric weight propagates NaN into baseCost. The A* relaxation
// guard in routing.js is `tentativeG < gScore[neighbour]`, which is always false for
// NaN — so the neighbour is never pushed and never updated, the search silently
// fails to expand through that edge class, and A* reports "no path found" for the
// WHOLE graph. That is a fail-closed outage with no error and no UI signal,
// reachable from a single typo or a partially-migrated profile object.
//
// Validated here, once, at module load, so the failure is immediate and names the
// profile and key instead of appearing later as a caught error with no route on the
// map. Nothing mutates these weights at runtime — routing.js only reads
// `PROFILES[profileKey] || PROFILES.standard` — so import time is the earliest
// point at which a bad weight can be caught, and the only one at which it is cheap.
const PROFILE_WEIGHT_KEYS = ["surface", "incline", "sidewalk", "lighting", "traffic", "gate"];

for (const [profileKey, profile] of Object.entries(PROFILES)) {
  for (const key of PROFILE_WEIGHT_KEYS) {
    if (!Number.isFinite(profile.weights?.[key])) {
      throw new Error(
        `[CostFunction] profile "${profileKey}" has non-finite weight "${key}" = ` +
        `${String(profile.weights?.[key])}. A NaN weight silently breaks A* for every ` +
        `route using this profile, so it is rejected at import rather than at first use.`
      );
    }
  }
}

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

// Penalty for an edge with NO slope information at all — neither an `incline` tag
// nor a measured gradient.
//
// WHY NOT 1.0 (the previous behaviour). `getInclineCategory` returned "flat" for a
// missing tag, and "flat" maps to 1.0 — so an edge with no slope data scored
// IDENTICALLY to a surveyed level path. `incline` is present on 5 of 1958 ways in
// the deployment bbox (0.3%, measured — see ROUTING_SAFETY.md §4.2), and the
// Accessible profile carries `incline: 3.0`, the single largest weight in the
// matrix. The old default therefore asserted, for ~99.7% of the campus, that the
// ground is level. Legon is a hill campus, so that is a factual error rather than
// a neutral no-op, and it hit the profile designed specifically for people who
// cannot absorb a gradient.
//
// WHY 1.6 AND NOT THE FULL very_steep (3.0). Absence of a tag is a gap in the
// data, not an observation about the world, so this must not claim the edge is
// steep — only that we have no evidence it is flat. 1.6 sits between "flat" (1.0)
// and "moderate" (2.0). It is a reasoned value judgement, NOT a measured one, and
// per ROUTING_SAFETY.md §7 rule 1 it is flagged as such here.
//
// MEASURED EFFECT (100 m footway, Accessible profile): untagged incline and
// fully-known-good incline previously both cost 171.000 — indistinguishable. The
// untagged case is now 1.6x the neutral slope term, so the Accessible profile can
// finally tell a path of unknown gradient from a surveyed flat one.
//
// OUTSTANDING GAP, stated plainly so this is not over-credited. A measured gradient
// would be strictly better than a constant, and getInclinePenalty() below already
// consumes one when present — but nothing populates it. The Overpass query in
// graphBuilder.js requests `out skel qt` for nodes, which strips node tags, and OSM
// `ele` is near-absent on these ways, so rise-over-run is not derivable from the
// data this app fetches. Closing this needs a DEM pass (Copernicus/SRTM) and is
// tracked as a data-source task, not a tuning one. Until then the honest claim is
// "unknown gradient is penalised", not "slope is modelled".
const UNKNOWN_INCLINE = 1.6;

// ─── Sidewalk penalties ────────────────────────────────────────────────────────
//
// WHY THE OLD LOGIC WAS OPTIMISTIC. It computed a penalty only when the tag was
// explicitly `sidewalk=no`:
//
//     const noSidewalk = sidewalkTag === "none" || sidewalkTag === "no";
//     const sidewalkCost = noSidewalk ? 1 + (0.4 * w.sidewalk) : 1.0;
//
// so a road with no `sidewalk` tag at all scored 1.0 — identical to a confirmed,
// maintained footway pavement. `sidewalk` is on 2.3% of ways in the deployment
// bbox (measured, ROUTING_SAFETY.md §4.2), so that branch was very nearly dead and
// the term did no work at all on the Accessible profile (`sidewalk: 2.0`), which
// advertises that it "avoids ... roads without sidewalks".
//
// A third state is required. The tag is tri-state in practice: confirmed pavement,
// confirmed absence, and no evidence. Both failure states must carry a penalty, and
// they are NOT equivalent — a road tagged `sidewalk=no` is positive evidence of an
// unpaved carriageway, which is worse than having no data at all.
const SIDEWALK_MISSING_PENALTY = 1.9;  // explicit absence: sidewalk=no / none
const SIDEWALK_UNKNOWN_PENALTY = 1.35; // no evidence either way

// Road classes a pedestrian must share with motor traffic, where the absence of a
// sidewalk tag therefore matters. A `footway` needs no `sidewalk` tag to be
// segregated, so it is exempt.
const MOTOR_TRAFFIC_ROAD_TYPES = [
  "residential", "unclassified", "tertiary", "tertiary_link",
  "secondary", "secondary_link", "primary", "service", "track",
  "living_street", "cycleway",
];

// Road classes that are pedestrian space by construction, regardless of tagging.
const PEDESTRIAN_ONLY_ROAD_TYPES = [
  "footway", "pedestrian", "path", "steps", "bridleway",
];


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
//
// MEASURED, 2026-09-26 (scripts/measure-lit-coverage.mjs, bbox 5.62,-0.21,
// 5.672,-0.175, 1958 ways): `lit` appears on 2.3% of ways overall. Among the
// 1904 ways a pedestrian can be routed along it is 1.5% positively lit, 0.4%
// known dark, and 98.1% untagged. All 46 tagged ways use only yes/no — the
// limited/automatic/disused branches below never fire in this area.
//
// That measurement is the argument against 0.5, and it is stronger than the
// reasoning above. A midpoint between "lit" and "dark" is only a meaningful
// interpolation when the population is actually split between them. Here the
// untagged bucket is not a marginal uncertainty, it is the entire dataset, so
// this coefficient mostly penalises MISSING DATA rather than darkness: at night
// on this profile an untagged edge costs 2.5x while a lit=yes edge costs 1.0x,
// so the model steers away from 98.1% of the network toward the 1.5% it has
// evidence about. Whether that is the right trade is a product decision about
// safety posture, not a tuning question — see ROUTING_SAFETY.md section 4.2,
// which sets out the three options. Change this only alongside that decision.
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
// the direction of the effect, never its magnitude, and it indicates the
// magnitude is not uniform across people: Breda et al. (2025), "NightLight"
// (CHI, doi 10.1145/3706598.3714299) note that nighttime sidewalk illumination
// has a "significant and unequal influence on where and whether pedestrians walk
// at night", and demographic-stratified route-choice work (Lieu & Guhathakurta
// 2025) reports differing preferences by group. Note that NightLight is a
// 13-participant qualitative study and supports direction only, not a value.
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

// Parses an explicit `incline` tag into one of the INCLINE_PENALTIES bands.
//
// NOTE the contract change: this function is now only ever called for a PRESENT,
// PARSEABLE tag. Absence is no longer silently mapped to "flat" here — it is
// handled by getInclinePenalty() below, which returns UNKNOWN_INCLINE instead.
// An unparseable tag is a data-entry error rather than a missing observation, so
// it is still treated as unknown-grade rather than as a claim of flatness.
function getInclineCategory(inclineTag) {
  if (inclineTag === undefined || inclineTag === null || inclineTag === "") return null;
  const tag = String(inclineTag).toLowerCase().trim();
  if (tag === "flat" || tag === "0%") return "flat";
  if (tag === "steep" || tag === "very_steep") return tag.replace(" ", "_");
  const pct = parseFloat(tag.replace("%", ""));
  if (isNaN(pct)) return null;
  const abs = Math.abs(pct);
  if (abs <= 2)  return "flat";
  if (abs <= 5)  return "gentle";
  if (abs <= 10) return "moderate";
  if (abs <= 15) return "steep";
  return "very_steep";
}

/**
 * Rise-over-run gradient for an edge, in percent, from endpoint elevations.
 *
 * Contract: requires `edge.fromNode.ele` and `edge.toNode.ele` (metres, above sea
 * level). Returns null when either is missing or the run is degenerate, so callers
 * fall through to the pessimistic default rather than to "flat".
 *
 * CURRENTLY UNPOPULATED — see the note on UNKNOWN_INCLINE. graphBuilder.js requests
 * `out skel qt` for nodes, which discards node tags, and OSM `ele` is near-absent on
 * these ways, so nothing in the pipeline supplies elevations today. This exists so
 * that adding a DEM pass is a data-source change with no further cost-model edit.
 */
function getEdgeSlopePercent(edge) {
  const from = edge?.fromNode;
  const to   = edge?.toNode;
  if (!from || !to) return null;
  if (!Number.isFinite(from.ele) || !Number.isFinite(to.ele)) return null;

  const runM = distanceKm(from.lat, from.lng, to.lat, to.lng) * 1000;
  if (!Number.isFinite(runM) || runM <= 1) return null;

  return Math.abs(to.ele - from.ele) / runM * 100;
}

/**
 * Resolves the raw incline penalty for an edge, in precedence order:
 *
 *   1. A measured gradient (edge.slopePercent / endpoint elevations) — Meeder formula.
 *   2. An explicit `incline` tag — the Meeder-derived band table.
 *   3. Neither — UNKNOWN_INCLINE. Never "flat".
 *
 * Returning 1.0 (i.e. asserting the path is level) now requires positive evidence.
 */
function getInclinePenalty(edge, inclineTag) {
  // 1. Measured gradient, when a DEM pass has supplied one.
  const measured = Number.isFinite(edge?.slopePercent)
    ? edge.slopePercent
    : getEdgeSlopePercent(edge);
  if (Number.isFinite(measured)) {
    // Meeder, Aebi & Weidmann (2017): 1 + 0.10 x slope%. Capped at very_steep to
    // keep the same deliberate ceiling the band table applies (see INCLINE_PENALTIES).
    return Math.min(1 + 0.10 * Math.abs(measured), INCLINE_PENALTIES.very_steep);
  }

  // 2. Explicit tag.
  const category = getInclineCategory(inclineTag);
  if (category) return INCLINE_PENALTIES[category] ?? UNKNOWN_INCLINE;

  // 3. No evidence at all.
  return UNKNOWN_INCLINE;
}

/**
 * Resolves the raw sidewalk penalty for an edge.
 *
 * Three states, because the tag is tri-state in practice:
 *   - segregated pedestrian space (footway/path/...)      -> 1.0, no tag needed
 *   - explicit `sidewalk=yes|both|left|right`             -> 1.0, confirmed pavement
 *   - explicit `sidewalk=no|none`                         -> SIDEWALK_MISSING_PENALTY
 *   - motor-traffic road class with no `sidewalk` tag     -> SIDEWALK_UNKNOWN_PENALTY
 *   - anything else                                       -> SIDEWALK_UNKNOWN_PENALTY
 */
function getSidewalkPenalty(highwayType, sidewalkTag) {
  if (PEDESTRIAN_ONLY_ROAD_TYPES.includes(highwayType)) return 1.0;

  const tag = typeof sidewalkTag === "string" ? sidewalkTag.toLowerCase().trim() : null;

  if (tag === "no" || tag === "none") return SIDEWALK_MISSING_PENALTY;
  if (tag === "yes" || tag === "both" || tag === "left" || tag === "right") return 1.0;
  // OSM also allows `separate`, which still means a dedicated footway exists.
  if (tag === "separate") return 1.0;

  // No usable tag. On a road the pedestrian must share with traffic, that is
  // meaningful missing information; elsewhere it is neutral. Both are penalised
  // less than a confirmed absence.
  if (MOTOR_TRAFFIC_ROAD_TYPES.includes(highwayType)) return SIDEWALK_UNKNOWN_PENALTY;
  return SIDEWALK_UNKNOWN_PENALTY;
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

// ─── Pedestrian traffic signal ─────────────────────────────────────────────────
//
// getTrafficMultiplier() above is a CONGESTION prior: it models how much motor
// traffic is on the way, which is a disutility for a driver and nothing at all for
// someone on foot. It was previously applied to every mode, which produced a
// sign error for pedestrians.
//
// MEASURED, before this split (walk mode, Standard profile, 100 m edges):
//     footway      08:00 = 208.26   11:00 = 162.63   ratio 1.281  <- penalised
//     pedestrian   08:00 = 196.69   11:00 = 153.60   ratio 1.281  <- penalised
//     residential  08:00 = 254.54   11:00 = 198.77   ratio 1.281  <- penalised
//     path         08:00 = 117.00   11:00 = 117.00   ratio 1.000  <- free
//     service      08:00 = 156.00   11:00 = 156.00   ratio 1.000  <- free
//
// So at 08:00 the model charged a walker 28% more to cross a populated footway
// than an empty one. Two things are wrong with that:
//
//   1. It rewards ISOLATION during the day. For a pedestrian the daytime
//      significance of a busy footway is other people being present — an
//      "eyes on the street" effect, and the same self-reinforcing presence the
//      night branch above already relies on (J. Urban Design
//      10.1057/s41289-020-00134-6 identifies "presence of others" as a core
//      after-dark safety theme, and pedestrian presence is self-reinforcing).
//      The congestion prior had the sign backwards in daylight.
//   2. It conflates two different hazards. Motor traffic on a shared carriageway
//      IS a genuine pedestrian hazard — car/pedestrian conflict — and it scales
//      with volume. That is a separate signal from foot traffic, and it points the
//      other way.
//
// So: congestion stays with vehicles; pedestrians get a safety term where foot
// traffic is an asset and motor traffic is a cost. The night branch of
// getTrafficMultiplier() is left untouched and still governs after-dark isolation,
// because at night motor traffic volume stops being the signal and the presence of
// others becomes it.
//
// NONE OF THE NUMBERS BELOW ARE MEASURED. The literature cited throughout this
// file establishes direction consistently and magnitude essentially never, so
// PED_MOTOR_TRAFFIC_PENALTY and PED_BUSY_FOOTWAY_BENEFIT are reasoned product
// decisions about risk appetite, recorded here per ROUTING_SAFETY.md §7 rule 1.
const PED_MOTOR_TRAFFIC_PENALTY = 0.7;  // conflict risk on a shared carriageway
const PED_BUSY_FOOTWAY_BENEFIT   = 0.85; // < 1, i.e. a discount for a populated footway
const PEAK_CROWD_SHIFT           = 0.6;  // how much of that benefit crowding gives back

// Which geographic context the graph came from. Decided by the backend geofence
// (GET /api/routing/graph-slice) and threaded down to the cost function.
//
// CAMPUS_SANDBOX    — campus graph; the crowd benefits and campus-specific
//                     reasoning below are considered evidence-based here.
// EXTERNAL_TESTING  — a slice around the user's home coordinates. The campus
//                     constants are NOT evidence for that area, so the neutral
//                     urban term is used instead.
//
// Defaulting to CAMPUS_SANDBOX is deliberate. This is the app's real deployment
// context, and the pessimistic fallbacks (UNKNOWN_INCLINE, SIDEWALK_*_PENALTY)
// are *more* conservative in campus mode, so an absent context degrades toward
// safety rather than toward optimism. Flipping the default would silently relax
// safety penalties for anyone whose context fetch failed.
const SANDBOX_CONTEXT = {
  CAMPUS:   'CAMPUS_SANDBOX',
  EXTERNAL: 'EXTERNAL_TESTING',
};

/**
 * Pedestrian-safety traffic term. Used for `walk` and `jogging` in place of the
 * congestion prior during day and dusk.
 *
 * NIGHT DELEGATES to getTrafficMultiplier(). The daytime reasoning below does not
 * hold after dark: at night the relevant signal is isolation rather than volume,
 * and getTrafficMultiplier's night branch already encodes that correctly (it
 * penalises isolated roads and rewards populated ones). Overriding it here would
 * reintroduce the bug this function exists to fix, just on the other half of the
 * clock — the "busy footway" discount would cancel the night-isolation penalty and
 * the sign would flip back to rewarding emptiness after 22:00.
 */
function getPedestrianTrafficMultiplier(highwayType, timePeriod, currentHour, trafficWeight, sandboxContext) {
  // `fastest` sets traffic: 0.0. The linearisation 1 + (raw - 1) * w collapses this
  // to exactly 1.0, so honouring it explicitly keeps the two branches consistent
  // and short-circuits the work.
  if (trafficWeight === 0) return 1.0;

  // EXTERNAL_TESTING: outside the campus sandbox the crowd-benefit reasoning does
  // not hold. These constants were derived from observation of Legon footways, so
  // applying them to, say, a user's home neighbourhood would be inventing evidence
  // about a place that was never surveyed. Fall back to the vehicular congestion
  // term, which is the neutral urban-distance behaviour.
  //
  // This is a *revert to the prior model*, not a removal of safety logic: the
  // pessimistic incline and sidewalk defaults below are unaffected, because they
  // encode absent data rather than a claim about a specific place.
  if (sandboxContext === SANDBOX_CONTEXT.EXTERNAL) {
    return getTrafficMultiplier(highwayType, timePeriod, currentHour, trafficWeight);
  }

  // After dark, isolation is the hazard. Hand off to the audited night logic.
  if (timePeriod === "night") {
    return getTrafficMultiplier(highwayType, timePeriod, currentHour, trafficWeight);
  }

  const isPeakHour = PEAK_HOURS.includes(currentHour);

  if (PEDESTRIAN_ONLY_ROAD_TYPES.includes(highwayType)) {
    // Segregated from motor traffic. The only meaningful signal is how many other
    // people are around, which is a SAFETY benefit, not a cost.
    if (isPeakHour) {
      // Peak crowding: the benefit is partly cancelled by the loss of personal
      // space on a congested corridor.
      return 1 + (1 - PED_BUSY_FOOTWAY_BENEFIT) * trafficWeight * PEAK_CROWD_SHIFT;
    }
    return 1 + (1 - PED_BUSY_FOOTWAY_BENEFIT) * trafficWeight;
  }

  if (MOTOR_TRAFFIC_ROAD_TYPES.includes(highwayType)) {
    // Shared with motor traffic — a real hazard, scaled by how much of it there is.
    const volume = (isPeakHour)                    ? 1.0
                 : (timePeriod === "dusk")         ? 0.8
                 :                                   0.5;
    return 1 + PED_MOTOR_TRAFFIC_PENALTY * trafficWeight * volume;
  }

  // Unknown road class — neutral, not optimistic. Classes absent from both lists
  // above are the synthetic 'connection' edges and anything added later.
  return 1.0;
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

// Applied when a decision's window cannot be measured — legacy payloads written
// before the server anchored expires_at to decided_at, and any unparseable date.
// Same length as the server's DECAY_WINDOW_DAYS, so a repaired payload decays
// identically to a well-formed one.
const FALLBACK_DECAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function decayDecisionPenalty(decision, now = Date.now()) {
  const decidedAt = new Date(decision.decided_at).getTime();
  const expiresAt = new Date(decision.expires_at).getTime();

  // An unparseable decided_at must not silently become "no decay": that pins a
  // block at its full penalty forever. Rebuild an equivalent window from expires_at
  // so a badly-formed decision still ages out instead of becoming permanent.
  const total = expiresAt - decidedAt;
  const window = total > 0 ? total : FALLBACK_DECAY_WINDOW_MS;

  // Likewise, an unparseable expires_at cannot be shown to be expired. Start a full
  // fallback window from now: the verdict keeps its weight and is still guaranteed
  // to decay out, rather than either being permanent or vanishing. The `>= 0`
  // fallback also catches NaN, which would otherwise flow through min/max as NaN
  // and poison the whole cost with it.
  const rawRemaining = expiresAt - now;
  const remaining = Number.isFinite(rawRemaining) ? rawRemaining : window;

  if (remaining <= 0) return 1.0; // expired

  const decayFactor = Math.max(0, Math.min(1, remaining / window));
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
  decisions = [],
  // Geographic context from the backend geofence. Optional so every existing
  // call site keeps working unchanged; see SANDBOX_CONTEXT for the default's
  // safety reasoning.
  sandboxContext = SANDBOX_CONTEXT.CAMPUS
  ) {
  // Hard block for this vehicle mode
  if (!isEdgeAllowed(edge, vehicleMode)) {
    return 9999 * edge.distance;
  }

  const tags     = edge.tags || {};
  const distance = edge.distance;
  // Weight integrity is guaranteed for every PROFILES entry by the import-time
  // check in this module, so this needs no re-checking per edge.
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
  // Pessimistic by construction: a missing `incline` tag no longer resolves to
  // "flat" (which scored 1.0, identical to a surveyed level path). See
  // getInclinePenalty / UNKNOWN_INCLINE.
  const inclineCategory = getInclineCategory(tags.incline);
  const inclinePenalty  = getInclinePenalty(edge, tags.incline);
  let inclineCost       = 1 + (inclinePenalty - 1) * w.incline;

  // Cyclists penalize steep inclines more
  if (vehicleMode === 'bicycle') {
    if (inclineCategory === 'steep') inclineCost *= 1.5;
    else if (inclineCategory === 'very_steep') inclineCost *= 2.0;
  }

  // ── Sidewalk ──────────────────────────────────────────────────────────────
  // Three-state now: confirmed pavement (1.0), confirmed absence
  // (SIDEWALK_MISSING_PENALTY), and no evidence (SIDEWALK_UNKNOWN_PENALTY). The old
  // code penalised only an explicit `sidewalk=no`, so an untagged road scored the
  // same as a confirmed footway pavement — on a tag present on 2.3% of local ways.
  const sidewalkPenalty = getSidewalkPenalty(highwayType, tags.sidewalk);
  const sidewalkCost    = 1 + (sidewalkPenalty - 1) * w.sidewalk;

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
  // Congestion is a VEHICLE prior; pedestrian safety is a different signal with
  // the opposite sign in daylight. Routing a walker through the congestion term
  // charged them 28% more to cross a populated footway than an empty minor path
  // (measured 1.281x vs 1.000x at 08:00), which is backwards for personal
  // security. Split by mode. See getPedestrianTrafficMultiplier.
    const isHumanPowered = vehicleMode === 'walk' || vehicleMode === 'jogging';
    let trafficCost = isHumanPowered
      ? getPedestrianTrafficMultiplier(highwayType, timePeriod, currentHour, w.traffic, sandboxContext)
      : getTrafficMultiplier(highwayType, timePeriod, currentHour, w.traffic);

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
      // Was `require("./gateSchedule")` here, which is undefined in an ESM
      // bundle. That threw a ReferenceError for any edge touching a registered
      // gate node, and calculateRoutes swallows it — so routes near gates
      // silently failed to calculate. UG_GATES is now imported statically above.
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