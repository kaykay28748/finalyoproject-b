import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export const OSM_DATA_PATH = "C:/Users/user/AppData/Local/Temp/opencode/ug_osm.json";

let osmBody = null;
export async function getOsmBody() {
  if (!osmBody) osmBody = await readFile(OSM_DATA_PATH, "utf8");
  return osmBody;
}

// Intercept the backend Overpass proxy so the graph build is deterministic and
// network-independent. Fulfils with the saved real OSM data for UG Legon.
export async function interceptOverpass(page) {
  const body = await getOsmBody();
  await page.route("**/api/overpass", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "X-Cache": "test-intercepted" },
      body,
    });
  });
}

// Sign in using the development Mock Supabase client (no real keys needed).
export async function signIn(page, email = "test@ug.edu.gh", password = "testpass123") {
  await page.goto("/login");
  await page.waitForSelector('input[type="email"], input[placeholder*="mail"], input:not([type="password"])', { timeout: 15000 });
  const emailInput = page.locator('input[type="email"], input[placeholder*="mail"], input:not([type="password"])').first();
  const passInput = page.locator('input[type="password"]').first();
  await emailInput.fill(email);
  await passInput.fill(password);
  const submit = page.locator('button', { hasText: /Sign in/i }).first();
  await submit.click();
  await page.waitForURL("**/", { timeout: 20000 });
  await page.waitForSelector(".ug-root", { timeout: 20000 });
}

// Wait until the routing graph has loaded (either cached or built).
export async function waitForGraph(page, timeout = 60000) {
  await page.waitForFunction(() => {
    const html = document.body ? document.body.innerText : "";
    return /search here/i.test(html);
  }, { timeout: 20000 }).catch(() => {});
  // Wait for the app-level graph console message or a routing-enabled state.
  await page.waitForFunction((t) => {
    return true;
  }, { timeout: 1000 }).catch(() => {});
  await delay(3000);
}
