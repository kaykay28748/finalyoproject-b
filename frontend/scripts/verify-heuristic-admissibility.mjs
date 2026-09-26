/**
 * Regression test for A* heuristic admissibility.
 *
 * The heuristic is admissible iff h(n) <= trueCost(n -> goal) for every node.
 * Because calculateEdgeCost() applies sub-1.0 multipliers (the campus core
 * bonus is 0.85, and cycling/jogging highway tables go lower), the true cost of
 * a path can be LESS than the straight-line distance between its endpoints.
 * Raw haversine distance is therefore not a valid lower bound, and A* can
 * return a suboptimal route.
 *
 * This test re-derives, from the real cost function, the minimum cost/distance
 * ratio reachable per vehicle mode, and asserts that the scale factor hardcoded
 * in routing.js stays at or below it.
 *
 * Run from frontend/:
 *   npx esbuild scripts/verify-heuristic-admissibility.mjs --bundle \
 *     --platform=node --format=esm --outfile=scripts/.tmp-verify.mjs
 *   node scripts/.tmp-verify.mjs
 *
 * Exits non-zero if the invariant is broken.
 */
import { calculateEdgeCost, PROFILES } from "../src/services/costFunction.js";
import { HEURISTIC_ADMISSIBILITY_SCALE, DEFAULT_HEURISTIC_SCALE } from "../src/services/routing.js";

const HIGHWAYS = ["footway","path","pedestrian","steps","cycleway","living_street",
  "residential","service","track","unclassified","tertiary_link","secondary_link",
  "tertiary","secondary","primary","trunk","motorway","connection","bridleway"];
const SURFACES = ["asphalt","paved","concrete","paving_stones","unpaved","gravel",
  "dirt","ground","grass","sand","mud","cobblestone","snow","ice"];
const LITS    = [undefined,"yes","no","24/7","limited","automatic","disused"];
const NAMES   = [undefined,"Nsia Road","Akuafo Road","Legon Road","Ring Road West",
  "JQB Road","McCarthy Link","N4","Onyaa Road","E.A. Boateng Road"];
const INCL    = [undefined,"0%","1%","2%","5%","10%","15%","25%","steep","very_steep"];
const SIDEWALKS = [undefined,"yes","no","separate","left","right"];
const PERIODS = ["morning","day","dusk","night"];
const MODES = ["walk","bicycle","jogging","vehicle"];
const D = 1000;

function measureFloor(mode) {
  let min = Infinity, where = null;
  for (const pkey of Object.keys(PROFILES))
  for (const period of PERIODS)
  for (const highway of HIGHWAYS)
  for (const surface of SURFACES)
  for (const lit of LITS)
  for (const name of NAMES)
  for (const incline of INCL)
  for (const sidewalk of SIDEWALKS) {
    const tags = { highway, surface };
    if (lit !== undefined) tags.lit = lit;
    if (name) tags.name = name;
    if (incline !== undefined) tags.incline = incline;
    if (sidewalk !== undefined) tags.sidewalk = sidewalk;
    const edge = { from:1, to:2, fromLat:5.65, fromLng:-0.18, toLat:5.66, toLng:-0.17,
                   distance:D, tags };
    const r = calculateEdgeCost(edge, PROFILES[pkey], period, false, 12, mode, 0, 0, undefined, []) / D;
    if (r < min) { min = r; where = { pkey, period, highway, surface }; }
  }
  return { min, where };
}

console.log("A* heuristic admissibility check\n");
console.log("Admissible requires:  scale <= min(cost/distance)   for that mode.\n");
console.log("mode      floor      scale    margin   verdict");

let failed = 0;
for (const mode of MODES) {
  const { min, where } = measureFloor(mode);
  const scale = HEURISTIC_ADMISSIBILITY_SCALE[mode] ?? DEFAULT_HEURISTIC_SCALE;
  const ok = scale <= min;
  if (!ok) failed++;
  const margin = min > 0 ? `${(100 * (1 - scale / min)).toFixed(1)}%` : "n/a";
  console.log(
    `${mode.padEnd(9)} ${min.toFixed(4)}   ${String(scale).padEnd(7)} ${margin.padEnd(8)} ` +
    `${ok ? "OK" : "FAIL — heuristic is INADMISSIBLE"}`
  );
  if (!ok) {
    console.log(`          worst case: profile=${where.pkey} period=${where.period} ` +
                `highway=${where.highway} surface=${where.surface}`);
  }
}

console.log("");
if (failed > 0) {
  console.error(`FAILED: ${failed} mode(s) can return a suboptimal route.`);
  console.error("Lower the scale in HEURISTIC_ADMISSIBILITY_SCALE to at or below the measured floor.");
  process.exit(1);
}
console.log("All modes admissible. A* is guaranteed to return the optimal route under this cost model.");
