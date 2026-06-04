import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mindMapStore } from "../../store/mindmap-store";
import type { CloudNodeType } from "../CloudNode/CloudNode";
import {
  applyNodesChange,
  Canvas,
  findDropTarget,
  handleCanvasKeyDown,
  handleNodeClick,
  handleNodeDoubleClick,
  handleNodeDrag,
  handleNodeDragStop,
  handlePaneClick,
  handlePaneDoubleClick,
  toRFEdges,
} from "./Canvas";

function resetStore(): void {
  act(() => {
    const ids = mindMapStore.getState().graph.nodes.map((node) => node.id);
    for (const id of ids) {
      mindMapStore.getState().removeSubtree(id);
    }
    mindMapStore.getState().selectNode(null);
    mindMapStore.getState().stopEditing();
    mindMapStore.getState().setDropTarget(null);
    // Node creation is guarded behind an active workspace — seed one for the tests.
    mindMapStore.setState({
      activeWorkspaceId: "ws",
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
      editingWorkspaceId: null,
    });
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

function makeRFNode(id: string): CloudNodeType {
  return {
    id,
    type: "cloud",
    position: { x: 0, y: 0 },
    data: { text: "" },
  };
}

describe("Canvas (rendered)", () => {
  it("renders the React Flow canvas wrapper", () => {
    render(<Canvas />);
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
    expect(document.querySelector(".react-flow")).not.toBeNull();
  });

  it("recenters the content on window resize without crashing", () => {
    act(() => {
      mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "C" });
      mindMapStore.getState().stopEditing();
    });
    render(<Canvas />);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    // The resize listener calls fitView; the canvas must stay mounted and intact.
    expect(screen.getByTestId("canvas")).toBeInTheDocument();
  });

  it("removes the selected subtree when Delete is dispatched at window level", () => {
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().addChild({ parentId: rootId, position: { x: 100, y: 0 } });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(rootId);
    });
    render(<Canvas />);

    act(() => {
      fireEvent.keyDown(window, { key: "Delete" });
    });

    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("creates a root node when the empty pane is double-clicked", () => {
    render(<Canvas />);
    const pane = document.querySelector(".react-flow__pane");
    expect(pane).not.toBeNull();
    if (pane === null) throw new Error("pane not found");

    act(() => {
      fireEvent.doubleClick(pane, { clientX: 100, clientY: 80 });
    });

    expect(mindMapStore.getState().graph.nodes.length).toBe(1);
  });

  it("shows the create-workspace hint and blocks root creation when none is active", () => {
    act(() => {
      mindMapStore.setState({ activeWorkspaceId: null, workspaces: [], editingWorkspaceId: null });
    });
    render(<Canvas />);
    expect(screen.getByText("Создайте пространство, чтобы начать работу")).toBeInTheDocument();

    const pane = document.querySelector(".react-flow__pane");
    if (pane === null) throw new Error("pane not found");
    act(() => {
      fireEvent.doubleClick(pane, { clientX: 100, clientY: 80 });
    });
    expect(mindMapStore.getState().graph.nodes).toHaveLength(0);
  });

  it("hides the create-workspace hint when a workspace is active", () => {
    render(<Canvas />);
    expect(screen.queryByText("Создайте пространство, чтобы начать работу")).toBeNull();
  });

  it("ignores double-clicks that originate inside a non-pane element", () => {
    act(() => {
      mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
    });
    const beforeCount = mindMapStore.getState().graph.nodes.length;
    render(<Canvas />);

    const viewport = document.querySelector(".react-flow__viewport") as HTMLElement | null;
    expect(viewport).not.toBeNull();
    if (viewport === null) throw new Error("viewport not found");

    act(() => {
      fireEvent.doubleClick(viewport, { clientX: 50, clientY: 50 });
    });

    expect(mindMapStore.getState().graph.nodes.length).toBe(beforeCount);
  });
});

describe("handleCanvasKeyDown", () => {
  type FakeEvent = KeyboardEvent & { preventDefault: ReturnType<typeof vi.fn> };
  function fakeEvent(
    key: string,
    options: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
  ): FakeEvent {
    const preventDefault = vi.fn();
    return {
      key,
      preventDefault,
      shiftKey: options.shiftKey === true,
      metaKey: options.metaKey === true,
      ctrlKey: options.ctrlKey === true,
      altKey: options.altKey === true,
    } as unknown as FakeEvent;
  }

  it("removes the subtree on Delete", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    const event = fakeEvent("Delete");
    handleCanvasKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("removes the subtree on Backspace", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    handleCanvasKeyDown(fakeEvent("Backspace"));
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("Enter on a root does nothing — a root has no sibling level", () => {
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 10, y: 20 }, text: "R" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(rootId);
    });
    handleCanvasKeyDown(fakeEvent("Enter"));
    const roots = mindMapStore.getState().graph.nodes.filter((n) => n.parentId === null);
    expect(roots).toHaveLength(1);
    expect(mindMapStore.getState().editingNodeId).toBeNull();
  });

  it("Enter on a right-side non-root creates a sibling on the right", () => {
    let rootId = "";
    let childId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      childId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 10, y: 0 },
        text: "C",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(childId);
    });
    handleCanvasKeyDown(fakeEvent("Enter"));
    const rightSiblings = mindMapStore
      .getState()
      .graph.nodes.filter((n) => n.parentId === rootId && n.position.x > 0);
    expect(rightSiblings).toHaveLength(2);
  });

  it("Enter on a left-side non-root creates a sibling on the left", () => {
    let rootId = "";
    let leftChildId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      leftChildId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: -10, y: 0 },
        text: "L",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(leftChildId);
    });
    handleCanvasKeyDown(fakeEvent("Enter"));
    const leftSiblings = mindMapStore
      .getState()
      .graph.nodes.filter((n) => n.parentId === rootId && n.position.x < 0);
    expect(leftSiblings).toHaveLength(2);
  });

  it("Enter inserts the new sibling directly below the selected one, not at the bottom", () => {
    let rootId = "";
    let firstId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      firstId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 10, y: 0 },
        text: "first",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore
        .getState()
        .addChild({ parentId: rootId, position: { x: 10, y: 0 }, text: "last" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(firstId);
    });
    handleCanvasKeyDown(fakeEvent("Enter"));
    const newId = mindMapStore.getState().editingNodeId;
    const siblings = mindMapStore
      .getState()
      .graph.nodes.filter((n) => n.parentId === rootId)
      .sort((a, b) => a.position.y - b.position.y);
    // The freshly created node sits at index 1 — right after "first", before "last".
    expect(siblings[1]?.id).toBe(newId);
  });

  it("Cmd+Enter on a right-side non-root extends the right subtree", () => {
    let rootId = "";
    let rightChildId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      rightChildId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 10, y: 0 },
        text: "C",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(rightChildId);
    });
    handleCanvasKeyDown(fakeEvent("Enter", { metaKey: true }));
    const grandchildren = mindMapStore
      .getState()
      .graph.nodes.filter((n) => n.parentId === rightChildId);
    expect(grandchildren).toHaveLength(1);
    const rightChild = mindMapStore.getState().graph.nodes.find((n) => n.id === rightChildId);
    expect(grandchildren[0]?.position.x).toBeGreaterThan(rightChild?.position.x ?? 0);
  });

  it("Cmd+Enter creates a child of the selected node", () => {
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(rootId);
    });
    handleCanvasKeyDown(fakeEvent("Enter", { metaKey: true }));
    const children = mindMapStore.getState().graph.nodes.filter((n) => n.parentId === rootId);
    expect(children).toHaveLength(1);
    expect(mindMapStore.getState().editingNodeId).toBe(children[0]?.id);
  });

  it("Cmd+Enter on a left-side non-root extends the left subtree", () => {
    let rootId = "";
    let leftChildId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      leftChildId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: -10, y: 0 },
        text: "L",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(leftChildId);
    });
    handleCanvasKeyDown(fakeEvent("Enter", { metaKey: true }));
    const grandchildren = mindMapStore
      .getState()
      .graph.nodes.filter((n) => n.parentId === leftChildId);
    expect(grandchildren).toHaveLength(1);
    // The grandchild belongs to the left subtree.
    const grandchild = grandchildren[0];
    const leftChild = mindMapStore.getState().graph.nodes.find((n) => n.id === leftChildId);
    expect(grandchild && leftChild && grandchild.position.x).toBeLessThan(
      leftChild?.position.x ?? 0,
    );
  });

  it("starts editing on F2", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    handleCanvasKeyDown(fakeEvent("F2"));
    expect(mindMapStore.getState().editingNodeId).toBe(id);
  });

  it("clears the selection on Escape", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    handleCanvasKeyDown(fakeEvent("Escape"));
    expect(mindMapStore.getState().selectedNodeId).toBeNull();
  });

  it("ignores keys while editing is in progress", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().selectNode(id);
    });
    expect(mindMapStore.getState().editingNodeId).toBe(id);
    handleCanvasKeyDown(fakeEvent("Delete"));
    expect(mindMapStore.getState().graph.nodes.length).toBe(1);
  });

  it("ignores key events whose target is a focused input (editor owns them)", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    const input = document.createElement("input");
    const event = {
      key: "Delete",
      preventDefault: vi.fn(),
      target: input,
    } as unknown as KeyboardEvent;
    handleCanvasKeyDown(event);
    expect(mindMapStore.getState().graph.nodes).toHaveLength(1);
  });

  it("ignores keys when nothing is selected", () => {
    handleCanvasKeyDown(fakeEvent("Delete"));
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("ignores unrelated keys when a node is selected", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    handleCanvasKeyDown(fakeEvent("a"));
    expect(mindMapStore.getState().selectedNodeId).toBe(id);
    expect(mindMapStore.getState().editingNodeId).toBeNull();
  });

  it("arrow keys move the selection to the nearest neighbor in the requested direction", () => {
    let rootId = "";
    let rightChildId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      rightChildId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 10, y: 0 },
        text: "C",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(rootId);
    });
    handleCanvasKeyDown(fakeEvent("ArrowRight"));
    expect(mindMapStore.getState().selectedNodeId).toBe(rightChildId);
    handleCanvasKeyDown(fakeEvent("ArrowLeft"));
    expect(mindMapStore.getState().selectedNodeId).toBe(rootId);
  });

  it("Alt+ArrowLeft walks the focus history back without moving the selection spatially", async () => {
    let a = "";
    act(() => {
      a = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(a);
      const b = mindMapStore.getState().addRoot({ position: { x: 200, y: 0 }, text: "B" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(b);
    });
    const event = fakeEvent("ArrowLeft", { altKey: true });
    handleCanvasKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(mindMapStore.getState().selectedNodeId).toBe(a);
    });
  });

  it("Alt+ArrowRight walks the focus history forward", async () => {
    let b = "";
    act(() => {
      const a = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(a);
      b = mindMapStore.getState().addRoot({ position: { x: 200, y: 0 }, text: "B" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(b);
    });
    await act(async () => {
      await mindMapStore.getState().goBack();
    });
    const event = fakeEvent("ArrowRight", { altKey: true });
    handleCanvasKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(mindMapStore.getState().selectedNodeId).toBe(b);
    });
  });

  it("Cmd+ArrowLeft also walks the focus history back", async () => {
    let a = "";
    act(() => {
      a = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(a);
      const b = mindMapStore.getState().addRoot({ position: { x: 200, y: 0 }, text: "B" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(b);
    });
    const event = fakeEvent("ArrowLeft", { metaKey: true });
    handleCanvasKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(mindMapStore.getState().selectedNodeId).toBe(a);
    });
  });

  it("Ctrl+ArrowRight also walks the focus history forward", async () => {
    let b = "";
    act(() => {
      const a = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(a);
      b = mindMapStore.getState().addRoot({ position: { x: 200, y: 0 }, text: "B" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(b);
    });
    await act(async () => {
      await mindMapStore.getState().goBack();
    });
    const event = fakeEvent("ArrowRight", { ctrlKey: true });
    handleCanvasKeyDown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    await waitFor(() => {
      expect(mindMapStore.getState().selectedNodeId).toBe(b);
    });
  });

  it("arrow keys anchor on the first root when nothing is selected yet", () => {
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(null);
    });
    handleCanvasKeyDown(fakeEvent("ArrowDown"));
    expect(mindMapStore.getState().selectedNodeId).toBe(rootId);
  });

  it("arrow keys do nothing when there is neither selection nor any root", () => {
    handleCanvasKeyDown(fakeEvent("ArrowDown"));
    expect(mindMapStore.getState().selectedNodeId).toBeNull();
  });

  it("arrow keys do nothing when no neighbor lies in the requested direction", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    handleCanvasKeyDown(fakeEvent("ArrowLeft"));
    expect(mindMapStore.getState().selectedNodeId).toBe(id);
  });

  it("ArrowUp moves the selection to a node above", () => {
    let topId = "";
    let bottomId = "";
    act(() => {
      topId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "T" });
      bottomId = mindMapStore.getState().addRoot({ position: { x: 0, y: 200 }, text: "B" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(bottomId);
    });
    handleCanvasKeyDown(fakeEvent("ArrowUp"));
    expect(mindMapStore.getState().selectedNodeId).toBe(topId);
  });

  it("Enter silently does nothing when the selected id has no matching node", () => {
    act(() => {
      mindMapStore.getState().selectNode("ghost");
    });
    handleCanvasKeyDown(fakeEvent("Enter"));
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("Cmd+Enter silently does nothing when the selected id has no matching node", () => {
    act(() => {
      mindMapStore.getState().selectNode("ghost");
    });
    handleCanvasKeyDown(fakeEvent("Enter", { metaKey: true }));
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("undoes on Cmd+Z and redoes on Cmd+Shift+Z", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().dropNode(id, { x: 50, y: 0 });
    });
    const undoEvent = fakeEvent("z", { metaKey: true });
    handleCanvasKeyDown(undoEvent);
    expect(undoEvent.preventDefault).toHaveBeenCalled();
    expect(mindMapStore.getState().graph.nodes[0]?.position.x).toBe(0);
    handleCanvasKeyDown(fakeEvent("z", { metaKey: true, shiftKey: true }));
    expect(mindMapStore.getState().graph.nodes[0]?.position.x).toBe(50);
  });

  it("redoes on Ctrl+Y", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().dropNode(id, { x: 50, y: 0 });
    });
    handleCanvasKeyDown(fakeEvent("z", { ctrlKey: true }));
    expect(mindMapStore.getState().graph.nodes[0]?.position.x).toBe(0);
    handleCanvasKeyDown(fakeEvent("y", { ctrlKey: true }));
    expect(mindMapStore.getState().graph.nodes[0]?.position.x).toBe(50);
  });

  it("leaves Cmd+Z to the native input undo while editing a node", () => {
    act(() => {
      mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      // No stopEditing — the node stays in editing mode.
    });
    const before = mindMapStore.getState().graph;
    handleCanvasKeyDown(fakeEvent("z", { metaKey: true }));
    expect(mindMapStore.getState().graph).toBe(before);
  });

  it("ignores Cmd+key combinations other than z / y", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    handleCanvasKeyDown(fakeEvent("a", { metaKey: true }));
    expect(mindMapStore.getState().graph.nodes).toHaveLength(1);
    expect(mindMapStore.getState().selectedNodeId).toBe(id);
  });

  it("copies a subtree with Cmd+C and pastes it under the selected target with Cmd+V", () => {
    let rootId = "";
    let childId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      childId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 100, y: 0 },
        text: "C",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(childId);
    });
    handleCanvasKeyDown(fakeEvent("c", { metaKey: true }));
    act(() => {
      mindMapStore.getState().selectNode(rootId);
    });
    handleCanvasKeyDown(fakeEvent("v", { metaKey: true }));
    expect(mindMapStore.getState().graph.nodes.filter((n) => n.text === "C")).toHaveLength(2);
  });

  it("cuts a subtree with Cmd+X", () => {
    let rootId = "";
    let childId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      childId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 100, y: 0 },
        text: "C",
      });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(childId);
    });
    handleCanvasKeyDown(fakeEvent("x", { ctrlKey: true }));
    expect(mindMapStore.getState().graph.nodes.some((n) => n.id === childId)).toBe(false);
  });

  it("ignores Cmd+C / Cmd+X / Cmd+V when nothing is selected", () => {
    const event = fakeEvent("c", { metaKey: true });
    handleCanvasKeyDown(event);
    handleCanvasKeyDown(fakeEvent("x", { metaKey: true }));
    handleCanvasKeyDown(fakeEvent("v", { metaKey: true }));
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("Enter on an orphan (parent id points to a missing node) does not create a sibling", () => {
    act(() => {
      mindMapStore.setState({
        graph: {
          nodes: [{ id: "orphan", parentId: "ghost", text: "", position: { x: 0, y: 0 } }],
          edges: [],
        },
        selectedNodeId: "orphan",
        editingNodeId: null,
      });
    });
    handleCanvasKeyDown(fakeEvent("Enter"));
    expect(mindMapStore.getState().graph.nodes).toHaveLength(1);
  });
});

describe("handleNodeClick / handleNodeDoubleClick", () => {
  it("selects the clicked node", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
    });
    handleNodeClick(null, makeRFNode(id));
    expect(mindMapStore.getState().selectedNodeId).toBe(id);
  });

  it("enters editing on double-click and stops event propagation", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
    });
    const event = { stopPropagation: vi.fn() };
    handleNodeDoubleClick(event, makeRFNode(id));
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(mindMapStore.getState().editingNodeId).toBe(id);
  });
});

describe("handlePaneClick", () => {
  it("clears selection and exits editing if active", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().selectNode(id);
    });
    expect(mindMapStore.getState().editingNodeId).toBe(id);

    handlePaneClick();
    expect(mindMapStore.getState().selectedNodeId).toBeNull();
    expect(mindMapStore.getState().editingNodeId).toBeNull();
  });

  it("just clears selection when nothing is being edited", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "X" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });

    handlePaneClick();
    expect(mindMapStore.getState().selectedNodeId).toBeNull();
    expect(mindMapStore.getState().editingNodeId).toBeNull();
  });
});

describe("handlePaneDoubleClick", () => {
  function fakeEvent(target: HTMLElement): {
    target: HTMLElement;
    clientX: number;
    clientY: number;
  } {
    return { target, clientX: 30, clientY: 40 };
  }

  it("creates a root node at the projected position when the target is the pane", () => {
    const pane = document.createElement("div");
    pane.classList.add("react-flow__pane");
    const screenToFlowPosition = vi.fn(({ x, y }) => ({ x: x + 1, y: y + 2 }));

    handlePaneDoubleClick(
      fakeEvent(pane) as unknown as Parameters<typeof handlePaneDoubleClick>[0],
      screenToFlowPosition,
    );

    expect(screenToFlowPosition).toHaveBeenCalledWith({ x: 30, y: 40 });
    expect(mindMapStore.getState().graph.nodes).toHaveLength(1);
    expect(mindMapStore.getState().graph.nodes[0]?.position).toEqual({ x: 31, y: 42 });
  });

  it("does nothing when the double-clicked target is not the pane", () => {
    const node = document.createElement("div");
    node.classList.add("not-a-pane");
    const screenToFlowPosition = vi.fn();

    handlePaneDoubleClick(
      fakeEvent(node) as unknown as Parameters<typeof handlePaneDoubleClick>[0],
      screenToFlowPosition,
    );

    expect(screenToFlowPosition).not.toHaveBeenCalled();
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });
});

describe("applyNodesChange", () => {
  it("streams in-progress drag positions (dragging:true) so the node tracks the cursor", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 1, y: 2 }, text: "X" });
      mindMapStore.getState().stopEditing();
    });

    applyNodesChange([{ id, type: "position", position: { x: 99, y: 99 }, dragging: true }]);
    expect(mindMapStore.getState().graph.nodes[0]?.position).toEqual({ x: 99, y: 99 });
  });

  it("ignores the dragging:false change — the drop is finalised by handleNodeDragStop", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 1, y: 2 }, text: "X" });
      mindMapStore.getState().stopEditing();
    });

    applyNodesChange([{ id, type: "position", position: { x: 42, y: 17 }, dragging: false }]);
    expect(mindMapStore.getState().graph.nodes[0]?.position).toEqual({ x: 1, y: 2 });
  });

  it("ignores position changes without a position payload", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 1, y: 2 }, text: "X" });
      mindMapStore.getState().stopEditing();
    });

    applyNodesChange([{ id, type: "position", dragging: true }]);
    expect(mindMapStore.getState().graph.nodes[0]?.position).toEqual({ x: 1, y: 2 });
  });

  it("ignores non-position changes (dimensions, selection)", () => {
    let id = "";
    act(() => {
      id = mindMapStore.getState().addRoot({ position: { x: 3, y: 4 }, text: "X" });
      mindMapStore.getState().stopEditing();
    });

    applyNodesChange([
      { id, type: "dimensions", dimensions: { width: 200, height: 50 } },
      { id, type: "select", selected: true },
    ]);
    expect(mindMapStore.getState().graph.nodes[0]?.position).toEqual({ x: 3, y: 4 });
  });
});

describe("findDropTarget", () => {
  it("returns the node whose box contains the dragged node's centre", () => {
    const graph = {
      nodes: [
        { id: "a", text: "A", parentId: null, position: { x: 0, y: 0 } },
        { id: "b", text: "B", parentId: null, position: { x: 500, y: 500 } },
      ],
      edges: [],
    };
    expect(findDropTarget(graph, "a", { x: 500, y: 500 })).toBe("b");
  });

  it("returns null when the centre is over empty canvas", () => {
    const graph = {
      nodes: [{ id: "a", text: "A", parentId: null, position: { x: 0, y: 0 } }],
      edges: [],
    };
    expect(findDropTarget(graph, "a", { x: 9000, y: 9000 })).toBeNull();
  });

  it("skips the dragged node and its own subtree", () => {
    const graph = {
      nodes: [
        { id: "a", text: "A", parentId: null, position: { x: 0, y: 0 } },
        { id: "b", text: "B", parentId: "a", position: { x: 200, y: 0 } },
      ],
      edges: [{ id: "e", source: "a", target: "b" }],
    };
    // Drag the root so its centre lands on its own child b — not a valid target.
    expect(findDropTarget(graph, "a", { x: 200, y: 0 })).toBeNull();
  });

  it("returns null when the dragged node is unknown", () => {
    const graph = {
      nodes: [{ id: "a", text: "A", parentId: null, position: { x: 0, y: 0 } }],
      edges: [],
    };
    expect(findDropTarget(graph, "ghost", { x: 0, y: 0 })).toBeNull();
  });

  it("ignores a node the centre overlaps horizontally but not vertically", () => {
    const graph = {
      nodes: [
        { id: "a", text: "A", parentId: null, position: { x: 0, y: 0 } },
        { id: "b", text: "B", parentId: null, position: { x: 500, y: 500 } },
      ],
      edges: [],
    };
    // Same column as b, but far below its box.
    expect(findDropTarget(graph, "a", { x: 500, y: 5000 })).toBeNull();
    // Same column as b, but far above its box.
    expect(findDropTarget(graph, "a", { x: 500, y: -5000 })).toBeNull();
  });
});

describe("handleNodeDrag / handleNodeDragStop", () => {
  function rfNodeAt(id: string, x: number, y: number): CloudNodeType {
    return { id, type: "cloud", position: { x, y }, data: { text: "" } };
  }

  it("handleNodeDrag highlights the node under the dragged node's centre", () => {
    let aId = "";
    let bId = "";
    act(() => {
      aId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
      mindMapStore.getState().stopEditing();
      bId = mindMapStore.getState().addRoot({ position: { x: 500, y: 500 }, text: "B" });
      mindMapStore.getState().stopEditing();
    });
    handleNodeDrag(null, rfNodeAt(aId, 500, 500));
    expect(mindMapStore.getState().dropTargetId).toBe(bId);
  });

  it("handleNodeDragStop re-parents onto the drop target and clears it", () => {
    let aId = "";
    let bId = "";
    act(() => {
      aId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
      mindMapStore.getState().stopEditing();
      bId = mindMapStore.getState().addRoot({ position: { x: 500, y: 0 }, text: "B" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().setDropTarget(bId);
    });
    handleNodeDragStop(null, rfNodeAt(aId, 500, 0));
    expect(mindMapStore.getState().graph.nodes.find((n) => n.id === aId)?.parentId).toBe(bId);
    expect(mindMapStore.getState().dropTargetId).toBeNull();
  });

  it("handleNodeDragStop realigns via dropNode when there is no drop target", () => {
    let aId = "";
    act(() => {
      aId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "A" });
      mindMapStore.getState().stopEditing();
    });
    handleNodeDragStop(null, rfNodeAt(aId, 33, 44));
    expect(mindMapStore.getState().graph.nodes[0]?.position).toEqual({ x: 33, y: 44 });
    expect(mindMapStore.getState().dropTargetId).toBeNull();
  });
});

describe("toRFEdges", () => {
  it("routes through the right-source / left-target handles when the child is to the right of the parent", () => {
    const edges = toRFEdges({
      nodes: [
        { id: "p", text: "", position: { x: 0, y: 0 }, parentId: null },
        { id: "c", text: "", position: { x: 100, y: 0 }, parentId: "p" },
      ],
      edges: [{ id: "e", source: "p", target: "c" }],
    });
    expect(edges).toEqual([
      {
        id: "e",
        source: "p",
        target: "c",
        sourceHandle: "source-right",
        targetHandle: "target-left",
      },
    ]);
  });

  it("routes through the left-source / right-target handles when the child is to the left of the parent", () => {
    const edges = toRFEdges({
      nodes: [
        { id: "p", text: "", position: { x: 0, y: 0 }, parentId: null },
        { id: "c", text: "", position: { x: -100, y: 0 }, parentId: "p" },
      ],
      edges: [{ id: "e", source: "p", target: "c" }],
    });
    expect(edges).toEqual([
      {
        id: "e",
        source: "p",
        target: "c",
        sourceHandle: "source-left",
        targetHandle: "target-right",
      },
    ]);
  });

  it("drops edges whose endpoints are missing from the node list", () => {
    const edges = toRFEdges({
      nodes: [{ id: "p", text: "", position: { x: 0, y: 0 }, parentId: null }],
      edges: [
        { id: "dangling-target", source: "p", target: "ghost" },
        { id: "dangling-source", source: "ghost", target: "p" },
      ],
    });
    expect(edges).toEqual([]);
  });
});
