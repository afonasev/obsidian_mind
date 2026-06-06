import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { DB_NAME } from "./persistence/db";
import { saveActiveWorkspaceId } from "./persistence/repository";
import { createLocalStorageVaultFs } from "./persistence/vault/vault-fs";
import { createVaultStore } from "./persistence/vault/vault-store";
import { mindMapStore, WEB_VAULT_PATH, WEB_VAULT_STORAGE_KEY } from "./store/mindmap-store";

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  // Seed the web (localStorage) vault with one space the app will restore on mount.
  const vault = createVaultStore(createLocalStorageVaultFs(WEB_VAULT_STORAGE_KEY));
  await vault.createSpace("Пространство");
  await vault.saveSpaces([{ id: "ws", name: "Пространство" }]);
  await saveActiveWorkspaceId(WEB_VAULT_PATH, "ws");
});

afterEach(async () => {
  // Drain any pending debounced write so no timer fires after the test ends.
  await act(async () => {
    await mindMapStore.getState().flush();
  });
  act(() => {
    const ids = mindMapStore.getState().graph.nodes.map((node) => node.id);
    for (const id of ids) {
      mindMapStore.getState().removeSubtree(id);
    }
    mindMapStore.getState().selectNode(null);
    mindMapStore.getState().stopEditing();
  });
  await resetDb();
  localStorage.clear();
});

describe("App", () => {
  it("renders the workspace panel and the mindmap canvas", async () => {
    const { container } = render(<App />);
    expect(container.querySelector(".react-flow")).not.toBeNull();
    expect(screen.getByLabelText("Создать пространство")).toBeInTheDocument();
    await waitFor(() => {
      expect(mindMapStore.getState().activeWorkspaceId).toBe("ws");
    });
  });

  it("loads the active workspace on mount so root creation works", async () => {
    render(<App />);
    await waitFor(() => {
      expect(mindMapStore.getState().activeWorkspaceId).toBe("ws");
    });
    act(() => {
      mindMapStore.getState().addRoot({ position: { x: 0, y: 0 } });
    });
    expect(mindMapStore.getState().graph.nodes.length).toBeGreaterThan(0);
  });

  it("flushes pending writes when the page is being unloaded", async () => {
    render(<App />);
    await waitFor(() => {
      expect(mindMapStore.getState().activeWorkspaceId).toBe("ws");
    });
    const flushSpy = vi.spyOn(mindMapStore.getState(), "flush");
    act(() => {
      window.dispatchEvent(new Event("beforeunload"));
    });
    expect(flushSpy).toHaveBeenCalled();
  });
});
