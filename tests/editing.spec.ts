import { expect, type Page, test } from "@playwright/test";

// These guard a browser-only regression: React Flow renders a freshly-added node
// `visibility:hidden` until it measures it, so focusing the editor input at mount
// dropped focus to <body> and swallowed the first keystrokes. jsdom does not model
// visibility-based focusability, so only an e2e test catches it.

// Roots can only be created inside a workspace, so each test opens one first.
async function openWorkspace(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");
  await page.getByRole("button", { name: "Создать пространство" }).click();
  const input = page.getByLabel("Имя пространства");
  await input.fill("Тест");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Тест", exact: true })).toBeVisible();
}

test("a freshly created node accepts typing immediately", async ({ page }) => {
  await openWorkspace(page);

  await page.dblclick(".react-flow__pane", { position: { x: 320, y: 240 } });
  await page.keyboard.type("Привет");
  await page.keyboard.press("Escape");

  await expect(page.getByTestId("cloud-node-text")).toHaveText("Привет");
});

test("an empty new node is discarded when left without any text", async ({ page }) => {
  await openWorkspace(page);

  await page.dblclick(".react-flow__pane", { position: { x: 320, y: 240 } });
  // Type nothing, then click elsewhere on the empty pane to leave the node.
  await page.mouse.click(820, 620);

  await expect(page.locator('[data-testid^="rf__node-"]')).toHaveCount(0);
});
