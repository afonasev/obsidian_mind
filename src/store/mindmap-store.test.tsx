import "fake-indexeddb/auto";
import { act, render, screen } from "@testing-library/react";
import type { JSX } from "react";
import { describe, expect, it, vi } from "vitest";
import { sideOf } from "../domain/layout";
import type { Graph, NodeId } from "../domain/types";
import type { DebouncedSaver } from "../persistence/debounced-saver";
import {
  bindSaver,
  createMindMapStore,
  MAX_HISTORY,
  mindMapStore,
  useMindMapStore,
} from "./mindmap-store";

function makeFakeSaver(): DebouncedSaver & {
  schedule: ReturnType<typeof vi.fn<(graph: Graph) => void>>;
  flush: ReturnType<typeof vi.fn<() => Promise<void>>>;
  dispose: ReturnType<typeof vi.fn<() => void>>;
} {
  return {
    schedule: vi.fn<(graph: Graph) => void>(),
    flush: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dispose: vi.fn<() => void>(),
  };
}

describe("createMindMapStore", () => {
  it("starts with an empty graph and no selection or editing target", () => {
    const store = createMindMapStore();
    const state = store.getState();
    expect(state.graph).toEqual({ nodes: [], edges: [] });
    expect(state.selectedNodeId).toBeNull();
    expect(state.editingNodeId).toBeNull();
  });
});

describe("loadFromStorage", () => {
  it("populates graph from the loader", async () => {
    const loaded: Graph = {
      nodes: [{ id: "a", text: "x", position: { x: 0, y: 0 }, parentId: null }],
      edges: [],
    };
    const store = createMindMapStore({ load: async () => loaded });
    await store.getState().loadFromStorage();
    expect(store.getState().graph).toBe(loaded);
  });

  it("leaves an empty graph in place when the loader returns null", async () => {
    const store = createMindMapStore({ load: async () => null });
    await store.getState().loadFromStorage();
    expect(store.getState().graph).toEqual({ nodes: [], edges: [] });
  });

  it("falls back to the real repository when no loader is injected", async () => {
    const store = createMindMapStore();
    // Real loader against fake-indexeddb returns null on a fresh DB.
    await store.getState().loadFromStorage();
    expect(store.getState().graph).toEqual({ nodes: [], edges: [] });
  });
});

describe("addRoot / addChild", () => {
  it("addRoot adds a node and selects it for editing", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    const state = store.getState();
    expect(state.graph.nodes).toHaveLength(1);
    expect(state.selectedNodeId).toBe(id);
    expect(state.editingNodeId).toBe(id);
  });

  it("addChild attaches a child to the parent and selects the new node", () => {
    const store = createMindMapStore();
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
});

describe("removeSubtree", () => {
  it("removes the subtree and clears selection / editing if they were inside it", () => {
    const store = createMindMapStore();
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
    const store = createMindMapStore();
    const rootA = store.getState().addRoot({ position: { x: 0, y: 0 } });
    const rootB = store.getState().addRoot({ position: { x: 100, y: 0 } });
    store.getState().selectNode(rootB);
    store.getState().removeSubtree(rootA);
    expect(store.getState().selectedNodeId).toBe(rootB);
  });
});

describe("updateText / moveNode", () => {
  it("updateText changes the node's text", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().updateText(id, "Идея");
    expect(store.getState().graph.nodes[0]?.text).toBe("Идея");
  });

  it("moveNode updates the position", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().moveNode(id, { x: 50, y: 60 });
    expect(store.getState().graph.nodes[0]?.position).toEqual({ x: 50, y: 60 });
  });
});

describe("selection and editing", () => {
  it("selectNode sets the current selection", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().selectNode(id);
    expect(store.getState().selectedNodeId).toBe(id);
    store.getState().selectNode(null);
    expect(store.getState().selectedNodeId).toBeNull();
  });

  it("startEditing sets both editingNodeId and selectedNodeId", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().selectNode(null);
    store.getState().startEditing(id);
    expect(store.getState().editingNodeId).toBe(id);
    expect(store.getState().selectedNodeId).toBe(id);
  });

  it("stopEditing clears only editingNodeId", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    expect(store.getState().editingNodeId).toBeNull();
    expect(store.getState().selectedNodeId).toBe(id);
  });
});

describe("undo / redo", () => {
  it("reverts the last change and reapplies it on redo", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().dropNode(id, { x: 10, y: 20 });

    store.getState().undo();
    expect(store.getState().graph.nodes[0]?.position).toEqual({ x: 0, y: 0 });
    store.getState().redo();
    expect(store.getState().graph.nodes[0]?.position).toEqual({ x: 10, y: 20 });
  });

  it("undo with empty history and redo with empty future are no-ops", () => {
    const store = createMindMapStore();
    store.getState().undo();
    store.getState().redo();
    expect(store.getState().graph.nodes).toHaveLength(0);
  });

  it("collapses a text-editing session into a single undo step", () => {
    const store = createMindMapStore();
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
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();

    // First drag: an in-flight tick then a drop. Second drag: another drop.
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
    const store = createMindMapStore();
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
    const store = createMindMapStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const pastLen = store.getState().past.length;

    const childId = store.getState().addChild({ parentId: rootId, position: { x: 100, y: 0 } });
    store.getState().removeSubtree(childId);

    expect(store.getState().graph.nodes).toHaveLength(1);
    expect(store.getState().past.length).toBe(pastLen);
  });

  it("undo restores a deleted committed node", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 }, text: "keep" });
    store.getState().stopEditing();
    store.getState().removeSubtree(id);
    expect(store.getState().graph.nodes).toHaveLength(0);

    store.getState().undo();
    expect(store.getState().graph.nodes).toHaveLength(1);
    expect(store.getState().graph.nodes[0]?.text).toBe("keep");
  });

  it("drops a now-invalid selection after undo", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().selectNode(id);

    store.getState().undo();
    expect(store.getState().graph.nodes).toHaveLength(0);
    expect(store.getState().selectedNodeId).toBeNull();
  });

  it("discards the redo branch when a new change follows an undo", () => {
    const store = createMindMapStore();
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
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const pastLen = store.getState().past.length;

    store.getState().moveNode(id, { x: 0, y: 0 });
    expect(store.getState().past.length).toBe(pastLen);
  });

  it("ignores a move for an unknown node id", () => {
    const store = createMindMapStore();
    store.getState().moveNode("ghost", { x: 1, y: 1 });
    expect(store.getState().graph.nodes).toHaveLength(0);
  });

  it("dropNode re-sides a branch and re-flows the tree when dropped across the root", () => {
    const store = createMindMapStore();
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
    const store = createMindMapStore();
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
    const store = createMindMapStore();
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
    store: ReturnType<typeof createMindMapStore>;
    rootId: NodeId;
    childId: NodeId;
    targetId: NodeId;
  } {
    const store = createMindMapStore();
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
    const store = createMindMapStore();
    const rootId = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().pasteInto(rootId);
    expect(store.getState().graph.nodes).toHaveLength(1);
  });

  it("paste into an unknown target does nothing", () => {
    const { store, rootId } = seedRootChildAndTarget();
    store.getState().copyNode(rootId);
    store.getState().pasteInto("ghost");
    // Only the original three nodes remain (nothing pasted).
    expect(store.getState().graph.nodes).toHaveLength(3);
  });

  it("copy and cut of an unknown node leave the clipboard empty", () => {
    const store = createMindMapStore();
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
    const store = createMindMapStore();
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
    const store = createMindMapStore();
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
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    const before = store.getState().past.length;
    store.getState().reparent(id, id);
    expect(store.getState().past.length).toBe(before);
  });

  it("reparent does nothing when the target is unknown", () => {
    const store = createMindMapStore();
    const id = store.getState().addRoot({ position: { x: 0, y: 0 } });
    store.getState().stopEditing();
    store.getState().reparent(id, "ghost");
    expect(store.getState().graph.nodes.find((n) => n.id === id)?.parentId).toBeNull();
  });

  it("reparent coalesces with the preceding drag into a single undo step", () => {
    const store = createMindMapStore();
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

describe("bindSaver", () => {
  it("schedules a save whenever the graph reference changes", () => {
    const store = createMindMapStore();
    const saver = makeFakeSaver();
    const unbind = bindSaver(store, saver);

    store.getState().addRoot({ position: { x: 0, y: 0 } });
    expect(saver.schedule).toHaveBeenCalledTimes(1);

    store.getState().selectNode("anything" as NodeId);
    // Selection changes don't mutate `graph`, so no extra save is scheduled.
    expect(saver.schedule).toHaveBeenCalledTimes(1);

    const firstNode = store.getState().graph.nodes[0];
    if (!firstNode) throw new Error("expected a node");
    store.getState().updateText(firstNode.id, "new");
    expect(saver.schedule).toHaveBeenCalledTimes(2);

    unbind();
    store.getState().addRoot({ position: { x: 1, y: 1 } });
    expect(saver.schedule).toHaveBeenCalledTimes(2);
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
    // Reset the singleton's graph between tests by clearing every node.
    act(() => {
      const ids = mindMapStore.getState().graph.nodes.map((node) => node.id);
      for (const id of ids) {
        mindMapStore.getState().removeSubtree(id);
      }
    });

    render(<NodeCount />);
    expect(screen.getByTestId("count")).toHaveTextContent("0");

    act(() => {
      mindMapStore.getState().addRoot({ position: { x: 0, y: 0 } });
    });
    expect(screen.getByTestId("count")).toHaveTextContent("1");
  });
});
