import { test, expect } from "@playwright/test";
import { signIn, delay } from "./helpers.js";

// Regression guards for the safety-notice placement.
//
// The notice used to be a `position: fixed` overlay pinned to the bottom of the
// viewport at z-index 1000, mounted outside .ug-root with hard-coded dark
// colours. On phones the route profile bar is *also* pinned to the bottom and
// spans the full width, so the notice sat on top of it and swallowed every tap on
// Standard / Accessible / Night Safety / Fastest.
//
// It now has two placements:
//   mobile  — in normal flow inside the legend sheet, above the profile bar
//   desktop — a map overlay bottom-left, clear of the 440px side panel
//
// The assertions use elementFromPoint rather than comparing bounding boxes, so
// they test what is genuinely painted and clickable at the button's centre —
// that catches ANY overlay covering the control, not just this one.

const PROFILES = ["standard", "accessible", "night", "fastest"];

/** What element is actually painted at the centre of `locator`? */
async function topElementAt(locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      reachable: top === el || el.contains(top),
      blocker: top ? `${top.tagName.toLowerCase()}.${String(top.className || "")}` : "none",
      cx,
      cy,
    };
  });
}

async function expectProfilesClickable(page, state) {
  for (const key of PROFILES) {
    const btn = page.locator(`.legend-profile-btn[data-profile="${key}"]`);
    await expect(btn, `${key} should be visible (${state})`).toBeVisible();
    const hit = await topElementAt(btn);
    expect(
      hit.reachable,
      `[${state}] "${key}" is not clickable — covered by ${hit.blocker} at (${Math.round(hit.cx)}, ${Math.round(hit.cy)})`,
    ).toBe(true);
  }
}

test.describe("mobile / PWA — safety guidance is inline in the legend", () => {
  test("never covers the route profile buttons", async ({ page }) => {
    await signIn(page);
    await page.waitForSelector(".legend-profiles-bar-inline", { timeout: 20000 });
    await page.waitForSelector(".safety-notice", { timeout: 20000 });
    await delay(500);

    // The structural fix: in normal flow, not a viewport-pinned overlay.
    await expect(page.locator(".safety-notice")).toHaveClass(/safety-notice--inline/);
    const position = await page
      .locator(".safety-notice")
      .evaluate((el) => getComputedStyle(el).position);
    expect(position, "mobile safety notice must not be fixed").not.toBe("fixed");

    await expectProfilesClickable(page, "collapsed");

    await page.locator(".safety-notice-toggle").click();
    await delay(350);
    await expectProfilesClickable(page, "expanded");
  });

  test("expanding it does not push the profile bar off-screen", async ({ page }) => {
    await signIn(page);
    await page.waitForSelector(".legend-profiles-bar-inline", { timeout: 20000 });
    await page.waitForSelector(".safety-notice-toggle", { timeout: 20000 });
    await delay(500);

    await page.locator(".safety-notice-toggle").click();
    await delay(400);

    const box = await page.locator(".legend-profiles-bar-inline").boundingBox();
    const viewport = page.viewportSize();

    expect(box, "profile bar should still be laid out").not.toBeNull();
    expect(box.y + box.height, "profile bar extends past the viewport bottom")
      .toBeLessThanOrEqual(viewport.height + 1);
    expect(box.y, "profile bar was pushed above the viewport top").toBeGreaterThanOrEqual(-1);

    const noticeBox = await page.locator(".safety-notice").boundingBox();
    expect(noticeBox.y, "safety notice starts above the viewport").toBeGreaterThanOrEqual(-1);
  });
});

test.describe("desktop — safety guidance floats on the map", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders bottom-left and stays clear of the profile bar", async ({ page }) => {
    await signIn(page);
    await page.waitForSelector(".legend-profiles-bar-inline", { timeout: 20000 });
    await page.waitForSelector(".safety-notice", { timeout: 20000 });
    await delay(500);

    await expect(page.locator(".safety-notice")).toHaveClass(/safety-notice--map/);

    // Bottom-left of the map...
    const notice = await page.locator(".safety-notice").boundingBox();
    const viewport = page.viewportSize();
    expect(notice.x, "map notice should hug the left edge").toBeLessThan(40);
    expect(notice.y + notice.height, "map notice should hug the bottom edge")
      .toBeGreaterThan(viewport.height - 60);

    // ...and clear of the profile bar, which lives in the right-hand panel.
    const bar = await page.locator(".legend-profiles-bar-inline").boundingBox();
    const overlaps =
      notice.x < bar.x + bar.width &&
      notice.x + notice.width > bar.x &&
      notice.y < bar.y + bar.height &&
      notice.y + notice.height > bar.y;
    expect(overlaps, "map notice overlaps the desktop profile bar").toBe(false);

    // Expanding must not break that either.
    await page.locator(".safety-notice-toggle").click();
    await delay(350);
    await expectProfilesClickable(page, "desktop expanded");
  });

  test("expanded guidance is not covered by the floating map buttons", async ({ page }) => {
    await signIn(page);
    await page.waitForSelector(".floating-glass-container", { timeout: 20000 });
    await page.waitForSelector(".safety-notice-toggle", { timeout: 20000 });
    await delay(500);

    await page.locator(".safety-notice-toggle").click();
    await delay(400);

    const notice = await page.locator(".safety-notice-body").boundingBox();
    const floating = await page.locator(".floating-glass-container").boundingBox();

    const overlaps =
      notice.x < floating.x + floating.width &&
      notice.x + notice.width > floating.x &&
      notice.y < floating.y + floating.height &&
      notice.y + notice.height > floating.y;
    expect(overlaps, "expanded guidance overlaps the floating button group").toBe(false);

    // The floating buttons must also remain genuinely clickable.
    const firstBtn = page.locator(".floating-glass-container button").first();
    await expect(firstBtn).toBeVisible();
    const hit = await topElementAt(firstBtn);
    expect(hit.reachable, `floating button covered by ${hit.blocker}`).toBe(true);

    // And the popover must clear the legend panel on the right.
    const panel = await page.locator(".legend-profiles-bar-inline").boundingBox();
    expect(
      notice.x + notice.width,
      "expanded guidance runs under the legend panel",
    ).toBeLessThanOrEqual(panel.x);
  });
});
