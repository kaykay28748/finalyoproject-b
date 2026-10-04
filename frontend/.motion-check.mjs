import { chromium } from "playwright";

const url = "http://127.0.0.1:4181/";
const browser = await chromium.launch();

const markup = (n) => `
  <div class="nav-discovery-shell">
    <span class="nav-discovery-label">Explore campus</span>
    <div class="nav-discovery-categories">
      <button class="nav-discovery-chip nav-discovery-chip--active">
        <svg class="nav-discovery-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"></svg>
        Food<span class="nav-discovery-count">12</span>
      </button>
      <button class="nav-discovery-chip">
        <svg class="nav-discovery-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"></svg>
        Library
      </button>
    </div>
    <div class="nav-discovery-summary"><span>12 food places on map</span>
      <button class="nav-discovery-list-toggle">List</button></div>
    <div class="nav-discovery-selection">
      <button class="nav-discovery-selection-place">
        <span class="nav-discovery-selection-name">Central Library</span>
        <span class="nav-discovery-place-distance">1.2 km from you</span>
      </button>
    </div>
    <div class="nav-discovery-tray">
      <div class="nav-discovery-tray-header">
        <div class="nav-discovery-tray-title"><strong>Food</strong><span>12 places</span></div>
      </div>
      <div class="nav-discovery-list">
        ${Array.from({ length: n }, (_, i) => `
          <div class="nav-discovery-row">
            <button class="nav-discovery-place">
              <span class="nav-discovery-index">${i + 1}</span>
              <span class="nav-discovery-place-copy">
                <span class="nav-discovery-place-name">Place ${i + 1}</span>
                <span class="nav-discovery-place-distance">${i + 1}00 m</span>
              </span>
            </button>
            <button class="nav-discovery-directions">D</button>
          </div>`).join("")}
      </div>
    </div>
  </div>`;

async function probe(reducedMotion) {
  const ctx = await browser.newContext({ reducedMotion });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });

  const res = await page.evaluate((mk) => {
    const root = document.createElement("div");
    root.className = "ug-root dark";
    root.style.height = "auto";
    root.innerHTML = mk;
    document.body.appendChild(root);

    const cs = (sel) => getComputedStyle(root.querySelector(sel));
    const anim = (el) => {
      const a = el.getAnimations()[0];
      if (!a) return null;
      const t = a.effect.getComputedTiming();
      return {
        name: a.animationName,
        duration: Math.round(t.duration),
        delay: Math.round(t.delay || 0),
      };
    };

    const rows = [...root.querySelectorAll(".nav-discovery-row")];
    const out = {
      chipTransition: cs(".nav-discovery-chip").transition,
      chipActiveShadow: cs(".nav-discovery-chip--active").boxShadow,
      chipIdleShadow: cs(".nav-discovery-chip:not(.nav-discovery-chip--active)").boxShadow,
      count: anim(root.querySelector(".nav-discovery-count")),
      tray: anim(root.querySelector(".nav-discovery-tray")),
      list: anim(root.querySelector(".nav-discovery-list")),
      title: anim(root.querySelector(".nav-discovery-tray-title")),
      selection: anim(root.querySelector(".nav-discovery-selection")),
      rowDelays: rows.map((r) => {
        const t = r.getAnimations()[0]?.effect.getComputedTiming();
        return t ? Math.round(t.delay || 0) : null;
      }),
      rowName: anim(rows[0]),
      runningAnimations: document.getAnimations().length,
    };
    root.remove();
    return out;
  }, markup(14));

  await ctx.close();
  return res;
}

const normal = await probe("no-preference");
const reduced = await probe("reduce");

console.log("=== chip transition (role-split) ===");
console.log(normal.chipTransition);
console.log("\n=== elevation on selection ===");
console.log("idle  :", normal.chipIdleShadow);
console.log("active:", normal.chipActiveShadow);
console.log("\n=== entrance choreography ===");
for (const k of ["count", "tray", "list", "title", "selection", "rowName"]) {
  const a = normal[k];
  console.log(`${k.padEnd(11)} ${a ? `${a.name}  ${a.duration}ms  delay ${a.delay}ms` : "NONE"}`);
}
console.log("\n=== row stagger (14 rows) ===");
console.log(normal.rowDelays.join(", "));
console.log("capped?", normal.rowDelays.slice(10).every((d) => d === normal.rowDelays[10]));
console.log("total running animations:", normal.runningAnimations);

console.log("\n=== prefers-reduced-motion: reduce ===");
console.log("chip transition:", reduced.chipTransition);
console.log("row delays:", JSON.stringify(reduced.rowDelays));
console.log("tray animation:", reduced.tray ? reduced.tray.name : "NONE");
console.log("running animations:", reduced.runningAnimations);

await browser.close();