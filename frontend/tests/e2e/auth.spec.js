import { test, expect } from "@playwright/test";
import { signIn } from "./helpers.js";

test.describe("Auth (development mock Supabase)", () => {
  test("redirects unauthenticated users from the map to /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login", { timeout: 15000 });
    await expect(page.locator("body")).toContainText(/Sign in|Create an account/, { timeout: 10000 });
  });

  test("signs in and lands on the navigator", async ({ page }) => {
    await signIn(page);
    await expect(page.locator(".ug-root")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).toContainText(/search here|3d/i, { timeout: 10000 });
  });

  test("signs out and returns to /login", async ({ page }) => {
    await signIn(page);
    // Navigate to profile page and find logout control
    await page.goto("/profile");
    await page.waitForURL("**/profile", { timeout: 15000 });
    // Bookmark body text to find a sign-out button
    const bodyBefore = await page.locator("body").innerText();
    // Attempt sign out via the auth context using the mock client
    await page.evaluate(async () => {
      const { supabase } = await import("/src/lib/supabase.js");
      await supabase.auth.signOut();
    });
    // Landing page should redirect to login
    await page.goto("/");
    await page.waitForURL("**/login", { timeout: 15000 });
    void bodyBefore;
  });
});
