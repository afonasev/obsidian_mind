import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeWorkspaceKey, DB_NAME, META_STORE, openMindMapDb } from "./db";
import {
  loadActiveWorkspaceId,
  loadCollapsedRoots,
  loadEditorCollapsed,
  loadEditorWidth,
  loadLastVaultPath,
  loadPanelCollapsed,
  loadPanelWidth,
  saveActiveWorkspaceId,
  saveCollapsedRoots,
  saveEditorCollapsed,
  saveEditorWidth,
  saveLastVaultPath,
  savePanelCollapsed,
  savePanelWidth,
} from "./repository";

async function resetDb(): Promise<void> {
  // fake-indexeddb persists across tests by default. Wipe it before each.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

beforeEach(resetDb);
afterEach(resetDb);

describe("last vault path", () => {
  it("returns null by default", async () => {
    expect(await loadLastVaultPath()).toBeNull();
  });

  it("reads back a saved path", async () => {
    await saveLastVaultPath("/home/user/vault");
    expect(await loadLastVaultPath()).toBe("/home/user/vault");
  });

  it("treats a stored null as none", async () => {
    await saveLastVaultPath("/v");
    await saveLastVaultPath(null);
    expect(await loadLastVaultPath()).toBeNull();
  });
});

describe("active workspace per vault", () => {
  it("returns null by default", async () => {
    expect(await loadActiveWorkspaceId("/v")).toBeNull();
  });

  it("reads back a saved id under the same vault", async () => {
    await saveActiveWorkspaceId("/v", "w1");
    expect(await loadActiveWorkspaceId("/v")).toBe("w1");
  });

  it("keeps the active id isolated per vault path", async () => {
    await saveActiveWorkspaceId("/a", "wa");
    await saveActiveWorkspaceId("/b", "wb");
    expect(await loadActiveWorkspaceId("/a")).toBe("wa");
    expect(await loadActiveWorkspaceId("/b")).toBe("wb");
  });

  it("treats a stored null as none", async () => {
    await saveActiveWorkspaceId("/v", "w1");
    await saveActiveWorkspaceId("/v", null);
    expect(await loadActiveWorkspaceId("/v")).toBeNull();
  });
});

describe("panel/editor state", () => {
  it("defaults collapsed flags to false", async () => {
    expect(await loadPanelCollapsed()).toBe(false);
    expect(await loadEditorCollapsed()).toBe(false);
  });

  it("round-trips the collapsed flags", async () => {
    await savePanelCollapsed(true);
    await saveEditorCollapsed(true);
    expect(await loadPanelCollapsed()).toBe(true);
    expect(await loadEditorCollapsed()).toBe(true);
  });

  it("defaults widths to null and round-trips them", async () => {
    expect(await loadPanelWidth()).toBeNull();
    expect(await loadEditorWidth()).toBeNull();
    await savePanelWidth(300);
    await saveEditorWidth(420);
    expect(await loadPanelWidth()).toBe(300);
    expect(await loadEditorWidth()).toBe(420);
  });

  it("defaults collapsed-roots to empty and round-trips them", async () => {
    expect(await loadCollapsedRoots()).toEqual([]);
    await saveCollapsedRoots(["a", "b"]);
    expect(await loadCollapsedRoots()).toEqual(["a", "b"]);
  });
});

describe("openMindMapDb", () => {
  it("creates the meta store on a fresh database", async () => {
    const db = await openMindMapDb();
    expect(db.objectStoreNames.contains(META_STORE)).toBe(true);
    expect(db.objectStoreNames.contains("graph")).toBe(false);
    db.close();
  });

  it("drops the legacy content stores on upgrade, keeping meta settings", async () => {
    // Recreate the v2 schema: graph + workspaces + meta, with one saved setting.
    const v2 = await openDB(DB_NAME, 2, {
      upgrade(database) {
        database.createObjectStore("graph");
        database.createObjectStore("workspaces");
        database.createObjectStore(META_STORE);
      },
    });
    await v2.put("graph", { nodes: [], edges: [] }, "w1");
    await v2.put(META_STORE, "/v", "lastVaultPath");
    v2.close();

    const db = await openMindMapDb();
    expect(db.objectStoreNames.contains("graph")).toBe(false);
    expect(db.objectStoreNames.contains("workspaces")).toBe(false);
    db.close();
    // The meta store and its settings survive the upgrade.
    expect(await loadLastVaultPath()).toBe("/v");
  });

  it("builds a stable per-vault active-workspace key", () => {
    expect(activeWorkspaceKey("/home/v")).toBe("activeWorkspace:/home/v");
  });
});
