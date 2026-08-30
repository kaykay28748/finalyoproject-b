import { test, expect } from "@playwright/test";
import { signIn, delay } from "./helpers.js";

const openVoice = async (page) => {
  const mic = page.locator('button[aria-label*="Voice search"]').first();
  await mic.click();
  await page.locator('.voice-modal').waitFor({ state: "visible", timeout: 10000 });
};

test.describe("Voice search — UI wiring (Web Speech API stubbed)", () => {
  test("shows the unsupported fallback when SpeechRecognition is unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true, writable: true });
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true, writable: true });
    });
    await signIn(page);
    await openVoice(page);
    await expect(page.locator(".voice-error")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".voice-error-msg")).toContainText(/voice search isn't available|isn't supported/i);
  });

  test("mic-denied surfaces a clear permission error with retry", async ({ page }) => {
    // Provide a SpeechRecognition for the modal to consider 'supported', but stub
    // recognition.start() to emit a 'not-allowed' error synchronously.
    await page.addInitScript(() => {
      window.SpeechRecognition = class {
        constructor() { this.continuous = false; }
        start() { setTimeout(() => this.onerror?.({ error: "not-allowed" }), 50); }
        stop() {}
        abort() {}
      };
    });
    await signIn(page);
    await openVoice(page);
    await expect(page.locator(".voice-error")).toBeVisible({ timeout: 10000 });
    await expect(page.locator(".voice-error-msg")).toContainText(/microphone|denied/i);
    const retry = page.locator('button', { hasText: "Try again" }).first();
    await expect(retry).toBeVisible();
  });

  test("transcript is editable and can be committed as the destination", async ({ page }) => {
    // Stub a recognition service that delivers a final transcript shortly after start.
    await page.addInitScript(() => {
      window.SpeechRecognition = class {
        constructor() { this.continuous = false; this.interimResults = true; this.maxAlternatives = 1; this.lang = "en-US"; }
        start() {
          // simulate interim then final results
          const fire = (item) => this.onresult?.({ resultIndex: 0, results: [item] });
          setTimeout(() => fire({ isFinal: false, 0: { transcript: "Balme " } }), 80);
          setTimeout(() => fire({ isFinal: true, 0: { transcript: "Balme" } }), 300);
        }
        stop() { this.onend?.(); }
        abort() { this.onend?.(); }
      };
    });
    await signIn(page);
    await openVoice(page);

    // Final transcript should land in the editable review input
    const reviewInput = page.locator('input[aria-label="Destination from voice"]');
    await expect(reviewInput).toBeVisible({ timeout: 10000 });
    await expect(reviewInput).toHaveValue("Balme", { timeout: 10000 });

    // Commit it as the destination
    await page.locator('button', { hasText: "Use destination" }).first().click();
    await delay(500);
    const destInput = page.locator('input[placeholder="Where to?"]').first();
    await expect(destInput).toHaveValue(/Balme/i, { timeout: 8000 });
  });
});
