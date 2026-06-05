import "fake-indexeddb/auto";
import { openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Graph } from "../domain/types";
import type { Workspace } from "../domain/workspaces";
import { DB_NAME, GRAPH_STORE, openMindMapDb, WORKSPACES_STORE } from "./db";
import {
  deleteWorkspace,
  loadActiveWorkspaceId,
  loadAllRoots,
  loadCollapsedRoots,
  loadEditorCollapsed,
  loadEditorWidth,
  loadGraph,
  loadPanelCollapsed,
  loadPanelWidth,
  loadWorkspaces,
  saveActiveWorkspaceId,
  saveCollapsedRoots,
  saveEditorCollapsed,
  saveEditorWidth,
  saveGraph,
  savePanelCollapsed,
  savePanelWidth,
  saveWorkspace,
} from "./repository";

async function resetDb(): Promise<void> {
  // fake-indexeddb persists across tests by default. Wipe it before each.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error);
    };
    request.onblocked = () => {
      resolve();
    };
  });
}

const sampleGraph: Graph = {
  nodes: [
    { id: "n1", text: "Корень", position: { x: 0, y: 0 }, parentId: null },
    { id: "n2", text: "Ребёнок", position: { x: 100, y: 50 }, parentId: "n1" },
  ],
  edges: [{ id: "e1", source: "n1", target: "n2" }],
};

function ws(id: string, name = id, createdAt = 0): Workspace {
  return { id, name, createdAt };
}

beforeEach(async () => {
  await resetDb();
});

afterEach(async () => {
  await resetDb();
});

describe("loadGraph / saveGraph", () => {
  it("returns null when no record exists for the workspace", async () => {
    expect(await loadGraph("w1")).toBeNull();
  });

  it("returns the saved graph after saveGraph under the same workspace key", async () => {
    await saveGraph("w1", sampleGraph);
    const loaded = await loadGraph("w1");
    expect(loaded?.nodes).toEqual(sampleGraph.nodes);
    expect(loaded?.edges).toEqual(sampleGraph.edges);
  });

  it("round-trips a node body through save and load", async () => {
    const withBody: Graph = {
      nodes: [
        { id: "n1", text: "Корень", position: { x: 0, y: 0 }, parentId: null, body: "# Тело" },
      ],
      edges: [],
    };
    await saveGraph("w1", withBody);
    expect((await loadGraph("w1"))?.nodes[0]?.body).toBe("# Тело");
  });

  it("loads an old record whose nodes have no body field (body stays empty)", async () => {
    const db = await openMindMapDb();
    // A record saved before bodies existed: node has no `body` key at all.
    await db.put(
      GRAPH_STORE,
      {
        version: 2,
        nodes: [{ id: "n1", text: "Старый", position: { x: 0, y: 0 }, parentId: null }],
        edges: [],
        updatedAt: 0,
      },
      "w1",
    );
    db.close();
    const loaded = await loadGraph("w1");
    expect(loaded?.nodes[0]?.body).toBeUndefined();
  });

  it("keeps graphs isolated per workspace id", async () => {
    await saveGraph("w1", sampleGraph);
    const other: Graph = {
      nodes: [{ id: "x", text: "x", position: { x: 0, y: 0 }, parentId: null }],
      edges: [],
    };
    await saveGraph("w2", other);
    expect((await loadGraph("w1"))?.nodes.map((n) => n.id)).toEqual(["n1", "n2"]);
    expect((await loadGraph("w2"))?.nodes.map((n) => n.id)).toEqual(["x"]);
  });

  it("drops edges referencing missing nodes on load", async () => {
    const db = await openMindMapDb();
    await db.put(
      GRAPH_STORE,
      {
        version: 2,
        nodes: sampleGraph.nodes,
        edges: [
          { id: "valid", source: "n1", target: "n2" },
          { id: "dangling", source: "n1", target: "ghost" },
        ],
        updatedAt: Date.now(),
      },
      "w1",
    );
    db.close();
    const loaded = await loadGraph("w1");
    expect(loaded?.edges.map((edge) => edge.id)).toEqual(["valid"]);
  });

  it("treats a stored record with empty arrays as a valid empty graph", async () => {
    const db = await openMindMapDb();
    await db.put(GRAPH_STORE, { version: 2, nodes: [], edges: [], updatedAt: 0 }, "w1");
    db.close();
    expect(await loadGraph("w1")).toEqual({ nodes: [], edges: [] });
  });

  it("tolerates a record with missing nodes/edges fields", async () => {
    const db = await openMindMapDb();
    // Simulate a malformed record without nodes/edges.
    await db.put(GRAPH_STORE, { version: 2, updatedAt: 0 } as never, "w1");
    db.close();
    expect(await loadGraph("w1")).toEqual({ nodes: [], edges: [] });
  });

  it("stores the graph under the workspace key with version 2 and a timestamp", async () => {
    const before = Date.now();
    await saveGraph("w1", sampleGraph);
    const after = Date.now();

    const db = await openMindMapDb();
    const record = await db.get(GRAPH_STORE, "w1");
    db.close();

    expect(record?.version).toBe(2);
    expect(record?.nodes).toEqual(sampleGraph.nodes);
    expect(record?.edges).toEqual(sampleGraph.edges);
    expect(record?.updatedAt).toBeGreaterThanOrEqual(before);
    expect(record?.updatedAt).toBeLessThanOrEqual(after);
  });
});

describe("workspaces CRUD", () => {
  it("returns an empty list when there are no workspaces", async () => {
    expect(await loadWorkspaces()).toEqual([]);
  });

  it("saves and loads workspaces ordered by createdAt", async () => {
    await saveWorkspace(ws("b", "B", 200));
    await saveWorkspace(ws("a", "A", 100));
    await saveWorkspace(ws("c", "C", 300));
    expect((await loadWorkspaces()).map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("overwrites a workspace stored under the same id (rename)", async () => {
    await saveWorkspace(ws("a", "Old", 1));
    await saveWorkspace(ws("a", "New", 1));
    const list = await loadWorkspaces();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("New");
  });

  it("deleteWorkspace removes the workspace together with its graph", async () => {
    await saveWorkspace(ws("a"));
    await saveGraph("a", sampleGraph);
    await deleteWorkspace("a");
    expect(await loadWorkspaces()).toEqual([]);
    expect(await loadGraph("a")).toBeNull();
  });
});

describe("loadAllRoots", () => {
  it("returns an empty map when no graphs exist", async () => {
    expect(await loadAllRoots()).toEqual(new Map());
  });

  it("maps each workspace id to its root nodes only", async () => {
    await saveGraph("w1", sampleGraph);
    const other: Graph = {
      nodes: [
        { id: "r1", text: "Первый", position: { x: 0, y: 0 }, parentId: null },
        { id: "r2", text: "Второй", position: { x: 0, y: 0 }, parentId: null },
        { id: "c", text: "Дитя", position: { x: 0, y: 0 }, parentId: "r1" },
      ],
      edges: [{ id: "e", source: "r1", target: "c" }],
    };
    await saveGraph("w2", other);

    const map = await loadAllRoots();
    expect(map.get("w1")).toEqual([{ id: "n1", text: "Корень" }]);
    expect(map.get("w2")).toEqual([
      { id: "r1", text: "Первый" },
      { id: "r2", text: "Второй" },
    ]);
  });

  it("yields an empty list for a workspace whose graph has no nodes", async () => {
    await saveGraph("empty", { nodes: [], edges: [] });
    expect((await loadAllRoots()).get("empty")).toEqual([]);
  });

  it("keeps the empty text of an unnamed root", async () => {
    await saveGraph("w", {
      nodes: [{ id: "r", text: "", position: { x: 0, y: 0 }, parentId: null }],
      edges: [],
    });
    expect((await loadAllRoots()).get("w")).toEqual([{ id: "r", text: "" }]);
  });
});

describe("meta", () => {
  it("returns null active workspace id by default", async () => {
    expect(await loadActiveWorkspaceId()).toBeNull();
  });

  it("reads back a saved active workspace id", async () => {
    await saveActiveWorkspaceId("w1");
    expect(await loadActiveWorkspaceId()).toBe("w1");
  });

  it("treats a stored null active id as none", async () => {
    await saveActiveWorkspaceId("w1");
    await saveActiveWorkspaceId(null);
    expect(await loadActiveWorkspaceId()).toBeNull();
  });

  it("returns false panel-collapsed by default", async () => {
    expect(await loadPanelCollapsed()).toBe(false);
  });

  it("reads back a saved panel-collapsed flag", async () => {
    await savePanelCollapsed(true);
    expect(await loadPanelCollapsed()).toBe(true);
    await savePanelCollapsed(false);
    expect(await loadPanelCollapsed()).toBe(false);
  });

  it("returns false editor-collapsed by default", async () => {
    expect(await loadEditorCollapsed()).toBe(false);
  });

  it("reads back a saved editor-collapsed flag", async () => {
    await saveEditorCollapsed(true);
    expect(await loadEditorCollapsed()).toBe(true);
    await saveEditorCollapsed(false);
    expect(await loadEditorCollapsed()).toBe(false);
  });

  it("returns null panel/editor width by default", async () => {
    expect(await loadPanelWidth()).toBeNull();
    expect(await loadEditorWidth()).toBeNull();
  });

  it("round-trips the panel and editor widths", async () => {
    await savePanelWidth(300);
    await saveEditorWidth(420);
    expect(await loadPanelWidth()).toBe(300);
    expect(await loadEditorWidth()).toBe(420);
  });

  it("returns an empty collapsed-roots list by default", async () => {
    expect(await loadCollapsedRoots()).toEqual([]);
  });

  it("reads back a saved collapsed-roots list", async () => {
    await saveCollapsedRoots(["a", "b"]);
    expect(await loadCollapsedRoots()).toEqual(["a", "b"]);
    await saveCollapsedRoots([]);
    expect(await loadCollapsedRoots()).toEqual([]);
  });
});

describe("openMindMapDb", () => {
  it("creates the three object stores", async () => {
    const db = await openMindMapDb();
    expect(db.objectStoreNames.contains(GRAPH_STORE)).toBe(true);
    expect(db.objectStoreNames.contains(WORKSPACES_STORE)).toBe(true);
    expect(db.objectStoreNames.contains("meta")).toBe(true);
    db.close();
  });

  it("is idempotent for the same version", async () => {
    const a = await openMindMapDb();
    a.close();
    const b = await openMindMapDb();
    expect(b.objectStoreNames.contains(GRAPH_STORE)).toBe(true);
    b.close();
  });

  it("drops the v1 'current' graph record when upgrading to v2", async () => {
    // Recreate the v1 schema: a single `graph` store with one record under `current`.
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(database) {
        database.createObjectStore("graph");
      },
    });
    await v1.put("graph", { version: 1, nodes: [], edges: [], updatedAt: 0 }, "current");
    v1.close();

    const db = await openMindMapDb();
    const legacy = await db.get(GRAPH_STORE, "current");
    db.close();
    expect(legacy).toBeUndefined();
    expect(await loadWorkspaces()).toEqual([]);
  });
});
