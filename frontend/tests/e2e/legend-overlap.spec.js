import { test, expect } from "@playwright/test";
import { signIn, delay } from "./helpers.js";

// Regression guard for the reported mobile bug.
//
// The safety notice used to be a `position: fixed` overlay pinned to the bottom
// of the viewport at z-index 1000. The route profile bar is *also* pinned to
// the bottom of the viewport, so on a phone the notice sat directly on top of
// it and swallowed every tap on Standard / Accessible / Night Safety / Fastest.
//
// Playwright's configured viewport is 390x844, i.e. the phone case that broke.
//
// The assertions deliberately use elementFromPoint rather than comparing
// bounding boxes: that tests what is actually painted and clickable at the
// button's centre, so it catches ANY overlay covering the control, not just
// this one.
test.describe("legend chrome / mobile layout", () => {
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

  test("safety guidance never covers the route profile buttons", async ({ page }) => {
    await signIn(page);
    await page.waitForSelector(".legend-profiles-bar-inline", { timeout: 20000 });
    await page.waitForSelector(".safety-notice", { timeout: 20000 });
    await delay(500);

    // 1. The notice must be in normal flow inside the legend sheet, not a
    //    viewport-pinned overlay. This is the structural fix.
    const position = await page
      .locator(".safety-notice")
      .evaluate((el) => getComputedStyle(el).position);
    expect(position, "safety notice must not be a fixed overlay").not.toBe("fixed");

    // 2. Every profile button must be the topmost element at its own centre,
    //    both collapsed and expanded.
    for (const state of ["collapsed", "expanded"]) {
      if (state === "expanded") {
        await page.locator(".safety-notice-toggle").click();
        await delay(350);
      }

      for (const key of PROFILES) {
        const btn = page.locator(`.legend-profile-btn[data-profile="${key}"]`);
        await expect(btn, `${key} button should be visible (${state})`).toBeVisible();

        const hit = await topElementAt(btn);
        expect(
          hit.reachable,
          `[${state}] "${key}" profile button is not clickable — covered by ${hit.blocker} at (${Math.round(hit.cx)}, ${Math.round(hit.cy)})`,
        ).toBe(true);
      }
    }
  });

  test("expanding safety guidance does not push the profile bar off-screen", async ({ page }) => {
    await signIn(page);
    await page.waitForSelector(".legend-profiles-bar-inline", { timeout: 20000 });
    await page.waitForSelector(".safety-notice-toggle", { timeout: 20000 });
    await delay(500);

    await page.locator(".safety-notice-toggle").click();
    await delay(400);

    const bar = page.locator(".legend-profiles-bar-inline");
    const box = await bar.boundingBox();
    const viewport = page.viewportSize();

    expect(box, "profile bar should still be laid out").not.toBeNull();
    expect(box.y + box.height, "profile bar extends past the bottom of the viewport")
      .toBeLessThanOrEqual(viewport.height + 1);
    expect(box.y, "profile bar was pushed above the viewport top").toBeGreaterThanOrEqual(-1);

    // And the notice itself must not be taller than the space it shares.
    const noticeBox = await page.locator(".safety-notice").boundingBox();
    expect(noticeBox.y, "safety notice starts above the viewport").toBeGreaterThanOrEqual(-1);
  });
});
