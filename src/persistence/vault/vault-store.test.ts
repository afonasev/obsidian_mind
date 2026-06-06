import { describe, expect, it } from "vitest";
import type { Graph, MindNode } from "../../domain/types";
import { diffFiles, spaceDesiredFiles } from "../../domain/vault/space-mapping";
import { VaultFsError } from "../../vault/fs-bridge";
import { createMemoryVaultFs, type VaultFs } from "./vault-fs";
import { createVaultStore } from "./vault-store";

const space = { id: "s", name: "Work" };
const rootNode: MindNode = { id: "r", text: "Root", parentId: null, position: { x: 0, y: 0 } };
const graph: Graph = {
  nodes: [
    rootNode,
    { id: "c", text: "Child", parentId: "r", position: { x: 240, y: 0 }, body: "note body" },
  ],
  edges: [{ id: "r->c", source: "r", target: "c" }],
};

/** Apply a graph to the store as the saver would: desired files, diffed, applied. */
async function save(
  store: ReturnType<typeof createVaultStore>,
  g: Graph,
  previous: Map<string, string>,
): Promise<Map<string, string>> {
  const desired = spaceDesiredFiles(space, g, new Set());
  await store.applyDiff(diffFiles(previous, desired));
  return desired;
}

describe("VaultStore over the in-memory adapter", () => {
  it("creates space folders, saves the list, and loads it in order", async () => {
    const store = createVaultStore(createMemoryVaultFs());
    await store.createSpace("Work");
    await store.createSpace("Home");
    await store.saveSpaces([
      { id: "w", name: "Work" },
      { id: "h", name: "Home" },
    ]);
    expect((await store.loadSpaces()).map((s) => s.name)).toEqual(["Work", "Home"]);
  });

  it("reads back a written graph (round-trip through applyDiff)", async () => {
    const store = createVaultStore(createMemoryVaultFs());
    await store.createSpace("Work");
    await save(store, graph, new Map());
    expect((await store.readSpace(space)).graph).toEqual(graph);
  });

  it("leaves no temp files after an atomic write", async () => {
    const fs = createMemoryVaultFs();
    const store = createVaultStore(fs);
    await store.createSpace("Work");
    await save(store, graph, new Map());
    expect([...fs.snapshot().keys()].some((p) => p.endsWith(".tmp"))).toBe(false);
  });

  it("returns an empty graph for a space with no roots", async () => {
    const store = createVaultStore(createMemoryVaultFs());
    await store.createSpace("Work");
    expect((await store.readSpace(space)).graph).toEqual({ nodes: [], edges: [] });
  });

  it("deletes the note and root files when a node is removed", async () => {
    const fs = createMemoryVaultFs();
    const store = createVaultStore(fs);
    await store.createSpace("Work");
    const first = await save(store, graph, new Map());
    const onlyRoot: Graph = { nodes: [rootNode], edges: [] };
    await save(store, onlyRoot, first);
    expect([...fs.snapshot().keys()].some((p) => p.endsWith(".md"))).toBe(false);
    expect((await store.readSpace(space)).graph.nodes).toEqual(onlyRoot.nodes);
  });

  it("renames a space, moving its notes and verstka", async () => {
    const store = createVaultStore(createMemoryVaultFs());
    await store.createSpace("Work");
    await save(store, graph, new Map());
    await store.renameSpace("Work", "Career");
    expect((await store.readSpace({ id: "s", name: "Career" })).graph).toEqual(graph);
  });

  it("deletes a space that has no verstka yet without error", async () => {
    const store = createVaultStore(createMemoryVaultFs());
    await store.createSpace("Empty");
    // `.mind/Empty` was never written — deleteSpace must tolerate its absence.
    await store.deleteSpace("Empty");
    expect(await store.loadSpaces()).toEqual([]);
  });

  it("deletes a space folder and its verstka", async () => {
    const fs = createMemoryVaultFs();
    const store = createVaultStore(fs);
    await store.createSpace("Work");
    await save(store, graph, new Map());
    await store.deleteSpace("Work");
    expect([...fs.snapshot().keys()].filter((p) => p.includes("Work"))).toEqual([]);
    expect(await store.loadSpaces()).toEqual([]);
  });
});

/** A memory adapter with one method overridden to reject, for error-path coverage. */
function faultyFs(seed: Record<string, string>, override: Partial<VaultFs>): VaultFs {
  return { ...createMemoryVaultFs(seed), ...override };
}

describe("VaultStore error handling", () => {
  const io = (): Promise<never> => Promise.reject(new VaultFsError("fs", "Io", "io"));
  const boom = (): Promise<never> => Promise.reject(new Error("boom"));

  it("propagates a non-NotFound VaultFsError from a verstka read", async () => {
    const store = createVaultStore(faultyFs({ ".mind/spaces.yaml": "x" }, { readText: io }));
    await expect(store.loadSpaces()).rejects.toMatchObject({ kind: "Io" });
  });

  it("propagates a non-VaultFs error from a verstka read", async () => {
    const store = createVaultStore(faultyFs({ ".mind/spaces.yaml": "x" }, { readText: boom }));
    await expect(store.loadSpaces()).rejects.toThrow("boom");
  });

  it("propagates a non-NotFound VaultFsError from a delete", async () => {
    const store = createVaultStore(faultyFs({ "Work/n.md": "x" }, { remove: io }));
    await expect(store.deleteSpace("Work")).rejects.toMatchObject({ kind: "Io" });
  });

  it("propagates a non-VaultFs error from a delete", async () => {
    const store = createVaultStore(faultyFs({ "Work/n.md": "x" }, { remove: boom }));
    await expect(store.deleteSpace("Work")).rejects.toThrow("boom");
  });

  it("propagates a non-NotFound VaultFsError from a directory read", async () => {
    const store = createVaultStore(faultyFs({}, { readDir: io }));
    await expect(store.readSpace({ id: "s", name: "Work" })).rejects.toMatchObject({ kind: "Io" });
  });
});
