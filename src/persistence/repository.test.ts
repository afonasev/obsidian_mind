import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Graph } from "../domain/types";
import { DB_NAME, openMindMapDb, RECORD_KEY, STORE_NAME } from "./db";
import { loadGraph, saveGraph } from "./repository";

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

beforeEach(async () => {
  await resetDb();
});

afterEach(async () => {
  await resetDb();
});

describe("loadGraph", () => {
  it("returns null when no record exists", async () => {
    expect(await loadGraph()).toBeNull();
  });

  it("returns the saved graph after saveGraph", async () => {
    await saveGraph(sampleGraph);
    const loaded = await loadGraph();
    expect(loaded?.nodes).toEqual(sampleGraph.nodes);
    expect(loaded?.edges).toEqual(sampleGraph.edges);
  });

  it("drops edges referencing missing nodes on load", async () => {
    const db = await openMindMapDb();
    await db.put(
      STORE_NAME,
      {
        version: 1,
        nodes: sampleGraph.nodes,
        edges: [
          { id: "valid", source: "n1", target: "n2" },
          { id: "dangling", source: "n1", target: "ghost" },
        ],
        updatedAt: Date.now(),
      },
      RECORD_KEY,
    );
    db.close();
    const loaded = await loadGraph();
    expect(loaded?.edges.map((edge) => edge.id)).toEqual(["valid"]);
  });

  it("treats a stored record with empty arrays as a valid empty graph", async () => {
    const db = await openMindMapDb();
    await db.put(STORE_NAME, { version: 1, nodes: [], edges: [], updatedAt: 0 }, RECORD_KEY);
    db.close();
    const loaded = await loadGraph();
    expect(loaded).toEqual({ nodes: [], edges: [] });
  });

  it("tolerates a record with missing nodes/edges fields", async () => {
    const db = await openMindMapDb();
    await db.put(
      STORE_NAME,
      // Simulate a malformed legacy record without nodes/edges.
      { version: 1, updatedAt: 0 } as never,
      RECORD_KEY,
    );
    db.close();
    const loaded = await loadGraph();
    expect(loaded).toEqual({ nodes: [], edges: [] });
  });
});

describe("saveGraph", () => {
  it("stores the graph under the fixed record key with version 1 and a timestamp", async () => {
    const before = Date.now();
    await saveGraph(sampleGraph);
    const after = Date.now();

    const db = await openMindMapDb();
    const record = await db.get(STORE_NAME, RECORD_KEY);
    db.close();

    expect(record?.version).toBe(1);
    expect(record?.nodes).toEqual(sampleGraph.nodes);
    expect(record?.edges).toEqual(sampleGraph.edges);
    expect(record?.updatedAt).toBeGreaterThanOrEqual(before);
    expect(record?.updatedAt).toBeLessThanOrEqual(after);
  });

  it("overwrites a previous record (single-document model)", async () => {
    await saveGraph(sampleGraph);
    const replacement: Graph = {
      nodes: [{ id: "x", text: "x", position: { x: 0, y: 0 }, parentId: null }],
      edges: [],
    };
    await saveGraph(replacement);
    const loaded = await loadGraph();
    expect(loaded?.nodes.map((node) => node.id)).toEqual(["x"]);
  });
});

describe("openMindMapDb", () => {
  it("is idempotent for the same version", async () => {
    const a = await openMindMapDb();
    a.close();
    const b = await openMindMapDb();
    expect(b.objectStoreNames.contains(STORE_NAME)).toBe(true);
    b.close();
  });
});
