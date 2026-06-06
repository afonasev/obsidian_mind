import "fake-indexeddb/auto";
import { open } from "@tauri-apps/plugin-dialog";
import { act, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { describe, expect, it, vi } from "vitest";
import { sideOf } from "../domain/layout";
import type { Graph, NodeId } from "../domain/types";
import { diffFiles, spaceDesiredFiles } from "../domain/vault/space-mapping";
import type { DebouncedSaver } from "../persistence/debounced-saver";
import { createMemoryVaultFs, type MemoryVaultFs } from "../persistence/vault/vault-fs";
import { createVaultStore, type VaultStore } from "../persistence/vault/vault-store";
import {
  type AppPrefs,
  createMindMapStore,
  DEFAULT_EDITOR_WIDTH,
  DEFAULT_WORKSPACE_NAME,
  defaultPickVaultPath,
  defaultResolveVault,
  MAX_HISTORY,
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  type MindMapStore,
  mindMapStore,
  useMindMapStore,
  WEB_VAULT_PATH,
} from "./mindmap-store";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const VAULT_PATH = "test";

type FakePrefs = AppPrefs & {
  loadLastVaultPath: ReturnType<typeof vi.fn>;
  saveLastVaultPath: ReturnType<typeof vi.fn>;
  loadActiveWorkspaceId: ReturnType<typeof vi.fn>;
  saveActiveWorkspaceId: ReturnType<typeof vi.fn>;
  loadPanelCollapsed: ReturnType<typeof vi.fn>;
  savePanelCollapsed: ReturnType<typeof vi.fn>;
  loadEditorCollapsed: ReturnType<typeof vi.fn>;
  saveEditorCollapsed: ReturnType<typeof vi.fn>;
  loadPanelWidth: ReturnType<typeof vi.fn>;
  savePanelWidth: ReturnType<typeof vi.fn>;
  loadEditorWidth: ReturnType<typeof vi.fn>;
  saveEditorWidth: ReturnType<typeof vi.fn>;
  loadCollapsedRoots: ReturnType<typeof vi.fn>;
  saveCollapsedRoots: ReturnType<typeof vi.fn>;
};

function makePrefs(): FakePrefs {
  const meta = {
    activeId: new Map<string, string | null>(),
    lastVault: VAULT_PATH as string | null,
    panel: false,
    editor: false,
    panelWidth: null as number | null,
    editorWidth: null as number | null,
    collapsedRoots: [] as readonly string[],
  };
  return {
    loadLastVaultPath: vi.fn(async () => meta.lastVault),
    saveLastVaultPath: vi.fn(async (path: string | null) => {
      meta.lastVault = path;
    }),
    loadActiveWorkspaceId: vi.fn(async (path: string) => meta.activeId.get(path) ?? null),
    saveActiveWorkspaceId: vi.fn(async (path: string, id: string | null) => {
      meta.activeId.set(path, id);
    }),
    loadPanelCollapsed: vi.fn(async () => meta.panel),
    savePanelCollapsed: vi.fn(async (collapsed: boolean) => {
      meta.panel = collapsed;
    }),
    loadEditorCollapsed: vi.fn(async () => meta.editor),
    saveEditorCollapsed: vi.fn(async (collapsed: boolean) => {
      meta.editor = collapsed;
    }),
    loadPanelWidth: vi.fn(async () => meta.panelWidth),
    savePanelWidth: vi.fn(async (width: number) => {
      meta.panelWidth = width;
    }),
    loadEditorWidth: vi.fn(async () => meta.editorWidth),
    saveEditorWidth: vi.fn(async (width: number) => {
      meta.editorWidth = width;
    }),
    loadCollapsedRoots: vi.fn(async () => meta.collapsedRoots),
    saveCollapsedRoots: vi.fn(async (ids: readonly string[]) => {
      meta.collapsedRoots = ids;
    }),
  };
}

/** Read one space's graph straight from a memory adapter (for save assertions). */
async function readSpaceFromFs(fs: MemoryVaultFs, space: string): Promise<Graph> {
  return (await createVaultStore(fs).readSpace({ id: space, name: space })).graph;
}

/** Read one space's collapsed-node ids straight from a memory adapter. */
async function readCollapsedFromFs(fs: MemoryVaultFs, space: string): Promise<readonly NodeId[]> {
  const result = await createVaultStore(fs).readSpace({ id: space, name: space });
  return [...result.collapsed];
}

interface SeedSpace {
  readonly id: string;
  readonly name: string;
  readonly graph?: Graph;
  readonly collapsed?: Iterable<NodeId>;
}

/** Populate a store's vault with spaces (and optional graphs) plus the active id. */
async function seed(
  bundle: StoreBundle,
  spaces: readonly SeedSpace[],
  active?: string | null,
): Promise<void> {
  for (const space of spaces) {
    await bundle.vault.createSpace(space.name);
  }
  await bundle.vault.saveSpaces(spaces.map((s) => ({ id: s.id, name: s.name })));
  for (const space of spaces) {
    if (space.graph !== undefined) {
      const desired = spaceDesiredFiles(
        { id: space.id, name: space.name },
        space.graph,
        new Set(space.collapsed),
      );
      await bundle.vault.applyDiff(diffFiles(new Map(), desired));
    }
  }
  if (active !== undefined) {
    await bundle.prefs.saveActiveWorkspaceId(VAULT_PATH, active);
  }
}

// A saver that persists only when flushed (via the store's real save closure), so
// tests stay free of real timers while still exercising the flush-before-switch path.
function writingSaver(save: (graph: Graph) => Promise<void>): DebouncedSaver {
  let pending: Graph | null = null;
  return {
    schedule(graph) {
      pending = graph;
    },
    async flush() {
      if (pending !== null) {
        const graph = pending;
        pending = null;
        await save(graph);
      }
    },
    dispose() {},
  };
}

function spySaver(): DebouncedSaver & {
  schedule: ReturnType<typeof vi.fn<(graph: Graph) => void>>;
  flush: ReturnType<typeof vi.fn<() => Promise<void>>>;
} {
  return {
    schedule: vi.fn<(graph: Graph) => void>(),
    flush: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dispose: vi.fn(),
  };
}

interface StoreBundle {
  readonly store: MindMapStore;
  readonly prefs: FakePrefs;
  readonly fs: MemoryVaultFs;
  readonly vault: VaultStore;
}

function makeStore(): StoreBundle {
  const prefs = makePrefs();
  const fs = createMemoryVaultFs();
  const vault = createVaultStore(fs);
  const store = createMindMapStore({
    prefs,
    resolveVault: () => ({ vault, vaultPath: VAULT_PATH }),
    createSaver: (save) => writingSaver(save),
  });
  return { store, prefs, fs, vault };
}

/** A store seeded with one active workspace, for the node-operation tests. */
function activeStore(): MindMapStore {
  const { store } = makeStore();
  store.setState({ activeWorkspaceId: "ws", workspaces: [{ id: "ws", name: "W", createdAt: 0 }] });
  return store;
}

describe("createMindMapStore", () => {
  it("starts empty with no selection, editing target or active workspace", () => {
    const { store } = makeStore();
    const state = store.getState();
    expect(state.graph).toEqual({ nodes: [], edges: [] });
    expect(state.selectedNodeId).toBeNull();
    expect(state.editingNodeId).toBeNull();
    expect(state.workspaces).toEqual([]);
    expect(state.activeWorkspaceId).toBeNull();
  });
});

describe("addRoot / addChild", () => {
  it("addRoot adds a node and selects it for editing", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    const state = store.getState();
    expect(state.graph.nodes).toHaveLength(1);
    expect(state.selectedNodeId).toBe(id);
    expect(state.editingNodeId).toBe(id);
  });

  it("addChild attaches a child to the parent and selects the new node", () => {
    const store = activeStore();
    const parentId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    const childId = store.getState().addChild({
      parentId,
      position: { x: 100, y: 0 },
    });
    const state = store.getState();
    expect(state.graph.nodes).toHaveLength(2);
    expect(state.graph.edges).toHaveLength(1);
    expect(state.editingNodeId).toBe(childId);
  });

  it("addChildOf appends each new child below its existing siblings", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().addChildOf(rootId);
    const firstId = store.getState().selectedNodeId;
    store.getState().addChildOf(rootId);
    const secondId = store.getState().selectedNodeId;

    const byId = new Map(store.getState().graph.nodes.map((n) => [n.id, n]));
    const first = byId.get(firstId ?? "");
    const second = byId.get(secondId ?? "");
    // The later-created child sits below the earlier one after layout.
    expect((second?.position.y ?? 0) > (first?.position.y ?? 0)).toBe(true);
  });
});

describe("creation guard without an active workspace", () => {
  it("addRoot is a no-op and returns an empty id when no workspace is active", () => {
    const { store } = makeStore();
    expect(store.getState().addRoot({ position: { x: 0, y: 0 } })).toBe("");
    expect(store.getState().graph.nodes).toHaveLength(0);
  });

  it("addChild is a no-op and returns an empty id when no workspace is active", () => {
    const { store } = makeStore();
    expect(store.getState().addChild({ parentId: "p", position: { x: 0, y: 0 } })).toBe("");
    expect(store.getState().graph.nodes).toHaveLength(0);
  });
});

describe("removeSubtree", () => {
  it("removes the subtree and clears selection / editing if they were inside it", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    const childId = store.getState().addChild({
      parentId: rootId,
      position: { x: 1, y: 1 },
    });
    store.getState().selectNode(childId);
    store.getState().startEditing(childId);

    store.getState().removeSubtree(rootId);
    const state = store.getState();
    expect(state.graph.nodes).toEqual([]);
    expect(state.selectedNodeId).toBeNull();
    expect(state.editingNodeId).toBeNull();
  });

  it("preserves selection on a surviving sibling subtree", () => {
    const store = activeStore();
    const rootA = store.getState().addRoot({ position: { x: 0, y: 0 } });
    const rootB = store.getState().addRoot({ position: { x: 100, y: 0 } });
    store.getState().selectNode(rootB);
    store.getState().removeSubtree(rootA);
    expect(store.getState().selectedNodeId).toBe(rootB);
  });
});

describe("updateText / moveNode", () => {
  it("updateText changes the node's text", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().updateText(id, "Идея");
    expect(store.getState().graph.nodes[0]?.text).toBe("Идея");
  });

  it("moveNode updates the position", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().moveNode(id, { x: 50, y: 60 });
    expect(store.getState().graph.nodes[0]?.position).toEqual({ x: 50, y: 60 });
  });
});

describe("setNodeStyle", () => {
  it("re-lays out the tree when the name font size grows", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "x".repeat(20) });
    const childId = store.getState().addChild({ parentId: rootId, position: { x: 100, y: 0 } });
    store.getState().stopEditing();
    const beforeX = store.getState().graph.nodes.find((n) => n.id === childId)?.position.x ?? 0;

    store.getState().setNodeStyle(rootId, { fontScale: 3 });

    const afterX = store.getState().graph.nodes.find((n) => n.id === childId)?.position.x ?? 0;
    // A wider root pushes its right-side child further out.
    expect(afterX).toBeGreaterThan(beforeX);
  });

  it("makes each style change its own undo step that restores the prior style", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "Идея" });
    store.getState().stopEditing();

    store.getState().setNodeStyle(id, { bold: true });
    store.getState().undo();

    expect(store.getState().graph.nodes.find((n) => n.id === id)?.style?.bold).toBeUndefined();
  });

  it("does not coalesce a style change with a preceding text edit", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "old" });
    store.getState().stopEditing();

    store.getState().updateText(id, "new");
    store.getState().setNodeStyle(id, { bold: true });
    // One undo peels off only the style, leaving the text edit intact ⇒ separate steps.
    store.getState().undo();

    const node = store.getState().graph.nodes.find((n) => n.id === id);
    expect(node?.text).toBe("new");
    expect(node?.style?.bold).toBeUndefined();
  });

  it("persists the style change through the autosave flush", async () => {
    const { store, fs } = makeStore();
    store.setState({
      activeWorkspaceId: "ws",
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
    });
    const id = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "Идея" });
    store.getState().stopEditing();

    store.getState().setNodeStyle(id, { bold: true });
    await store.getState().flush();

    const saved = await readSpaceFromFs(fs, "W");
    expect(saved.nodes.find((n) => n.id === id)?.style?.bold).toBe(true);
  });
});

describe("selection and editing", () => {
  it("selectNode sets the current selection", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().selectNode(id);
    expect(store.getState().selectedNodeId).toBe(id);
    store.getState().selectNode(null);
    expect(store.getState().selectedNodeId).toBeNull();
  });

  it("startEditing sets both editingNodeId and selectedNodeId", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().selectNode(null);
    store.getState().startEditing(id);
    expect(store.getState().editingNodeId).toBe(id);
    expect(store.getState().selectedNodeId).toBe(id);
  });

  it("stopEditing clears only editingNodeId", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    expect(store.getState().editingNodeId).toBeNull();
    expect(store.getState().selectedNodeId).toBe(id);
  });
});

describe("undo / redo", () => {
  it("reverts the last change and reapplies it on redo", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().dropNode(id, { x: 10, y: 20 });

    store.getState().undo();
    expect(store.getState().graph.nodes[0]?.position).toEqual({ x: 0, y: 0 });
    store.getState().redo();
    expect(store.getState().graph.nodes[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it("undo with empty history and redo with empty future are no-ops", () => {
    const store = activeStore();
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().graph.nodes).toHaveLength(0);
  });

  it("collapses a text-editing session into a single undo step", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "start" });
    store.getState().stopEditing();

    store.getState().startEditing(id);
    store.getState().updateText(id, "a");
    store.getState().updateText(id, "ab");
    store.getState().updateText(id, "abc");
    store.getState().stopEditing();
    expect(store.getState().graph.nodes[0]?.text).toBe("abc");

    store.getState().undo();
    expect(store.getState().graph.nodes[0]?.text).toBe("start");
  });

  it("treats two separate drags of the same node as two undo steps", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();

    store.getState().moveNode(id, { x: 5, y: 0 });
    store.getState().dropNode(id, { x: 10, y: 0 });
    store.getState().dropNode(id, { x: 20, y: 0 });

    expect(store.getState().graph.nodes[0]?.position.x).toBe(20);
    store.getState().undo();
    expect(store.getState().graph.nodes[0]?.position.x).toBe(10);
    store.getState().undo();
    expect(store.getState().graph.nodes[0]?.position.x).toBe(0);
  });

  it("records node creation and naming as a single undo step", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const childId = store.getState().addChild({ parentId: rootId, position: { x: 100, y: 0 } });
    store.getState().updateText(childId, "child");
    store.getState().stopEditing();
    expect(store.getState().graph.nodes).toHaveLength(2);

    store.getState().undo();
    expect(store.getState().graph.nodes).toHaveLength(1);
    expect(store.getState().graph.edges).toHaveLength(0);
  });

  it("leaves no history entry when a fresh empty node is abandoned", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const pastLen = store.getState().past.length;

    const childId = store.getState().addChild({ parentId: rootId, position: { x: 100, y: 0 } });
    store.getState().removeSubtree(childId);

    expect(store.getState().graph.nodes).toHaveLength(1);
    expect(store.getState().past.length).toBe(pastLen);
  });

  it("undo restores a deleted committed node", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "keep" });
    store.getState().stopEditing();
    store.getState().removeSubtree(id);
    expect(store.getState().graph.nodes).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().graph.nodes).toHaveLength(1);
    expect(store.getState().graph.nodes[0]?.text).toBe("keep");
  });

  it("drops a now-invalid selection after undo", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().selectNode(id);

    store.getState().undo();
    expect(store.getState().graph.nodes).toHaveLength(0);
    expect(store.getState().selectedNodeId).toBeNull();
  });

  it("discards the redo branch when a new change follows an undo", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().dropNode(id, { x: 10, y: 0 });

    store.getState().undo();
    expect(store.getState().future).toHaveLength(1);

    store.getState().dropNode(id, { x: 99, y: 0 });
    expect(store.getState().future).toHaveLength(0);
    store.getState().redo();
    expect(store.getState().graph.nodes[0]?.position.x).toBe(99);
  });

  it("does not record history for a no-op move to the same position", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const pastLen = store.getState().past.length;

    store.getState().moveNode(id, { x: 0, y: 0 });
    expect(store.getState().past.length).toBe(pastLen);
  });

  it("ignores a move for an unknown node id", () => {
    const store = activeStore();
    store.getState().moveNode("ghost", { x: 1, y: 1 });
    expect(store.getState().graph.nodes).toHaveLength(0);
  });

  it("dropNode re-sides a branch and re-flows the tree when dropped across the root", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const childId = store.getState().addChild({ parentId: rootId, position: { x: 100, y: 0 } });
    store.getState().stopEditing();
    expect(sideOf(store.getState().graph, childId)).toBe("right");

    store.getState().dropNode(childId, { x: -100, y: 0 });
    expect(sideOf(store.getState().graph, childId)).toBe("left");
    const child = store.getState().graph.nodes.find((n) => n.id === childId);
    expect(child?.position.x).toBeLessThan(0);
  });

  it("dropNode records the whole drag as one undo step restoring the pre-drag layout", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const childId = store.getState().addChild({ parentId: rootId, position: { x: 100, y: 0 } });
    store.getState().stopEditing();
    const before = store.getState().graph.nodes.find((n) => n.id === childId)?.position;

    store.getState().dropNode(childId, { x: -100, y: 0 });
    store.getState().undo();
    expect(store.getState().graph.nodes.find((n) => n.id === childId)?.position).toEqual(before);
  });

  it("caps the undo history at MAX_HISTORY steps", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    for (let i = 1; i <= MAX_HISTORY + 5; i++) {
      store.getState().dropNode(id, { x: i, y: 0 });
    }
    expect(store.getState().past.length).toBe(MAX_HISTORY);
  });
});

describe("clipboard (copy / cut / paste)", () => {
  function seedRootChildAndTarget(): {
    store: MindMapStore;
    rootId: NodeId;
    childId: NodeId;
    targetId: NodeId;
  } {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
    store.getState().stopEditing();
    const childId = store
      .getState()
      .addChild({ parentId: rootId, position: { x: 100, y: 0 }, text: "C" });
    store.getState().stopEditing();
    const targetId = store.getState().addRoot({ position: { x: 500, y: 0 }, text: "T" });
    store.getState().stopEditing();
    return { store, rootId, childId, targetId };
  }

  it("copy then paste clones the subtree under the target and keeps the original", () => {
    const { store, childId, targetId } = seedRootChildAndTarget();
    store.getState().copyNode(childId);
    store.getState().pasteInto(targetId);

    const g = store.getState().graph;
    expect(g.nodes.filter((n) => n.text === "C")).toHaveLength(2);
    const clone = g.nodes.find((n) => n.text === "C" && n.parentId === targetId);
    expect(clone).toBeDefined();
    expect(store.getState().selectedNodeId).toBe(clone?.id);
  });

  it("cut removes the subtree and paste re-adds it under the target", () => {
    const { store, childId, targetId } = seedRootChildAndTarget();
    store.getState().cutNode(childId);
    expect(store.getState().graph.nodes.some((n) => n.id === childId)).toBe(false);
    store.getState().pasteInto(targetId);
    expect(store.getState().graph.nodes.find((n) => n.text === "C")?.parentId).toBe(targetId);
  });

  it("paste is a single undo step", () => {
    const { store, childId, rootId } = seedRootChildAndTarget();
    store.getState().copyNode(childId);
    const before = store.getState().graph.nodes.length;
    store.getState().pasteInto(rootId);
    expect(store.getState().graph.nodes.length).toBeGreaterThan(before);
    store.getState().undo();
    expect(store.getState().graph.nodes.length).toBe(before);
  });

  it("paste with an empty clipboard does nothing", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().pasteInto(rootId);
    expect(store.getState().graph.nodes).toHaveLength(1);
  });

  it("paste into an unknown target does nothing", () => {
    const { store, rootId } = seedRootChildAndTarget();
    store.getState().copyNode(rootId);
    store.getState().pasteInto("ghost");
    expect(store.getState().graph.nodes).toHaveLength(3);
  });

  it("copy and cut of an unknown node leave the clipboard empty", () => {
    const store = activeStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
    store.getState().stopEditing();
    store.getState().copyNode("ghost");
    store.getState().cutNode("ghost");
    store.getState().pasteInto(rootId);
    expect(store.getState().graph.nodes).toHaveLength(1);
  });
});

describe("reparent / drop target", () => {
  it("setDropTarget sets, keeps (guarded) and clears the highlighted node", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().setDropTarget(id);
    expect(store.getState().dropTargetId).toBe(id);
    store.getState().setDropTarget(id);
    expect(store.getState().dropTargetId).toBe(id);
    store.getState().setDropTarget(null);
    expect(store.getState().dropTargetId).toBeNull();
  });

  it("reparent moves a node under a new parent as one undo step", () => {
    const store = activeStore();
    const rootA = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
    store.getState().stopEditing();
    const rootB = store.getState().addRoot({ position: { x: 500, y: 0 }, text: "B" });
    store.getState().stopEditing();

    store.getState().reparent(rootB, rootA);
    expect(store.getState().graph.nodes.find((n) => n.id === rootB)?.parentId).toBe(rootA);
    expect(store.getState().selectedNodeId).toBe(rootB);

    store.getState().undo();
    expect(store.getState().graph.nodes.find((n) => n.id === rootB)?.parentId).toBeNull();
  });

  it("reparent is a no-op for an invalid move (attaching to itself)", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const before = store.getState().past.length;
    store.getState().reparent(id, id);
    expect(store.getState().past.length).toBe(before);
  });

  it("reparent does nothing when the target is unknown", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().reparent(id, "ghost");
    expect(store.getState().graph.nodes.find((n) => n.id === id)?.parentId).toBeNull();
  });

  it("reparent coalesces with the preceding drag into a single undo step", () => {
    const store = activeStore();
    const rootA = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
    store.getState().stopEditing();
    const rootB = store.getState().addRoot({ position: { x: 500, y: 0 }, text: "B" });
    store.getState().stopEditing();

    store.getState().moveNode(rootB, { x: 50, y: 0 });
    store.getState().reparent(rootB, rootA);

    store.getState().undo();
    const b = store.getState().graph.nodes.find((n) => n.id === rootB);
    expect(b?.parentId).toBeNull();
    expect(b?.position).toEqual({ x: 500, y: 0 });
  });
});

describe("detach / detach candidate", () => {
  it("setDetachCandidate sets, keeps (guarded) and clears the flagged node", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().setDetachCandidate(id);
    expect(store.getState().detachCandidateId).toBe(id);
    store.getState().setDetachCandidate(id);
    expect(store.getState().detachCandidateId).toBe(id);
    store.getState().setDetachCandidate(null);
    expect(store.getState().detachCandidateId).toBeNull();
  });

  it("detach turns a child into a root in a single undo step", () => {
    const store = activeStore();
    const root = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
    store.getState().stopEditing();
    const child = store.getState().addChild({ parentId: root, position: { x: 200, y: 0 } });
    store.getState().stopEditing();

    store.getState().detach(child, { x: 0, y: 600 });
    const detached = store.getState().graph.nodes.find((n) => n.id === child);
    expect(detached?.parentId).toBeNull();
    // The edge from the old parent is gone.
    expect(store.getState().graph.edges.some((e) => e.target === child)).toBe(false);
    expect(store.getState().selectedNodeId).toBe(child);

    store.getState().undo();
    expect(store.getState().graph.nodes.find((n) => n.id === child)?.parentId).toBe(root);
  });

  it("detach is a no-op without history for a root node", () => {
    const store = activeStore();
    const root = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
    store.getState().stopEditing();
    const before = store.getState().past.length;
    store.getState().detach(root, { x: 100, y: 100 });
    expect(store.getState().past.length).toBe(before);
    expect(store.getState().graph.nodes.find((n) => n.id === root)?.parentId).toBeNull();
  });
});

describe("loadWorkspaces", () => {
  it("restores list, active workspace, panel state and graph", async () => {
    const bundle = makeStore();
    await seed(
      bundle,
      [
        { id: "a", name: "A" },
        {
          id: "b",
          name: "B",
          graph: {
            nodes: [{ id: "n", text: "x", position: { x: 0, y: 0 }, parentId: null }],
            edges: [],
          },
        },
      ],
      "b",
    );
    await bundle.prefs.savePanelCollapsed(true);

    await bundle.store.getState().loadWorkspaces();
    const s = bundle.store.getState();
    expect(s.workspaces.map((w) => w.id)).toEqual(["a", "b"]);
    expect(s.activeWorkspaceId).toBe("b");
    expect(s.panelCollapsed).toBe(true);
    expect(s.graph.nodes).toHaveLength(1);
  });

  it("defaults to the first workspace when the stored active id is unknown", async () => {
    const bundle = makeStore();
    await seed(bundle, [{ id: "a", name: "A" }], "gone");
    await bundle.store.getState().loadWorkspaces();
    expect(bundle.store.getState().activeWorkspaceId).toBe("a");
  });

  it("leaves no active workspace when the vault has no spaces", async () => {
    const bundle = makeStore();
    await bundle.store.getState().loadWorkspaces();
    expect(bundle.store.getState().activeWorkspaceId).toBeNull();
    expect(bundle.store.getState().graph.nodes).toHaveLength(0);
  });

  it("tolerates an active workspace that has no stored graph yet", async () => {
    const bundle = makeStore();
    await seed(bundle, [{ id: "a", name: "A" }], "a");
    await bundle.store.getState().loadWorkspaces();
    expect(bundle.store.getState().activeWorkspaceId).toBe("a");
    expect(bundle.store.getState().graph.nodes).toHaveLength(0);
  });
});

describe("createWorkspace", () => {
  it("creates an active workspace and opens inline name editing", async () => {
    const { store, prefs, vault } = makeStore();
    await store.getState().createWorkspace();
    const s = store.getState();
    expect(s.workspaces).toHaveLength(1);
    const id = s.workspaces[0]?.id;
    expect(s.activeWorkspaceId).toBe(id);
    expect(s.editingWorkspaceId).toBe(id);
    expect(s.workspaces[0]?.name).toBe("");
    expect(s.graph.nodes).toHaveLength(0);
    expect(await vault.loadSpaces()).toHaveLength(1);
    expect(prefs.saveActiveWorkspaceId).toHaveBeenCalledWith(VAULT_PATH, id);
  });
});

describe("commitWorkspaceName / cancelWorkspaceName / startWorkspaceRename", () => {
  async function freshNamed(name: string): Promise<{ store: MindMapStore; id: string }> {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const id = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(id, name);
    return { store, id };
  }

  it("stores a non-empty name and closes editing", async () => {
    const { store, id } = await freshNamed("Работа");
    expect(store.getState().workspaces.find((w) => w.id === id)?.name).toBe("Работа");
    expect(store.getState().editingWorkspaceId).toBeNull();
  });

  it("falls back to the default name when a fresh workspace is left empty", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const id = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(id, "   ");
    expect(store.getState().workspaces.find((w) => w.id === id)?.name).toBe(DEFAULT_WORKSPACE_NAME);
  });

  it("rejects an empty rename of an already-named workspace", async () => {
    const { store, id } = await freshNamed("Имя");
    store.getState().startWorkspaceRename(id);
    expect(store.getState().editingWorkspaceId).toBe(id);
    await store.getState().commitWorkspaceName(id, "  ");
    expect(store.getState().workspaces.find((w) => w.id === id)?.name).toBe("Имя");
    expect(store.getState().editingWorkspaceId).toBeNull();
  });

  it("commitWorkspaceName clears editing for an unknown id", async () => {
    const { store } = makeStore();
    store.setState({ editingWorkspaceId: "ghost" });
    await store.getState().commitWorkspaceName("ghost", "x");
    expect(store.getState().editingWorkspaceId).toBeNull();
  });

  it("cancelWorkspaceName defaults the name of a fresh workspace", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const id = store.getState().activeWorkspaceId ?? "";
    await store.getState().cancelWorkspaceName(id);
    expect(store.getState().workspaces.find((w) => w.id === id)?.name).toBe(DEFAULT_WORKSPACE_NAME);
    expect(store.getState().editingWorkspaceId).toBeNull();
  });

  it("cancelWorkspaceName keeps an existing workspace's name", async () => {
    const { store, id } = await freshNamed("Имя");
    store.getState().startWorkspaceRename(id);
    await store.getState().cancelWorkspaceName(id);
    expect(store.getState().workspaces.find((w) => w.id === id)?.name).toBe("Имя");
    expect(store.getState().editingWorkspaceId).toBeNull();
  });

  it("cancelWorkspaceName clears editing for an unknown id", async () => {
    const { store } = makeStore();
    store.setState({ editingWorkspaceId: "ghost" });
    await store.getState().cancelWorkspaceName("ghost");
    expect(store.getState().editingWorkspaceId).toBeNull();
  });

  it("renames an inactive workspace without remapping the active write-cache", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(a, "A");
    await store.getState().createWorkspace();
    await store.getState().commitWorkspaceName(store.getState().activeWorkspaceId ?? "", "B");
    // `a` is now inactive; renaming it must rename its folder but not touch the
    // active space's write-cache.
    store.getState().startWorkspaceRename(a);
    await store.getState().commitWorkspaceName(a, "AA");
    expect(store.getState().workspaces.find((w) => w.id === a)?.name).toBe("AA");
  });
});

describe("selectWorkspace", () => {
  it("switches the visible graph and keeps graphs independent", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    store.getState().addRoot({ position: { x: 0, y: 0 }, text: "in A" });
    store.getState().stopEditing();

    await store.getState().createWorkspace();
    const b = store.getState().activeWorkspaceId ?? "";
    expect(store.getState().graph.nodes).toHaveLength(0);
    store.getState().addRoot({ position: { x: 0, y: 0 }, text: "in B" });
    store.getState().stopEditing();

    await store.getState().selectWorkspace(a);
    expect(store.getState().graph.nodes.map((n) => n.text)).toEqual(["in A"]);
    await store.getState().selectWorkspace(b);
    expect(store.getState().graph.nodes.map((n) => n.text)).toEqual(["in B"]);
  });

  it("entering an unknown workspace id yields an empty graph", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    await store.getState().commitWorkspaceName(store.getState().activeWorkspaceId ?? "", "A");
    await store.getState().selectWorkspace("ghost");
    expect(store.getState().graph.nodes).toEqual([]);
  });

  it("is a no-op when selecting the already-active workspace", async () => {
    const { store, vault } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    const readSpy = vi.spyOn(vault, "readSpace");
    await store.getState().selectWorkspace(a);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("keeps undo/redo history isolated per workspace", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    store.getState().addRoot({ position: { x: 0, y: 0 }, text: "A1" });
    store.getState().stopEditing();
    expect(store.getState().past.length).toBeGreaterThan(0);

    await store.getState().createWorkspace();
    expect(store.getState().past).toHaveLength(0);
    // undo in B must not touch A.
    store.getState().undo();

    await store.getState().selectWorkspace(a);
    expect(store.getState().past.length).toBeGreaterThan(0);
    expect(store.getState().graph.nodes.map((n) => n.text)).toEqual(["A1"]);
  });
});

describe("deleteWorkspace", () => {
  async function twoWorkspaces(): Promise<{ store: MindMapStore; a: string; b: string }> {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(a, "A");
    await store.getState().createWorkspace();
    const b = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(b, "B");
    return { store, a, b };
  }

  it("activates the neighbor when the active workspace is removed", async () => {
    const { store, a, b } = await twoWorkspaces();
    // b is active; deleting it falls back to the previous one, a.
    await store.getState().deleteWorkspace(b);
    expect(store.getState().activeWorkspaceId).toBe(a);
    expect(store.getState().workspaces.map((w) => w.id)).toEqual([a]);
  });

  it("drops into the empty state when the last workspace is removed", async () => {
    const { store, prefs } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    await store.getState().deleteWorkspace(a);
    expect(store.getState().activeWorkspaceId).toBeNull();
    expect(store.getState().workspaces).toHaveLength(0);
    expect(store.getState().graph.nodes).toHaveLength(0);
    expect(prefs.saveActiveWorkspaceId).toHaveBeenLastCalledWith(VAULT_PATH, null);
  });

  it("removes a non-active workspace without changing the active graph", async () => {
    const { store, a, b } = await twoWorkspaces();
    // b is active; add a node, then delete the inactive a.
    store.getState().addRoot({ position: { x: 0, y: 0 }, text: "B1" });
    store.getState().stopEditing();
    await store.getState().deleteWorkspace(a);
    expect(store.getState().activeWorkspaceId).toBe(b);
    expect(store.getState().workspaces.map((w) => w.id)).toEqual([b]);
    expect(store.getState().graph.nodes).toHaveLength(1);
  });

  it("deletes the workspace's space folder from the vault", async () => {
    const { store, vault } = makeStore();
    await store.getState().createWorkspace();
    const id = store.getState().activeWorkspaceId ?? "";
    store.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
    store.getState().stopEditing();
    await store.getState().flush();
    await store.getState().deleteWorkspace(id);
    expect(await vault.loadSpaces()).toEqual([]);
  });

  it("clears inline editing when the workspace being edited is removed", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const id = store.getState().activeWorkspaceId ?? "";
    expect(store.getState().editingWorkspaceId).toBe(id);
    await store.getState().deleteWorkspace(id);
    expect(store.getState().editingWorkspaceId).toBeNull();
  });
});

describe("focus history (goBack / goForward)", () => {
  /** A store with one named workspace active; returns it and the workspace id. */
  async function oneWorkspace(): Promise<{ store: MindMapStore; id: string }> {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const id = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(id, "W");
    return { store, id };
  }

  /** Create a root, finish its editing, then select it so it lands in the history. */
  function addAndSelectRoot(store: MindMapStore, x: number): NodeId {
    const nodeId = store.getState().addRoot({ position: { x, y: 0 } });
    store.getState().stopEditing();
    store.getState().selectNode(nodeId);
    return nodeId;
  }

  it("records a focus point when a node is selected", async () => {
    const { store, id } = await oneWorkspace();
    const nodeId = addAndSelectRoot(store, 0);
    expect(store.getState().navHistory).toEqual([{ workspaceId: id, nodeId }]);
    expect(store.getState().navCursor).toBe(0);
  });

  it("does not record a deselect or a selection without an active workspace", () => {
    const { store } = makeStore();
    // No active workspace: a stray select still updates the selection but not history.
    store.getState().selectNode("ghost");
    expect(store.getState().selectedNodeId).toBe("ghost");
    expect(store.getState().navHistory).toHaveLength(0);
    store.getState().selectNode(null);
    expect(store.getState().navHistory).toHaveLength(0);
  });

  it("does not duplicate the entry when the same node is re-selected", async () => {
    const { store } = await oneWorkspace();
    const nodeId = addAndSelectRoot(store, 0);
    store.getState().selectNode(nodeId);
    expect(store.getState().navHistory).toHaveLength(1);
  });

  it("steps back then forward through nodes in one workspace", async () => {
    const { store } = await oneWorkspace();
    const a = addAndSelectRoot(store, 0);
    const b = addAndSelectRoot(store, 100);
    expect(store.getState().navCursor).toBe(1);

    await store.getState().goBack();
    expect(store.getState().selectedNodeId).toBe(a);
    expect(store.getState().navCursor).toBe(0);

    await store.getState().goForward();
    expect(store.getState().selectedNodeId).toBe(b);
    expect(store.getState().navCursor).toBe(1);
  });

  it("is a no-op at the start and end boundaries of the history", async () => {
    const { store } = await oneWorkspace();
    const a = addAndSelectRoot(store, 0);
    addAndSelectRoot(store, 100);
    await store.getState().goBack();
    // Already at the first entry — a second back changes nothing.
    await store.getState().goBack();
    expect(store.getState().selectedNodeId).toBe(a);
    expect(store.getState().navCursor).toBe(0);
  });

  it("truncates the forward tail when a new node is selected after going back", async () => {
    const { store } = await oneWorkspace();
    addAndSelectRoot(store, 0);
    addAndSelectRoot(store, 100);
    await store.getState().goBack();
    const c = addAndSelectRoot(store, 200);
    expect(store.getState().navHistory.map((e) => e.nodeId)).toEqual([
      store.getState().navHistory[0]?.nodeId,
      c,
    ]);
    expect(store.getState().navCursor).toBe(1);
  });

  it("navigates back and forward across a workspace boundary", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const wa = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(wa, "A");
    const a = addAndSelectRoot(store, 0);

    await store.getState().createWorkspace();
    const wb = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(wb, "B");
    const b = addAndSelectRoot(store, 0);

    await store.getState().goBack();
    expect(store.getState().activeWorkspaceId).toBe(wa);
    expect(store.getState().selectedNodeId).toBe(a);

    await store.getState().goForward();
    expect(store.getState().activeWorkspaceId).toBe(wb);
    expect(store.getState().selectedNodeId).toBe(b);
  });

  it("snaps back to the cursor entry after switching workspace without selecting", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const wa = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(wa, "A");
    addAndSelectRoot(store, 0);
    await store.getState().createWorkspace();
    const wb = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(wb, "B");
    const b = addAndSelectRoot(store, 0);

    // Switch away without selecting a node in A: the visible state no longer
    // matches the cursor, so the first back must snap onto b@B, not jump past it.
    await store.getState().selectWorkspace(wa);
    await store.getState().goBack();
    expect(store.getState().activeWorkspaceId).toBe(wb);
    expect(store.getState().selectedNodeId).toBe(b);
    expect(store.getState().navCursor).toBe(1);
  });

  it("snaps back to the cursor entry after a deselect", async () => {
    const { store } = await oneWorkspace();
    addAndSelectRoot(store, 0);
    const b = addAndSelectRoot(store, 100);
    store.getState().selectNode(null);
    await store.getState().goBack();
    expect(store.getState().selectedNodeId).toBe(b);
    expect(store.getState().navCursor).toBe(1);
  });

  it("steps over a deleted node when navigating back", async () => {
    const { store } = await oneWorkspace();
    const a = addAndSelectRoot(store, 0);
    const b = addAndSelectRoot(store, 100);
    addAndSelectRoot(store, 200);
    store.getState().removeSubtree(b);
    await store.getState().goBack();
    // b is gone — back skips it and lands on a.
    expect(store.getState().selectedNodeId).toBe(a);
    expect(store.getState().navCursor).toBe(0);
  });

  it("steps over an entry whose workspace no longer exists", async () => {
    const { store, id } = await oneWorkspace();
    const a = addAndSelectRoot(store, 0);
    const b = addAndSelectRoot(store, 100);
    // Inject a middle entry pointing at a workspace that is not registered — the
    // defensive guard in focusNavEntry must skip it rather than trying to load it.
    store.setState({
      navHistory: [
        { workspaceId: id, nodeId: a },
        { workspaceId: "gone", nodeId: "x" },
        { workspaceId: id, nodeId: b },
      ],
      navCursor: 2,
    });
    await store.getState().goBack();
    expect(store.getState().selectedNodeId).toBe(a);
    expect(store.getState().navCursor).toBe(0);
  });

  it("prunes a deleted workspace's entries and keeps the cursor valid", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const wa = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(wa, "A");
    addAndSelectRoot(store, 0);
    await store.getState().createWorkspace();
    const wb = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(wb, "B");
    const b = addAndSelectRoot(store, 0);

    await store.getState().deleteWorkspace(wa);
    expect(store.getState().navHistory).toEqual([{ workspaceId: wb, nodeId: b }]);
    expect(store.getState().navCursor).toBe(0);
  });

  it("ignores a second navigation while one is already in flight", async () => {
    const { store } = await oneWorkspace();
    const a = addAndSelectRoot(store, 0);
    addAndSelectRoot(store, 100);
    // Fire two back-steps without awaiting the first: the second sees the
    // `navigating` flag still raised and bails out, so only one step happens.
    const first = store.getState().goBack();
    const second = store.getState().goBack();
    await Promise.all([first, second]);
    expect(store.getState().selectedNodeId).toBe(a);
    expect(store.getState().navCursor).toBe(0);
  });

  it("resets the focus history on loadWorkspaces", async () => {
    const { store, prefs } = makeStore();
    await store.getState().createWorkspace();
    addAndSelectRoot(store, 0);
    expect(store.getState().navHistory.length).toBeGreaterThan(0);
    // Make the stored workspace loadable so loadWorkspaces has something to restore.
    await store.getState().flush();
    await store.getState().loadWorkspaces();
    expect(store.getState().navHistory).toHaveLength(0);
    expect(store.getState().navCursor).toBe(-1);
    expect(prefs.loadLastVaultPath).toHaveBeenCalled();
  });
});

describe("togglePanel", () => {
  it("flips and persists the collapsed state", async () => {
    const { store, prefs } = makeStore();
    await store.getState().togglePanel();
    expect(store.getState().panelCollapsed).toBe(true);
    expect(prefs.savePanelCollapsed).toHaveBeenCalledWith(true);
    await store.getState().togglePanel();
    expect(store.getState().panelCollapsed).toBe(false);
  });
});

describe("toggleEditor", () => {
  it("flips and persists the editor-collapsed state", async () => {
    const { store, prefs } = makeStore();
    await store.getState().toggleEditor();
    expect(store.getState().editorCollapsed).toBe(true);
    expect(prefs.saveEditorCollapsed).toHaveBeenCalledWith(true);
    await store.getState().toggleEditor();
    expect(store.getState().editorCollapsed).toBe(false);
  });

  it("restores editorCollapsed on loadWorkspaces", async () => {
    const { store, prefs } = makeStore();
    await prefs.saveEditorCollapsed(true);
    await store.getState().loadWorkspaces();
    expect(store.getState().editorCollapsed).toBe(true);
  });
});

describe("setPanelWidth / setEditorWidth", () => {
  it("updates the width without persisting during a live drag (commit=false)", () => {
    const { store, prefs } = makeStore();
    store.getState().setPanelWidth(300, false);
    expect(store.getState().panelWidth).toBe(300);
    expect(prefs.savePanelWidth).not.toHaveBeenCalled();
  });

  it("persists the width on commit", () => {
    const { store, prefs } = makeStore();
    store.getState().setEditorWidth(420, true);
    expect(store.getState().editorWidth).toBe(420);
    expect(prefs.saveEditorWidth).toHaveBeenCalledWith(420);
  });

  it("clamps the width to the panel bounds", () => {
    const { store } = makeStore();
    store.getState().setPanelWidth(10_000, false);
    expect(store.getState().panelWidth).toBe(MAX_PANEL_WIDTH);
    store.getState().setPanelWidth(0, false);
    expect(store.getState().panelWidth).toBe(MIN_PANEL_WIDTH);
  });

  it("restores both widths on loadWorkspaces, falling back to defaults", async () => {
    const { store, prefs } = makeStore();
    await prefs.savePanelWidth(260);
    await store.getState().loadWorkspaces();
    expect(store.getState().panelWidth).toBe(260);
    // editorWidth was never stored → default.
    expect(store.getState().editorWidth).toBe(DEFAULT_EDITOR_WIDTH);
  });
});

describe("updateBody", () => {
  it("commits the body of the selected node", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().updateBody(id, "# Тело");
    expect(store.getState().graph.nodes[0]?.body).toBe("# Тело");
  });

  it("does not reset the node's name or position", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "Имя" });
    store.getState().stopEditing();
    store.getState().dropNode(id, { x: 30, y: 40 });
    store.getState().updateBody(id, "тело");
    const node = store.getState().graph.nodes[0];
    expect(node?.text).toBe("Имя");
    expect(node?.position).toEqual({ x: 30, y: 40 });
  });

  it("participates in undo, reverting to the previous body", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().updateBody(id, "первое");
    store.getState().selectNode(id); // closes the coalescing window
    store.getState().updateBody(id, "второе");
    store.getState().undo();
    expect(store.getState().graph.nodes[0]?.body).toBe("первое");
  });

  it("collapses a series of edits to one body into a single undo step", () => {
    const store = activeStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().updateBody(id, "a");
    store.getState().updateBody(id, "ab");
    store.getState().updateBody(id, "abc");
    store.getState().undo();
    expect(store.getState().graph.nodes[0]?.body).toBeUndefined();
  });
});

describe("panel root list", () => {
  it("loads cached roots and collapsed flags on loadWorkspaces", async () => {
    const bundle = makeStore();
    await seed(bundle, [
      {
        id: "a",
        name: "A",
        graph: {
          nodes: [{ id: "ra", text: "Корень A", position: { x: 0, y: 0 }, parentId: null }],
          edges: [],
        },
      },
      { id: "b", name: "B" },
    ]);
    await bundle.prefs.saveCollapsedRoots(["b"]);

    await bundle.store.getState().loadWorkspaces();
    const s = bundle.store.getState();
    expect(s.rootsByWorkspace.get("a")).toEqual([{ id: "ra", text: "Корень A" }]);
    expect(s.collapsedWorkspaceRoots.has("b")).toBe(true);
  });

  it("caches the leaving workspace's roots when switching away", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "Идея" });
    store.getState().stopEditing();

    await store.getState().createWorkspace();
    // After leaving A, its single root is cached for the panel's second level.
    expect(store.getState().rootsByWorkspace.get(a)).toEqual([{ id: rootId, text: "Идея" }]);
  });

  it("toggleWorkspaceRoots flips membership and persists the set", async () => {
    const { store, prefs } = makeStore();
    await store.getState().toggleWorkspaceRoots("w");
    expect(store.getState().collapsedWorkspaceRoots.has("w")).toBe(true);
    expect(prefs.saveCollapsedRoots).toHaveBeenLastCalledWith(["w"]);
    await store.getState().toggleWorkspaceRoots("w");
    expect(store.getState().collapsedWorkspaceRoots.has("w")).toBe(false);
    expect(prefs.saveCollapsedRoots).toHaveBeenLastCalledWith([]);
  });

  it("prunes a deleted workspace from the roots cache and collapsed set", async () => {
    const { store, prefs } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(a, "A");
    await store.getState().createWorkspace();
    const b = store.getState().activeWorkspaceId ?? "";
    await store.getState().commitWorkspaceName(b, "B");
    await store.getState().toggleWorkspaceRoots(a);

    await store.getState().deleteWorkspace(a);
    expect(store.getState().rootsByWorkspace.has(a)).toBe(false);
    expect(store.getState().collapsedWorkspaceRoots.has(a)).toBe(false);
    expect(prefs.saveCollapsedRoots).toHaveBeenLastCalledWith([]);
  });

  it("revealNode bumps a monotone seq even for the same node", () => {
    const store = activeStore();
    store.getState().revealNode("n1");
    expect(store.getState().reveal).toEqual({ nodeId: "n1", seq: 1 });
    store.getState().revealNode("n1");
    expect(store.getState().reveal).toEqual({ nodeId: "n1", seq: 2 });
  });

  it("focusRoot selects and reveals a root in the active workspace", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const ws = store.getState().activeWorkspaceId ?? "";
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
    store.getState().stopEditing();

    await store.getState().focusRoot(ws, rootId);
    expect(store.getState().selectedNodeId).toBe(rootId);
    expect(store.getState().reveal?.nodeId).toBe(rootId);
  });

  it("focusRoot switches workspace before selecting a root from another one", async () => {
    const { store } = makeStore();
    await store.getState().createWorkspace();
    const a = store.getState().activeWorkspaceId ?? "";
    const aRoot = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "in A" });
    store.getState().stopEditing();

    await store.getState().createWorkspace();
    const b = store.getState().activeWorkspaceId ?? "";
    expect(store.getState().activeWorkspaceId).toBe(b);

    await store.getState().focusRoot(a, aRoot);
    expect(store.getState().activeWorkspaceId).toBe(a);
    expect(store.getState().selectedNodeId).toBe(aRoot);
    expect(store.getState().reveal?.nodeId).toBe(aRoot);
  });
});

describe("autosave", () => {
  it("schedules a save whenever the graph reference changes", () => {
    const saver = spySaver();
    const store = createMindMapStore({ prefs: makePrefs(), createSaver: () => saver });
    store.setState({
      activeWorkspaceId: "ws",
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
    });

    store.getState().addRoot({ position: { x: 0, y: 0 } });
    expect(saver.schedule).toHaveBeenCalledTimes(1);

    store.getState().selectNode("anything" as NodeId);
    expect(saver.schedule).toHaveBeenCalledTimes(1);

    const node = store.getState().graph.nodes[0];
    if (!node) throw new Error("expected a node");
    store.getState().updateText(node.id, "new");
    expect(saver.schedule).toHaveBeenCalledTimes(2);
  });

  it("flushes pending writes before switching the active workspace", async () => {
    const saver = spySaver();
    const vault = createVaultStore(createMemoryVaultFs());
    const store = createMindMapStore({
      prefs: makePrefs(),
      resolveVault: () => ({ vault, vaultPath: VAULT_PATH }),
      createSaver: () => saver,
    });
    await store.getState().createWorkspace();
    saver.flush.mockClear();
    await store.getState().createWorkspace();
    expect(saver.flush).toHaveBeenCalled();
  });

  it("flush() forwards to the saver", async () => {
    const saver = spySaver();
    const store = createMindMapStore({ prefs: makePrefs(), createSaver: () => saver });
    await store.getState().flush();
    expect(saver.flush).toHaveBeenCalled();
  });

  it("the save closure targets the active space and skips when none is active", async () => {
    const vault = createVaultStore(createMemoryVaultFs());
    const applySpy = vi.spyOn(vault, "applyDiff");
    let save: (graph: Graph) => Promise<void> = async () => {};
    const store = createMindMapStore({
      prefs: makePrefs(),
      resolveVault: () => ({ vault, vaultPath: VAULT_PATH }),
      createSaver: (fn) => {
        save = fn;
        return spySaver();
      },
    });
    const graph: Graph = { nodes: [], edges: [] };
    await save(graph);
    expect(applySpy).not.toHaveBeenCalled();

    store.setState({
      activeWorkspaceId: "ws",
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
    });
    await save(graph);
    expect(applySpy).toHaveBeenCalled();
  });
});

describe("toggleCollapse and collapse interactions", () => {
  function seededStore(): { store: MindMapStore; fs: MemoryVaultFs } {
    const { store, fs } = makeStore();
    store.setState({
      activeWorkspaceId: "ws",
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
    });
    return { store, fs };
  }

  /** Build root → childA → grandchild and leave editing committed. */
  function tree(store: MindMapStore): { root: NodeId; childA: NodeId; grand: NodeId } {
    const root = store.getState().addRoot({ position: { x: 0, y: 0 } });
    const childA = store.getState().addChild({ parentId: root, position: { x: 100, y: 0 } });
    const grand = store.getState().addChild({ parentId: childA, position: { x: 200, y: 0 } });
    store.getState().stopEditing();
    return { root, childA, grand };
  }

  it("toggles a node's collapsed state without touching undo history", () => {
    const { store } = seededStore();
    const { root } = tree(store);
    const pastBefore = store.getState().past.length;
    const futureBefore = store.getState().future.length;
    store.getState().toggleCollapse(root);
    expect(store.getState().collapsedNodeIds.has(root)).toBe(true);
    expect(store.getState().past.length).toBe(pastBefore);
    expect(store.getState().future.length).toBe(futureBefore);
    store.getState().toggleCollapse(root);
    expect(store.getState().collapsedNodeIds.has(root)).toBe(false);
  });

  it("is a no-op for a node without children", () => {
    const { store } = seededStore();
    const root = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().toggleCollapse(root);
    expect(store.getState().collapsedNodeIds.has(root)).toBe(false);
  });

  it("persists the collapsed set for the active workspace on toggle", async () => {
    const { store, fs } = seededStore();
    const { root } = tree(store);
    store.getState().toggleCollapse(root);
    await store.getState().flush();
    expect(await readCollapsedFromFs(fs, "W")).toEqual([root]);
  });

  it("collapses without persisting when no workspace is active", async () => {
    const { store, fs } = makeStore();
    store.setState({
      graph: {
        nodes: [
          { id: "p", text: "P", position: { x: 0, y: 0 }, parentId: null },
          { id: "c", text: "C", position: { x: 100, y: 0 }, parentId: "p" },
        ],
        edges: [{ id: "e", source: "p", target: "c" }],
      },
    });
    store.getState().toggleCollapse("p");
    expect(store.getState().collapsedNodeIds.has("p")).toBe(true);
    await store.getState().flush();
    // With no active workspace the save closure is a no-op — nothing is written.
    expect(fs.snapshot().size).toBe(0);
  });

  it("moves the selection up to the collapsed node when it hides the selection", () => {
    const { store } = seededStore();
    const { childA, grand } = tree(store);
    store.getState().selectNode(grand);
    store.getState().toggleCollapse(childA);
    expect(store.getState().selectedNodeId).toBe(childA);
  });

  it("keeps the selection when collapsing a node that does not hide it", () => {
    const { store } = seededStore();
    const { root } = tree(store);
    store.getState().selectNode(root);
    store.getState().toggleCollapse(root);
    expect(store.getState().selectedNodeId).toBe(root);
  });

  it("collapses with no selection without error", () => {
    const { store } = seededStore();
    const { root } = tree(store);
    store.getState().selectNode(null);
    store.getState().toggleCollapse(root);
    expect(store.getState().collapsedNodeIds.has(root)).toBe(true);
    expect(store.getState().selectedNodeId).toBeNull();
  });

  it("auto-expands a collapsed parent when a child is added to it", () => {
    const { store } = seededStore();
    const { childA } = tree(store);
    store.getState().toggleCollapse(childA);
    expect(store.getState().collapsedNodeIds.has(childA)).toBe(true);
    store.getState().addChildOf(childA);
    expect(store.getState().collapsedNodeIds.has(childA)).toBe(false);
  });

  it("expands collapsed ancestors when revealing a hidden node", () => {
    const { store } = seededStore();
    const { root, grand } = tree(store);
    store.getState().toggleCollapse(root);
    expect(store.getState().collapsedNodeIds.has(root)).toBe(true);
    store.getState().revealNode(grand);
    expect(store.getState().collapsedNodeIds.has(root)).toBe(false);
  });

  it("drops a removed node from the collapsed set", () => {
    const { store } = seededStore();
    const { childA } = tree(store);
    store.getState().toggleCollapse(childA);
    store.getState().removeSubtree(childA);
    expect(store.getState().collapsedNodeIds.has(childA)).toBe(false);
  });

  it("drops a collapsed descendant when an ancestor is removed", () => {
    const { store } = seededStore();
    const { root, childA } = tree(store);
    store.getState().toggleCollapse(childA);
    store.getState().removeSubtree(root);
    expect(store.getState().collapsedNodeIds.has(childA)).toBe(false);
  });

  it("restores the collapsed set when entering a workspace", async () => {
    const bundle = makeStore();
    await seed(
      bundle,
      [
        {
          id: "a",
          name: "A",
          graph: {
            nodes: [
              { id: "n", text: "N", position: { x: 0, y: 0 }, parentId: null },
              { id: "c", text: "C", position: { x: 100, y: 0 }, parentId: "n" },
            ],
            edges: [{ id: "e", source: "n", target: "c" }],
          },
          collapsed: ["n"],
        },
      ],
      "a",
    );
    await bundle.store.getState().loadWorkspaces();
    expect([...bundle.store.getState().collapsedNodeIds]).toEqual(["n"]);
  });

  it("restores each workspace's own collapsed set when switching", async () => {
    const bundle = makeStore();
    await seed(
      bundle,
      [
        { id: "a", name: "A" },
        {
          id: "b",
          name: "B",
          graph: {
            nodes: [
              { id: "bn", text: "BN", position: { x: 0, y: 0 }, parentId: null },
              { id: "bc", text: "BC", position: { x: 100, y: 0 }, parentId: "bn" },
            ],
            edges: [{ id: "be", source: "bn", target: "bc" }],
          },
          collapsed: ["bn"],
        },
      ],
      "a",
    );
    await bundle.store.getState().loadWorkspaces();
    expect([...bundle.store.getState().collapsedNodeIds]).toEqual([]);
    await bundle.store.getState().selectWorkspace("b");
    expect([...bundle.store.getState().collapsedNodeIds]).toEqual(["bn"]);
  });
});

describe("createWorkspace without a vault", () => {
  it("is a no-op when no vault is open", async () => {
    const store = createMindMapStore({
      prefs: makePrefs(),
      resolveVault: () => ({ vault: null, vaultPath: null }),
    });
    await store.getState().createWorkspace();
    expect(store.getState().workspaces).toEqual([]);
  });

  it("disambiguates the folders of several uncommitted workspaces", async () => {
    const { store, vault } = makeStore();
    await store.getState().createWorkspace();
    await store.getState().createWorkspace();
    await store.getState().createWorkspace();
    const names = (await vault.loadSpaces()).map((s) => s.name);
    expect(new Set(names).size).toBe(3);
    expect(names).toContain(`${DEFAULT_WORKSPACE_NAME} (3)`);
  });

  it("ignores deleting an unknown workspace id", async () => {
    const { store } = makeStore();
    await store.getState().deleteWorkspace("ghost");
    expect(store.getState().workspaces).toEqual([]);
  });

  it("operates without a per-vault prefs path", async () => {
    const vault = createVaultStore(createMemoryVaultFs());
    const store = createMindMapStore({
      prefs: makePrefs(),
      resolveVault: () => ({ vault, vaultPath: null }),
      createSaver: (save) => writingSaver(save),
    });
    await store.getState().createWorkspace();
    await store.getState().commitWorkspaceName(store.getState().activeWorkspaceId ?? "", "A");
    await store.getState().createWorkspace();
    await store.getState().commitWorkspaceName(store.getState().activeWorkspaceId ?? "", "B");
    // loadWorkspaces / selectWorkspace / deleteWorkspace all tolerate a null path.
    await store.getState().loadWorkspaces();
    expect(store.getState().workspaces).toHaveLength(2);
    await store.getState().selectWorkspace(store.getState().workspaces[1]?.id ?? "");
    await store.getState().deleteWorkspace(store.getState().activeWorkspaceId ?? "");
    await store.getState().deleteWorkspace(store.getState().activeWorkspaceId ?? "");
    expect(store.getState().activeWorkspaceId).toBeNull();
  });
});

describe("workspace actions with no vault open", () => {
  function nullVaultStore(): MindMapStore {
    return createMindMapStore({
      prefs: makePrefs(),
      resolveVault: () => ({ vault: null, vaultPath: null }),
      createSaver: (save) => writingSaver(save),
    });
  }

  it("commits a rename in state without a vault", async () => {
    const store = nullVaultStore();
    store.setState({
      workspaces: [{ id: "x", name: "Old", createdAt: 0 }],
      editingWorkspaceId: "x",
    });
    await store.getState().commitWorkspaceName("x", "New");
    expect(store.getState().workspaces[0]?.name).toBe("New");
  });

  it("defaults a fresh name to the constant when no folder was tracked", async () => {
    const store = nullVaultStore();
    store.setState({ workspaces: [{ id: "x", name: "", createdAt: 0 }], editingWorkspaceId: "x" });
    await store.getState().cancelWorkspaceName("x");
    expect(store.getState().workspaces[0]?.name).toBe(DEFAULT_WORKSPACE_NAME);
  });

  it("deletes the active workspace and enters its neighbor without a vault", async () => {
    const store = nullVaultStore();
    store.setState({
      workspaces: [
        { id: "x", name: "X", createdAt: 0 },
        { id: "y", name: "Y", createdAt: 0 },
      ],
      activeWorkspaceId: "x",
    });
    await store.getState().deleteWorkspace("x");
    // Neighbor `y` is entered through the no-vault branch (empty graph).
    expect(store.getState().activeWorkspaceId).toBe("y");
    expect(store.getState().graph.nodes).toEqual([]);
  });

  it("loads into an empty state when no vault is open", async () => {
    const store = nullVaultStore();
    await store.getState().loadWorkspaces();
    expect(store.getState().workspaces).toEqual([]);
    expect(store.getState().activeWorkspaceId).toBeNull();
  });

  it("defaults a fresh untracked name on an empty commit without a vault", async () => {
    const store = nullVaultStore();
    store.setState({ workspaces: [{ id: "x", name: "", createdAt: 0 }], editingWorkspaceId: "x" });
    await store.getState().commitWorkspaceName("x", "");
    expect(store.getState().workspaces[0]?.name).toBe(DEFAULT_WORKSPACE_NAME);
  });

  it("falls back to the default folder name when deleting a fresh untracked workspace", async () => {
    const store = nullVaultStore();
    store.setState({ workspaces: [{ id: "x", name: "", createdAt: 0 }], activeWorkspaceId: "x" });
    await store.getState().deleteWorkspace("x");
    expect(store.getState().workspaces).toEqual([]);
  });
});

describe("openVault", () => {
  it("picks a path, stores it and loads the chosen vault", async () => {
    const fs = createMemoryVaultFs();
    const vault = createVaultStore(fs);
    await vault.createSpace("A");
    await vault.saveSpaces([{ id: "a", name: "A" }]);
    const prefs = makePrefs();
    const store = createMindMapStore({
      prefs,
      resolveVault: () => ({ vault, vaultPath: VAULT_PATH }),
      pickVaultPath: async () => "/picked",
      createSaver: (save) => writingSaver(save),
    });

    await store.getState().openVault();
    expect(prefs.saveLastVaultPath).toHaveBeenCalledWith("/picked");
    expect(store.getState().hasVault).toBe(true);
    expect(store.getState().workspaces.map((w) => w.name)).toEqual(["A"]);
  });

  it("is a no-op when the picker is cancelled", async () => {
    const prefs = makePrefs();
    const store = createMindMapStore({
      prefs,
      resolveVault: () => ({ vault: null, vaultPath: null }),
      pickVaultPath: async () => null,
      createSaver: (save) => writingSaver(save),
    });
    await store.getState().openVault();
    expect(prefs.saveLastVaultPath).not.toHaveBeenCalled();
    expect(store.getState().hasVault).toBe(false);
  });
});

describe("defaultPickVaultPath", () => {
  function setTauri(present: boolean): void {
    const w = window as unknown as Record<string, unknown>;
    if (present) {
      w.__TAURI_INTERNALS__ = {};
    } else {
      delete w.__TAURI_INTERNALS__;
    }
  }

  it("opens the native folder picker inside Tauri", async () => {
    setTauri(true);
    vi.mocked(open).mockResolvedValue("/chosen/vault");
    try {
      expect(await defaultPickVaultPath()).toBe("/chosen/vault");
    } finally {
      setTauri(false);
    }
  });

  it("returns the implicit web vault path outside Tauri", async () => {
    setTauri(false);
    expect(await defaultPickVaultPath()).toBe(WEB_VAULT_PATH);
  });
});

describe("refreshFromDisk", () => {
  it("is a no-op when no vault is open", async () => {
    const store = createMindMapStore({
      prefs: makePrefs(),
      resolveVault: () => ({ vault: null, vaultPath: null }),
      createSaver: (save) => writingSaver(save),
    });
    await store.getState().loadWorkspaces();
    await store.getState().refreshFromDisk();
    expect(store.getState().workspaces).toEqual([]);
    expect(store.getState().hasVault).toBe(false);
  });

  it("flushes and re-reads, adopting an external body change by id", async () => {
    const bundle = makeStore();
    const graph: Graph = {
      nodes: [{ id: "r", text: "Root", position: { x: 0, y: 0 }, parentId: null }],
      edges: [],
    };
    await seed(bundle, [{ id: "a", name: "A", graph }], "a");
    await bundle.store.getState().loadWorkspaces();
    expect(bundle.store.getState().graph.nodes[0]?.body).toBeUndefined();

    // Simulate an external edit: rewrite the space with the root carrying a body.
    const root = graph.nodes[0];
    if (root === undefined) throw new Error("expected a root");
    const edited: Graph = { nodes: [{ ...root, body: "Внешнее тело" }], edges: [] };
    await bundle.vault.applyDiff(
      diffFiles(new Map(), spaceDesiredFiles({ id: "a", name: "A" }, edited, new Set())),
    );

    await bundle.store.getState().refreshFromDisk();
    expect(bundle.store.getState().graph.nodes[0]?.body).toBe("Внешнее тело");
  });

  it("re-points the active workspace and persists it when its space vanishes", async () => {
    const bundle = makeStore();
    await seed(
      bundle,
      [
        { id: "a", name: "A" },
        { id: "b", name: "B" },
      ],
      "a",
    );
    await bundle.store.getState().loadWorkspaces();
    expect(bundle.store.getState().activeWorkspaceId).toBe("a");

    // External deletion of the active space.
    await bundle.vault.deleteSpace("A");
    await bundle.vault.saveSpaces([{ id: "b", name: "B" }]);
    bundle.prefs.saveActiveWorkspaceId.mockClear();

    await bundle.store.getState().refreshFromDisk();
    expect(bundle.store.getState().workspaces.map((w) => w.id)).toEqual(["b"]);
    expect(bundle.store.getState().activeWorkspaceId).toBe("b");
    expect(bundle.prefs.saveActiveWorkspaceId).toHaveBeenCalledWith(VAULT_PATH, "b");
  });
});

describe("defaultResolveVault", () => {
  function setTauri(present: boolean): void {
    const w = window as unknown as Record<string, unknown>;
    if (present) {
      w.__TAURI_INTERNALS__ = {};
    } else {
      delete w.__TAURI_INTERNALS__;
    }
  }

  it("opens the last vault over the filesystem inside Tauri", () => {
    setTauri(true);
    expect(defaultResolveVault("/v")).toEqual({ vault: expect.anything(), vaultPath: "/v" });
    expect(defaultResolveVault(null)).toEqual({ vault: null, vaultPath: null });
    setTauri(false);
  });

  it("opens the implicit localStorage vault in the web build once a path is set", () => {
    setTauri(false);
    const resolved = defaultResolveVault(WEB_VAULT_PATH);
    expect(resolved.vault).not.toBeNull();
    expect(resolved.vaultPath).toBe(WEB_VAULT_PATH);
  });

  it("starts with no vault in the web build until one is opened", () => {
    setTauri(false);
    expect(defaultResolveVault(null)).toEqual({ vault: null, vaultPath: null });
  });
});

describe("singleton mindMapStore", () => {
  it("is a usable store instance exposed for the React app", () => {
    expect(typeof mindMapStore.getState).toBe("function");
    expect(mindMapStore.getState().graph.nodes).toBeDefined();
  });
});

describe("useMindMapStore hook", () => {
  function NodeCount(): JSX.Element {
    const count = useMindMapStore((state) => state.graph.nodes.length);
    return <output data-testid="count">{count}</output>;
  }

  it("re-renders when the selected slice of state changes", () => {
    act(() => {
      const ids = mindMapStore.getState().graph.nodes.map((node) => node.id);
      for (const id of ids) {
        mindMapStore.getState().removeSubtree(id);
      }
      // The guard blocks root creation without an active workspace — seed one.
      mindMapStore.setState({
        activeWorkspaceId: "ws",
        workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
      });
    });

    render(<NodeCount />);
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    act(() => {
      mindMapStore.getState().addRoot({ position: { x: 0, y: 0 } });
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
