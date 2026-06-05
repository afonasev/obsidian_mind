import { expect, type Page, test } from "@playwright/test";

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

/** Create a single root node named `name`; it ends up selected. */
async function createNode(page: Page, name: string): Promise<void> {
  await page.dblclick(".react-flow__pane", { position: { x: 320, y: 240 } });
  await page.keyboard.type(name);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("cloud-node-text")).toHaveText(name);
}

test("writes a markdown body, renders it, and returns to edit", async ({ page }) => {
  await openWorkspace(page);
  await createNode(page, "Тема");

  await page.getByRole("button", { name: "Добавить заметку…" }).click();
  await page.getByLabel("Тело узла (markdown)").fill("# Заголовок\n\n- пункт");
  // Blur to commit and switch to view mode.
  await page.getByLabel("Имя узла").click();

  const body = page.getByRole("button", { name: /Тело узла/ });
  await expect(body.getByRole("heading", { name: "Заголовок" })).toBeVisible();
  await expect(body.getByRole("listitem")).toHaveText("пункт");

  // Clicking the rendered body returns to the raw-markdown editor.
  await body.click();
  await expect(page.getByLabel("Тело узла (markdown)")).toHaveValue("# Заголовок\n\n- пункт");
});

test("editing the body does not trigger canvas hotkeys (Backspace/Enter)", async ({ page }) => {
  await openWorkspace(page);
  await createNode(page, "Тема");

  await page.getByRole("button", { name: "Добавить заметку…" }).click();
  const editor = page.getByLabel("Тело узла (markdown)");
  await editor.click();
  // Type, then use Backspace and Enter inside the textarea. These must edit the
  // body text — not delete the selected node or create a sibling on the canvas.
  await page.keyboard.type("абвX");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Enter");
  await page.keyboard.type("вторая");

  await expect(editor).toHaveValue("абв\nвторая");
  // The single node still exists — Backspace did not delete it, Enter created no sibling.
  await expect(page.getByTestId("cloud-node-text")).toHaveCount(1);
});

test("the body survives a reload and re-selection of the node", async ({ page }) => {
  await openWorkspace(page);
  await createNode(page, "Тема");

  await page.getByRole("button", { name: "Добавить заметку…" }).click();
  await page.getByLabel("Тело узла (markdown)").fill("# Сохранено");
  await page.getByLabel("Имя узла").click();
  await expect(page.getByRole("heading", { name: "Сохранено" })).toBeVisible();

  await page.reload();
  await page.waitForSelector(".react-flow__pane");
  // After reload nothing is selected — click the node to bring it back into the panel.
  await page.getByTestId("cloud-node-text").click();
  await expect(page.getByRole("heading", { name: "Сохранено" })).toBeVisible();
});

test("collapsing the panel hides its content", async ({ page }) => {
  await openWorkspace(page);
  await createNode(page, "Тема");
  await expect(page.getByLabel("Имя узла")).toBeVisible();

  await page.getByRole("button", { name: "Свернуть панель редактора" }).click();
  await expect(page.getByLabel("Имя узла")).toHaveCount(0);

  await page.getByRole("button", { name: "Развернуть панель редактора" }).click();
  await expect(page.getByLabel("Имя узла")).toBeVisible();
});
