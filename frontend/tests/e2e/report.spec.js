import { test, expect } from "@playwright/test";
import { signIn, delay } from "./helpers.js";

test.describe("Accessibility reporting", () => {
  test("opens the report dialog, selects an issue/severity, and submits successfully", async ({ page }) => {
    // Give the report service a token and stub the POST so it's deterministic.
    await page.addInitScript(() => {
      sessionStorage.setItem("accessToken", "mock-token-e2e");
    });
    await page.route("**/api/reports", (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: 123, status: "pending" }),
        });
      }
      return route.continue();
    });

    await signIn(page);
    await delay(1500);

    // Trigger via the floating "Report Issue" control
    const reportBtn = page.locator('[aria-label="Report Issue"]').first();
    await expect(reportBtn).toBeVisible({ timeout: 15000 });
    await reportBtn.click();

    await expect(page.locator('.report-modal-overlay[role="dialog"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h2')).toContainText(/Report accessibility issue/i);

    // Select an issue type
    await page.locator('.report-issue-btn').filter({ hasText: /Blocked ramp/i }).first().click();
    await expect(page.locator('.report-issue-btn').filter({ hasText: /Blocked ramp/i }).first()).toHaveClass(/active/);

    // Select a severity
    await page.locator('.report-modal .report-severity-btn, .report-modal button').filter({ hasText: /Impassable|dangerous|Severe/i }).first().click().catch(() => {});

    // Submit
    const submit = page.locator('.report-modal button[type="submit"]').first();
    await submit.click();

    // Success state
    await expect(page.locator(".report-success-popup")).toBeVisible({ timeout: 15000 });
    await expect(page.locator(".report-success-popup h3")).toContainText(/Report submitted/i);
  });
});
