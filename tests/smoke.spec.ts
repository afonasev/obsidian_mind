import { expect, test } from "@playwright/test";

test("application loads with the mindmap canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".react-flow")).toBeVisible();
});
