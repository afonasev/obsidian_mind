import { expect, test } from "@playwright/test";

// localStorage key of the web build's implicit vault (see WEB_VAULT_STORAGE_KEY).
const WEB_VAULT_KEY = "obsidian-mind-web-vault";

test("starts with no vault, opens one and lets the user build a graph", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");

  // NoVault: the open invitation is shown and there is no space list / create button.
  await expect(page.getByText("Откройте директорию-vault, чтобы начать работу")).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать пространство" })).toHaveCount(0);

  await page.getByRole("button", { name: "Открыть директорию-vault" }).click();
  // Loaded: the create button appears; the invitation is gone.
  await expect(page.getByRole("button", { name: "Создать пространство" })).toBeVisible();
  await expect(page.getByText("Откройте директорию-vault, чтобы начать работу")).toHaveCount(0);

  await page.getByRole("button", { name: "Создать пространство" }).click();
  const input = page.getByLabel("Имя пространства");
  await input.fill("Идеи");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Идеи", exact: true })).toBeVisible();

  await page.dblclick(".react-flow__pane", { position: { x: 320, y: 240 } });
  await page.keyboard.type("Корень");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cloud-node-text")).toHaveText("Корень");
});

test("re-reading from disk picks up an external change to a note body", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");
  await page.getByRole("button", { name: "Открыть директорию-vault" }).click();

  await page.getByRole("button", { name: "Создать пространство" }).click();
  const input = page.getByLabel("Имя пространства");
  await input.fill("Заметки");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: "Заметки", exact: true })).toBeVisible();

  // A node with a body — only nodes with a body get a `.md` note on disk.
  await page.dblclick(".react-flow__pane", { position: { x: 320, y: 240 } });
  await page.keyboard.type("Тема");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cloud-node-text")).toHaveText("Тема");
  await page.getByRole("button", { name: "Добавить заметку…" }).click();
  await page.getByLabel("Тело узла (markdown)").fill("Тело-один");
  // Blur to commit and switch to view mode.
  await page.getByLabel("Имя узла").click();
  await expect(page.getByRole("button", { name: /Тело узла/ })).toContainText("Тело-один");

  // Let the debounced autosave persist the note to the (localStorage) vault.
  await page.waitForTimeout(400);

  // Simulate an external editor changing the note body on disk.
  const hadBody = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      return false;
    }
    localStorage.setItem(key, raw.replace("Тело-один", "Тело-два"));
    return raw.includes("Тело-один");
  }, WEB_VAULT_KEY);
  expect(hadBody).toBe(true);

  await page.getByRole("button", { name: "Перечитать с диска" }).click();

  // Refresh clears the selection — re-select the node and confirm the new body.
  await page.getByTestId("cloud-node-text").click();
  await expect(page.getByRole("button", { name: /Тело узла/ })).toContainText("Тело-два");
});
