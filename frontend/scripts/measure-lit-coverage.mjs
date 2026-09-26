/**
 * Measures OSM tag coverage for the exact area and highway classes the router
 * consumes, so the "lit tagging is too patchy to rely on" claim in
 * ROUTING_SAFETY.md can be replaced with a number.
 *
 * Scope matches src/services/graphBuilder.js:
 *   bbox     5.62,-0.21,5.672,-0.175
 *   highways cycleway|footway|path|pedestrian|steps|residential|service|track|
 *            bridleway|living_street|unclassified|tertiary|secondary|primary|
 *            tertiary_link|secondary_link
 *
 * `out tags` returns tags only, no geometry, so this stays a small request.
 *
 * This measures upstream OSM only. The 12 hand-written edges in
 * addManualPedestrianConnections() and any synthetic edges from
 * connectNearbyNodes() are added client-side with no `lit` tag, so they sit on
 * top of these numbers as guaranteed-untagged.
 *
 * Run from frontend/:
 *   node scripts/measure-lit-coverage.mjs
 */
const BBOX = "5.62,-0.21,5.672,-0.175";
const HIGHWAYS = "cycleway|footway|path|pedestrian|steps|residential|service|track|" +
                 "bridleway|living_street|unclassified|tertiary|secondary|primary|" +
                 "tertiary_link|secondary_link";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const query = `[out:json][timeout:90];
way["highway"~"${HIGHWAYS}"](${BBOX});
out tags;`;

async function fetchOverpass() {
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        process.stderr.write(`  trying ${new URL(url).host} (attempt ${attempt})...\n`);
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "ug-campus-nav-coverage-audit/1.0",
          },
          body: new URLSearchParams({ data: query }),
        });
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, 5000 * attempt));
          continue;
        }
        if (!res.ok) { process.stderr.write(`  HTTP ${res.status}\n`); continue; }
        return await res.json();
      } catch (err) {
        process.stderr.write(`  ${err.message}\n`);
        await new Promise(r => setTimeout(r, 5000 * attempt));
      }
    }
  }
  throw new Error("all Overpass endpoints failed");
}

const TAGS_OF_INTEREST = ["lit", "sidewalk", "surface", "incline"];

const data = await fetchOverpass();
const ways = data.elements.filter(e => e.type === "way");
console.log(`\nOverpass returned ${ways.length} ways in ${BBOX}\n`);

const byClass = new Map();
const litValues = new Map();
for (const w of ways) {
  const cls = w.tags?.highway ?? "(none)";
  if (!byClass.has(cls)) byClass.set(cls, { total: 0, lit: 0, tags: {} });
  const row = byClass.get(cls);
  row.total++;
  const lit = w.tags?.lit;
  if (lit !== undefined) {
    row.lit++;
    litValues.set(lit, (litValues.get(lit) ?? 0) + 1);
  }
  for (const t of TAGS_OF_INTEREST) {
    if (w.tags?.[t] !== undefined) row.tags[t] = (row.tags[t] ?? 0) + 1;
  }
}

const rows = [...byClass.entries()].sort((a, b) => b[1].total - a[1].total);
const total = ways.length;
const totalLit = rows.reduce((s, [, r]) => s + r.lit, 0);

console.log("`lit` COVERAGE BY HIGHWAY CLASS");
console.log("class".padEnd(18) + "ways".padStart(6) + "lit".padStart(6) + "  coverage");
console.log("-".repeat(52));
for (const [cls, r] of rows) {
  const pct = r.total ? (100 * r.lit / r.total) : 0;
  const bar = "#".repeat(Math.round(pct / 5));
  console.log(cls.padEnd(18) + String(r.total).padStart(6) + String(r.lit).padStart(6) +
              `  ${pct.toFixed(1).padStart(5)}% ${bar}`);
}
console.log("-".repeat(52));
console.log("TOTAL".padEnd(18) + String(total).padStart(6) + String(totalLit).padStart(6) +
            `  ${(100 * totalLit / total).toFixed(1).padStart(5)}%`);

console.log("\nDISTRIBUTION OF `lit` VALUES");
for (const [v, n] of [...litValues.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padEnd(12)} ${String(n).padStart(5)}  ${(100 * n / total).toFixed(1)}% of all ways`);
}

console.log("\nOTHER FACTOR COVERAGE (same ways, for comparison)");
for (const t of TAGS_OF_INTEREST.slice(1)) {
  const n = ways.filter(w => w.tags?.[t] !== undefined).length;
  console.log(`  ${t.padEnd(10)} ${String(n).padStart(5)}  ${(100 * n / total).toFixed(1)}%`);
}

// The decision-relevant cut: what share of ways are *pedestrian-usable*, and of
// those, how many are positively known-lit vs merely not-known-dark.
const PEDESTRIAN = new Set(["footway","path","pedestrian","steps","cycleway",
  "living_street","residential","unclassified","tertiary","service","track","bridleway"]);
const ped = ways.filter(w => PEDESTRIAN.has(w.tags?.highway));
const pedLit = ped.filter(w => w.tags?.lit !== undefined).length;
const pedYes = ped.filter(w => ["yes","24/7"].includes(w.tags?.lit)).length;
console.log("\nPEDESTRIAN-USABLE SUBSET (what a walker can actually be routed along)");
console.log(`  ways                    ${ped.length}`);
console.log(`  any lit tag             ${pedLit}  (${(100 * pedLit / ped.length).toFixed(1)}%)`);
console.log(`  positively lit (yes/24/7) ${pedYes}  (${(100 * pedYes / ped.length).toFixed(1)}%)`);
console.log(`  unknown (no lit tag)    ${ped.length - pedLit}  (${(100 * (ped.length - pedLit) / ped.length).toFixed(1)}%)`);
