import { expect, type Page, test } from "@playwright/test";

async function createWorkspace(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: "Создать пространство" }).click();
  const input = page.getByLabel("Имя пространства");
  await input.fill(name);
  await input.press("Enter");
  await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
}

async function addRootNode(page: Page, text: string): Promise<void> {
  await page.dblclick(".react-flow__pane", { position: { x: 360, y: 260 } });
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(page.getByText(text)).toBeVisible();
}

test("graphs are independent per workspace and switching changes the canvas", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");

  await createWorkspace(page, "Работа");
  await addRootNode(page, "Задача A");

  await createWorkspace(page, "Учёба");
  // The new workspace starts empty — the previous workspace's node is gone.
  await expect(page.getByText("Задача A")).toHaveCount(0);
  await addRootNode(page, "Задача B");

  // Switch back to the first workspace: its graph reappears, the other's is hidden.
  await page.getByRole("button", { name: "Работа", exact: true }).click();
  await expect(page.getByText("Задача A")).toBeVisible();
  await expect(page.getByText("Задача B")).toHaveCount(0);
});

test("deleting the active workspace activates a neighbor", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");

  await createWorkspace(page, "Первое");
  await createWorkspace(page, "Второе");

  await page.getByRole("button", { name: "Меню пространства «Второе»" }).click();
  await page.getByRole("menuitem", { name: "Удалить" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Удалить" }).click();

  await expect(page.getByRole("button", { name: "Второе", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Первое", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("restart restores the last active workspace and the panel state", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");

  await createWorkspace(page, "Память");
  await addRootNode(page, "Узел");
  // Give the debounced graph save time to settle before reloading.
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Свернуть панель пространств" }).click();
  await expect(page.getByRole("button", { name: "Развернуть панель пространств" })).toBeVisible();

  await page.reload();
  await page.waitForSelector(".react-flow__pane");

  // The collapsed panel state survives the restart.
  await expect(page.getByRole("button", { name: "Развернуть панель пространств" })).toBeVisible();
  await page.getByRole("button", { name: "Развернуть панель пространств" }).click();

  // The last active workspace is reopened with its graph intact.
  await expect(page.getByRole("button", { name: "Память", exact: true })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.getByText("Узел")).toBeVisible();
});
