# Routing Safety & Cost Calibration

How the cost function in `frontend/src/services/costFunction.js` decides what a
"safe" route is, what was wrong with it, what changed, and — importantly — which
numbers are still **not** defensible.

Read this before changing any weight or multiplier in that file.

---

## 1. The core idea

Every edge of the road graph gets a cost. A* then finds the cheapest path. The
cost is not distance; it is distance bent by a set of multipliers that reflect
what the app believes makes a path pleasant, accessible or safe.

The final cost is assembled in `calculateEdgeCost()`:

```
baseCost = distance
         × campusBonus
         × highwayCost          // road class
         × surfaceCost          // unpaved, mud, gravel…
         × inclineCost          // gradient
         × sidewalkCost         // no pavement
         × lightingCost         // dark, or of unknown lighting
         × trafficCost          // busyness — sign flips at night
         × gateCost             // access restrictions
         × shadeCost            // heat
         × exposedCost          // storm / open ground
         × reportPenalty        // community-verified hazards

finalCost = baseCost + turnPenalty + directionPenalty
```

Four profiles apply different weights to the same factors. Those weights are the
part most likely to be wrong, and the part with the least support behind it.

---

## 2. What was broken, and why each one mattered

These were not stylistic issues. Each was a case of the interface telling the
user something the code was not doing.

### 2.1 Weather was never applied to routes

`findShortestPath()` built its context without weather and passed `undefined`
into `calculateEdgeCost()`. The default parameter then supplied `1.0` for every
weather factor, so the entire weather block was dead code.

Meanwhile `WeatherBanner` rendered **"🌧️ Routing adjusted for conditions"** and
the voice guidance *said it aloud*. A user in heavy rain was told the route had
been adapted for the rain. It had not been.

The multipliers existed the whole time and were correct — `getWeatherMultipliers()`
distinguishes heavy rain (unpaved ×3.0) from light rain (×1.5), storm, snow, fog
and heat. They were simply never connected. The chain had four hops and every
one of them dropped the value:

```
useWeather → getAllRoutes → findShortestPath → buildRouteContext → calculateEdgeCost
```

**Fixed:** threaded through all four. Verified: heavy rain on a dirt road now
costs **2.94×** the dry cost (target 3.0×); fog at night **1.48×** clear.

### 2.2 The night traffic term was mathematically inert

```js
return 1 + (baseMultiplier - 1) * trafficWeight;
```

At night `baseMultiplier` was set to `1.0`, so the expression collapses to `1.0`
for **every** weight. The Night Safety profile's `traffic` weight did nothing
whatsoever after dark — the exact condition the profile exists for.

Worse, the function checked `if (weekend)` *before* `timePeriod`. On a Saturday
night `baseMultiplier` became `1.1`, giving `1 + 0.1 × 0.8 = 1.08` — weakly
active **and backwards**, penalising the busy roads the profile is meant to
prefer.

The designer's intent had been to lean on busyness rather than the unreliable
`lit` tag at night. That intent was correct; the arithmetic silently deleted it.

**Fixed:** evaluate night before the weekend branch, and invert the sign. At
night the hazard is isolation, not congestion. Isolated roads now cost **2.18×**
busy ones on the Night profile.

### 2.3 A missing `lit` tag was scored as darkness

```js
const isUnlit = litTag === "no" || litTag === undefined;   // before
```

`lit` is a boolean with patchy OSM coverage, so "no tag" and "tagged dark" are
very different claims being treated as identical. On the Night profile
(`lighting: 3.0`) an untagged road scored `4.0` — the same as a confirmed dark
alley. That drowned out the busyness signal above, because the lighting term was
so loud it swamped everything.

**Fixed:** tri-state. Known-lit scores nothing, known-dark takes the full
penalty, untagged takes a defined fraction.

### 2.4 `lit` has more values than yes and no

Per the [OSM wiki on `key:lit`](https://wiki.openstreetmap.org/wiki/Lit), the
tag is not a boolean. The table shows the **severity multiplier applied to the
profile's `lighting` weight**, where `0` means no penalty and `1.0` means the
full penalty. (This is the internal scale; it is *not* the resulting cost ratio
— see the measured figures below.)

| Value | Meaning | Before | After |
|---|---|---|---|
| `yes` | lights installed | 0 | 0 |
| `24/7` | always on | 0 | 0 |
| `automatic` | **motion-triggered** | 0 ⚠️ | 0.75 |
| `limited` | **part-night only** | 0 ⚠️ | 0.75 |
| *untagged* | unknown | **1.0** ⚠️ | 0.5 |
| `no` | no artificial light | 1.0 | 1.0 |
| `disused` | **installed but broken** | 0 ⚠️ | 1.0 |

Measured on a 100 m residential edge at 23:00 on the Night profile
(`lighting: 3.0`), as a multiple of the `lit=yes` cost:

| `lit` | Cost | Multiple |
|---|---|---|
| `yes` / `24/7` | 117.9 | 1.00× |
| *untagged* | 282.9 | 2.40× |
| `limited` / `automatic` | 365.4 | 3.10× |
| `no` / `disused` | 447.9 | 3.80× |

`disused` was the dangerous one: broken lights provide less usable light *and*
a false sense of security, and the app was scoring those paths as **fully lit** —
identical to a street with working lamps. Before the fix, `yes`, `24/7`,
`automatic`, `limited` and `disused` all resolved to the same cost.

Note the ordering requirement this encodes: `untagged` (0.5) must land *between*
`yes` (0) and `no` (1.0), while `disused` (1.0) must land at the *same* place as
`no`, not above it. Absent evidence of a light is not evidence of no light, but a
broken fixture is evidence of no working light.

### 2.5 A crash in the gate path

```js
const { UG_GATES } = require("./gateSchedule");   // before
```

`require()` does not exist in an ESM bundle. This threw a `ReferenceError` for
any edge touching a registered gate node — and `calculateRoutes()` wraps
everything in a `try/catch` that only logs, so **routes near gates silently
failed to calculate**. `UG_GATES` is now imported statically.

### 2.6 The A\* heuristic was not admissible

The old comment read:

> *A\* admissible heuristic: straight-line distance to destination. Must be <= actual
> cost to guarantee optimality. We use raw distance (no multipliers) so it never
> over-estimates.*

The conclusion is right; the reasoning is inverted, and the conclusion is false.

Haversine distance is a lower bound on the **length** of a path, and therefore on
its cost — but only while no edge costs less than its own length. That does not
hold here. `calculateEdgeCost()` applies sub-1.0 multipliers:

| Multiplier | Value | Applies to |
|---|---|---|
| `CAMPUS_CORE_BONUS` | **0.85** | any road named in `CAMPUS_CORE_ROADS`, **including on foot** |
| `HIGHWAY_BASE_COST_BICYCLE.cycleway` | 0.70 | bicycle only |
| `HIGHWAY_BASE_COST_JOGGING.footway` / `.path` | 0.90 | jogging only |

So a road named "Nsia Road" costs 0.85× its length. A path through it can cost
less than the straight line `h` treated as a floor, and A\* can return a
suboptimal route. Leaving `h` unscaled is precisely what allows the
overestimate — the multipliers sit on the edge-cost side, not the heuristic side.

**Fixed** by scaling `h` by a measured per-mode admissibility factor. The floor
was not estimated; it was measured by brute-forcing every combination of highway
type, surface, `lit` value, road name, incline, sidewalk tag, profile and time
period through `calculateEdgeCost()` and taking the minimum of `cost / distance`:

| Mode | Measured floor | Scale used | Margin |
|---|---|---|---|
| walk | 0.7225 | 0.70 | 3.1% |
| bicycle | 0.4879 | 0.45 | 7.8% |
| jogging | 0.6885 | 0.65 | 5.6% |
| vehicle | 0.8500 | 0.80 | 5.9% |

Each floor is set by `CAMPUS_CORE_BONUS` on the `fastest` profile — the loosest
combination available, so these are worst cases rather than typical ones. Scales
sit below their floors to leave headroom for tags added later.

`scripts/verify-heuristic-admissibility.mjs` re-derives the floors from the real
cost function and exits non-zero if any scale drifts above its floor, so a later
change to the cost model cannot silently reintroduce this.

```bash
cd frontend
npx esbuild scripts/verify-heuristic-admissibility.mjs --bundle \
  --platform=node --format=esm --outfile=scripts/.tmp-verify.mjs
node scripts/.tmp-verify.mjs
```

Worth being precise about the impact: this is a **route-quality** bug, not a
safety one. A suboptimal path is still a path the cost model considers safe; the
model is what carries the safety claim, not A\*'s exactness. The exposure was to
the "optimal route" claim, not to user safety.

### 2.7 The interface outran the implementation

| Claim | Reality |
|---|---|
| "🌧️ Routing adjusted for conditions" | weather never entered the cost |
| Night: "poorly lit routes are avoided" | untagged treated as dark; term inert at night |
| "Prioritises well-lit, busy roads" | `traffic: 0.8` was lower than Standard's `1.3` — actively de-weighting the signal |
| Community hazard markers | a failed feed silently dropped *every* penalty while the badge still said "Night Safety" |
| Silent | start/destination snapped up to **1.1 km** to the nearest node, unmentioned |

A disclaimer does not cure a false statement. If the app says it adjusted for
rain and it did not, a user who slips has a claim against the *statement*, not
the estimate. Fixing the claims removes the exposure for free.

---

## 3. The evidence base

Local empirical calibration is **not currently possible**, and the reason is
structural rather than a shortage of users. There is no outcome signal anywhere
in the system: no arrival events, no abandonment events, no record of whether a
route actually passed a reported hazard, and `route_segments` cannot be joined
back to a road (it stores only a lat/lng bucket, no way or edge identity). The
dev database holds 7 synthetic heatmap rows, 0 route logs and 1 hand-seeded
report. Observing that nobody traversed a cell cannot distinguish *"correctly
avoided because dangerous"* from *"there was no alternative"*.

So the constants are grounded in published work instead, with the reasoning
recorded next to each number so it can be re-examined.

| Constant | Value | Source |
|---|---|---|
| Incline penalty | 1 + 0.10 × slope % | Meeder, Aebi & Weidmann (2017), *Transp. Res. Procedia* 27:141-147 — logit fit to live pedestrian counts; a 1% slope increase makes a walk ~10% less attractive |
| Turn penalty (u-turn) | 50 m | Lieu & Guhathakurta (2025), *Transp. Res. Part A* 181:104437 — each turn ≈ 50 m of lost route utility |
| Night direction | vacant land deters | Sevtsuk et al. (2021), *Cities* (MIT 1721.1/139842) — vacant land significantly decreased likelihood of choosing a route **at night** |
| "Presence of others" | after-dark safety theme | *J. Urban Design* 10.1057/s41289-020-00134-6 |
| Lighting ↔ felt safety | 20-35% unsafe at low light, <1% at high | Portnov et al. (2020), *PLOS ONE* 15(11):e0242172 |
| Lighting changes route choice | participants switched to better-lit paths | Breda et al. (2025), *NightLight*, CHI (doi 10.1145/3706598.3714299) — qualitative study, n=13 |

**On that last row, an honesty note.** An earlier draft of this document cited a
specific figure — "69% of routes switched to a better-lit path" — attributed to
NightLight. On checking the source, that number does **not** appear in the
paper's abstract; it appears to have come from a third-party summarisation site.
It has been removed rather than kept with a hedge. The paper's own claim is
qualitative: a 13-participant study found "people changed their routes in
preference of well-light routes during nighttime walking."

Two further caveats on this table as a whole:

- NightLight is a **13-participant qualitative study**. It establishes that
  lighting affects route choice. It cannot and does not quantify the effect, and
  n=13 is far too small to support a coefficient. Treat it as evidence for
  *direction only*.
- The reference illuminance levels often quoted for this work (residential
  minimums, commercial minimums, crossing levels) are **not reproduced here**
  because they were not verified against the primary text during this pass. If
  you want to use them — for example to argue that a street lighting type is
  below a safety threshold — read them out of the paper itself
  (`par.nsf.gov/servlets/purl/10635625`) and cite the page. Do not take a lux
  figure from a summary, which is exactly the mistake described above.


---

## 4. What is still NOT defensible

This is the section that matters most. Do not let these drift back into looking
authoritative.

### 4.1 Risk appetite is not a constant

`NIGHT_ISOLATION_PENALTY` and every profile `traffic` weight answer the question
*"how much extra distance will this user accept for a better-lit route?"*

That is a **value judgement, not a physical fact**. The literature establishes
the direction of the effect but never its magnitude — and it indicates the
magnitude is not uniform across people. NightLight's own framing is that
nighttime sidewalk illumination has "a significant and **unequal** influence on
where and whether pedestrians walk at night"; demographic-stratified route-choice
work (Lieu & Guhathakurta 2025) likewise reports differing preferences by group.

**The honest limit:** this document does not currently have a verified statistic
for how much larger the night-safety concern is for any particular group. The
qualitative claim — that the strength of night-safety preference varies between
people — is well supported. Any specific multiplier on that variation would be
another guess, and is deliberately absent here. If you need one, go to the
stratified studies directly.

A single constant answers the risk-appetite question for every user, including
people for whom it is wrong. The strongest available improvement is to expose it
as a user-facing preference — *"how much extra distance will you accept for a
better-lit route?"* — defaulting to the current value. Until then, treat these
numbers as a product decision and review them like one.

### 4.2 `lit` coverage: measured, and it changes the picture

This was previously an assertion ("OSM `lit` tagging is too patchy to rely on").
It is now measured, by `frontend/scripts/measure-lit-coverage.mjs`, over the
exact bbox and highway classes `graphBuilder.js` requests
(`5.62,-0.21,5.672,-0.175`, 15 classes). 1958 ways returned:

| Class | Ways | With `lit` | Coverage |
|---|---:|---:|---:|
| service | 954 | 2 | 0.2% |
| residential | 469 | 16 | 3.4% |
| path | 199 | 1 | 0.5% |
| footway | 119 | 6 | 5.0% |
| tertiary | 69 | 9 | 13.0% |
| unclassified | 63 | 2 | 3.2% |
| secondary | 46 | 9 | 19.6% |
| track | 23 | 0 | 0.0% |
| steps | 6 | 0 | 0.0% |
| tertiary_link | 5 | 1 | 20.0% |
| secondary_link, pedestrian | 4 | 0 | 0.0% |
| **Total** | **1958** | **46** | **2.3%** |

Restricted to the 1904 ways a pedestrian can actually be routed along:

| | Count | Share |
|---|---:|---:|
| any `lit` tag | 36 | 1.9% |
| positively lit (`yes` / `24/7`) | 29 | 1.5% |
| known dark (`no`) | 7 | 0.4% |
| **no `lit` tag at all** | **1868** | **98.1%** |

Tag coverage across the same ways, for comparison:

| Tag | Coverage | Consequence |
|---|---:|---|
| `highway` | 100% | the only fully-covered factor; road class is the model's real backbone |
| `surface` | 33.7% | usable, but two-thirds untagged |
| `lit` | 2.3% | effectively absent |
| `sidewalk` | 2.3% | effectively absent |
| `incline` | 0.3% (5 ways) | effectively absent |

#### What this invalidates

**The `disused` / `limited` / `automatic` handling added in §2.4 will never fire
here.** All 46 tagged ways in the entire area use only `yes` (37) or `no` (9).
The OSM semantics are implemented correctly, but for University of Ghana they
are dead branches. They are worth keeping — the code is right, and other
deployments will have them — but they should not be credited with improving
routing *here*.

**The slope table from §3 is also nearly inert.** `incline` appears on 5 of 1958
ways. The Meeder-derived penalties are correct and will matter wherever incline
is mapped; in this bbox they almost never apply.

#### The consequence that actually matters

With 98.1% of pedestrian-usable ways untagged, the lighting term is not
discriminating between lit and unlit roads. It is applying one multiplier to
almost the entire network:

| `lit` value | Night-profile lighting cost | Ways |
|---|---:|---:|
| `yes` / `24/7` | 1.00× | 1.5% |
| untagged | 2.50× | 98.1% |
| `no` | 4.00× | 0.4% |

Note the direction this points. Because `UNKNOWN_LIT_PENALTY_RATIO` is 0.5, an
untagged road is penalised 2.5× while a `lit=yes` road is penalised not at all —
so **the model actively steers away from 98.1% of the network in order to reach
the 1.5% it has evidence about.** On a real street that is lit but untagged, the
Night profile can prefer a long detour to reach one of 29 tagged ways.

Whether that is correct is a genuine open question, and it cuts against a rule
stated in §7 of this document: *"unknown is not negative."* Absence of a tag is
a gap in the data, not an observation about the world — and at 98.1% coverage,
the "unknown" bucket is not a marginal uncertainty, it is the dataset. The 0.5
midpoint between lit and dark is only a meaningful interpolation if the
population is split between the two, and here it is not: known-lit is 1.5% and
known-dark is 0.4%.

**This is not resolved here, deliberately.** Options and their trade-offs:

- Keep 0.5. Safety-forward, but the term then mostly penalises *missing data*
  rather than darkness, and 2.5× on 98% of edges is a large influence for
  something that is usually uniform.
- Lower it substantially (e.g. 0.15–0.25), so the term discriminates mainly
  through the known-lit and known-dark minorities and treats the untagged mass
  as close to neutral.
- Drop the unknown penalty entirely and let the Night profile run on road class
  plus the night-isolation term — the two factors with real coverage, and the
  one the literature actually supports (vacant land, presence of others).

All three change night routing behaviour, so the choice belongs to whoever owns
the product's safety posture, not to a code cleanup. Whichever is chosen, the
profile description should carry the real number rather than the word
"incomplete".

The 12 hand-written edges from `addManualPedestrianConnections()` and any
synthetic edges from `connectNearbyNodes()` have no `lit` tag, so they sit on
top of these totals as guaranteed-untagged.

Re-measure with:

```bash
cd frontend
node scripts/measure-lit-coverage.mjs
```

Coverage is a moving target — OSM tagging improves — so treat any number here as
a dated observation, not a constant. Re-run before relying on it.

### 4.3 Other ungrounded numbers still in the file

- The `1.5×` / `2.0×` extra incline multipliers for bicycle and jogging
- The Accessible profile's `incline: 3.0` weight
- `SNAP_WARN_METERS = 100` in `App.jsx` — `useGeolocation` *does* capture the
  browser's `accuracy` field, then discards it. Wiring it through would let this
  threshold be set from the real GPS error distribution.
- The intermediate turn-penalty values (5 / 15 / 30 m) — only the 50 m u-turn
  anchor is sourced; the shape between is assumed.
- The slope table **flattens above 15%**, where the source formula would keep
  rising (3.5× at a 25% gradient). A deliberate conservative cap, but a
  divergence from the paper.

---

## 5. Known structural limitations

Resolved items have moved to §2. What remains:

- **`walk.blockedRoads` includes `primary` and `secondary`.** Pedestrians can
  never be routed on the main roads, so the Night profile's "prefer busy roads"
  signal only reaches `footway` / `pedestrian` / `residential`. Probably correct
  for safety, but it makes "busy roads" weaker than the label implies.
- **`BUSY_AREA_TYPES` includes `residential`,** a weak proxy for busy-after-dark.
  The literature points at *land use* (vacant vs developed) rather than traffic,
  which we do not have. Narrowing the list beats tuning the coefficient.
- **The 12 fabricated footway edges** in `graphBuilder.js` have invented surface
  values and no lighting, incline or sidewalk tags, so they always score as
  unknown-and-untagged. They also skew any `lit`-coverage measurement (§4.2) and
  should be excluded from it.
- **The service worker is never registered.** `sw.js` exists but nothing calls
  `navigator.serviceWorker.register`, and it bypasses all `/api` traffic. The
  PWA offline story does not currently hold, and any server-pushed notice would
  not reach offline users — which is why the safety notice is bundled in the app
  shell. *(Deliberately left as-is for now.)*
- **`logRouteSegments()` is not called, and should stay that way** unless the
  schema changes. It would write *offered* routes into `route_segments`, the same
  table `gpsPings.flush()` writes *observed* positions into. Merging them makes
  the aggregate unable to answer either "where do people walk?" or "do they
  avoid what we tell them to avoid?". Separating them needs a `source` column or a
  second table — a migration, not a wiring change. Reasoning is recorded at the
  function so nobody connects it casually.
- **`confirmReport()` is not called from the UI.** The backend endpoint is fully
  implemented, including an 80 m physical-presence check, and its output feeds
  `VERDICT_SIGNALS.CONFIRMATION_CONFIDENCE` in the decision feed. Because
  nothing calls it, `confirmers` is always 0 and that branch of the report
  weighting never contributes — reports are effectively single-source, which
  matters because corroboration is the only signal distinguishing a real
  obstacle from one report's worth of noise. This needs a UI affordance, and it
  changes routing confidence, so it is a product decision rather than a fix.
- **`resetHeatmapSession()` is a functional no-op** — it clears a dedup `Set`
  that only `logRouteSegments()` populates, and that is never called.

---

## 6. Verifying a change

The cost function is pure, so it can be exercised directly. Put a scratch file
in `frontend/`, bundle it with the esbuild that ships with Vite, and run it:

```bash
# frontend/
npx esbuild __verify.mjs --bundle --platform=node --format=esm --outfile=__verify.bundle.mjs
node __verify.bundle.mjs
```

```js
import { calculateEdgeCost, PROFILES } from "./src/services/costFunction.js";

const edge = {
  from: 1, to: 2,
  fromLat: 5.65, fromLng: -0.18, toLat: 5.651, toLng: -0.181,
  distance: 100,
  tags: { highway: "residential", surface: "asphalt", lit: "yes" },
};

calculateEdgeCost(edge, PROFILES.night, "night", false, 23, "walk", 0, 0, undefined, []);
```

**Gotcha that will waste your time if you miss it:** every tag is read from
`edge.tags`, not from top-level edge properties. `highwayType` is
`edge.tags.highway || edge.type || "residential"`, and `surface` is
`edge.tags.surface`. Passing `edge.highwayType` silently falls through to
`residential` and every result looks plausible but is wrong.

---

## 7. Rules for changing this file

1. **Never raise a constant silently.** If you change a number, state the source
   or state plainly that it is a judgement call.
2. **Direction may be cited; magnitude usually cannot.** Route-choice
   literature reliably establishes *which way* an effect points and almost never
   *how strong* it is.
3. **"Unknown" is not "negative."** Absence of a tag is a gap in the data, not an
   observation about the world.
4. **If the UI says it, the code must do it.** The description attached to a
   profile is a specification. If you change the weights, change the string.
5. **Prefer disclosure over reassurance.** Telling a user which roads were
   avoided, and which data was missing, is worth more than a claim that the route
   is safe.
6. **After changing any multiplier, re-run the admissibility check.** Sub-1.0
   multipliers are what break the A\* lower bound. If you add another, the floor
   in §2.6 may move and `scripts/verify-heuristic-admissibility.mjs` will fail
   until the scale is lowered to match.
7. **A factor with no coverage is not a factor.** Before tuning a weight, check
   how many ways in the deployment bbox actually carry the tag it reads. `lit`
   is on 2.3% of ways and `incline` on 0.3% (§4.2), so both terms are close to
   inert here no matter how they are tuned. Measure first with
   `scripts/measure-lit-coverage.mjs`; a beautifully-sourced coefficient on a tag
   nobody has mapped is decoration.
