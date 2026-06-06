import { expect, type Page, test } from "@playwright/test";

// The web build starts with no vault — open the implicit one before creating spaces.
async function openVault(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Открыть директорию-vault" }).click();
  await expect(page.getByRole("button", { name: "Создать пространство" })).toBeVisible();
}

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
  await page.keyboard.press("Escape");
  // Scope to the canvas node: the workspace panel's root list also renders this
  // text, so a bare getByText would be ambiguous.
  await expect(page.getByTestId("cloud-node-text")).toHaveText(text);
}

test("graphs are independent per workspace and switching changes the canvas", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");
  await openVault(page);

  await createWorkspace(page, "Работа");
  await addRootNode(page, "Задача A");

  await createWorkspace(page, "Учёба");
  // The new workspace starts empty — no node on the canvas.
  await expect(page.getByTestId("cloud-node-text")).toHaveCount(0);
  await addRootNode(page, "Задача B");

  // Switch back to the first workspace: its graph reappears, the other's is hidden.
  await page.getByRole("button", { name: "Работа", exact: true }).click();
  await expect(page.getByTestId("cloud-node-text")).toHaveText("Задача A");
  // Exactly one canvas node — the other workspace's graph is not merged in.
  await expect(page.getByTestId("cloud-node-text")).toHaveCount(1);
});

test("deleting the active workspace activates a neighbor", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");
  await openVault(page);

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
  await openVault(page);

  await createWorkspace(page, "Память");
  await addRootNode(page, "Узел");
  // Give the debounced graph save time to settle before reloading.
  await page.waitForTimeout(400);

  await page.getByRole("button", { name: "Свернуть панель пространств" }).click();
  await expect(page.getByRole("button", { name: "Развернуть панель пространств" })).toBeVisible();
  // The collapse state is persisted asynchronously (the click handler does not await
  // the write); give the meta write time to land before tearing the page down.
  await page.waitForTimeout(200);

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
  await expect(page.getByTestId("cloud-node-text")).toHaveText("Узел");
});

test("the left panel is resizable and the width survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".react-flow__pane");

  // The separator sits on the panel's right edge, so its x tracks the panel width.
  const handle = page.getByRole("separator", { name: "Изменить ширину панели пространств" });
  const startBox = await handle.boundingBox();
  expect(startBox).not.toBeNull();
  const startX = startBox?.x ?? 0;

  await handle.hover();
  await page.mouse.down();
  await page.mouse.move(startX + 70, 200);
  await page.mouse.up();

  const widerBox = await handle.boundingBox();
  const widerX = widerBox?.x ?? 0;
  expect(widerX).toBeGreaterThan(startX + 40);

  // Width is persisted asynchronously; let the meta write land, then reload.
  await page.waitForTimeout(200);
  await page.reload();
  await page.waitForSelector(".react-flow__pane");

  const reloadedBox = await handle.boundingBox();
  const reloadedX = reloadedBox?.x ?? 0;
  expect(Math.abs(reloadedX - widerX)).toBeLessThan(12);
});
