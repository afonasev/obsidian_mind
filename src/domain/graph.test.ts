import { describe, expect, it } from "vitest";
import {
  addChild,
  addRoot,
  createEmpty,
  extractSubtree,
  moveNode,
  pasteSubtree,
  removeSubtree,
  reparentSubtree,
  type Subtree,
  updateText,
} from "./graph";
import type { Graph, NodeId } from "./types";

describe("createEmpty", () => {
  it("returns a graph with no nodes and no edges", () => {
    const graph = createEmpty();
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});

describe("addRoot", () => {
  it("appends a node with null parent and default empty text", () => {
    const { graph, nodeId } = addRoot(createEmpty(), { position: { x: 10, y: 20 } });
    expect(graph.nodes).toHaveLength(1);
    const [created] = graph.nodes;
    if (!created) throw new Error("expected created node");
    expect(created.id).toBe(nodeId);
    expect(created.text).toBe("");
    expect(created.position).toEqual({ x: 10, y: 20 });
    expect(created.parentId).toBeNull();
    expect(graph.edges).toEqual([]);
  });

  it("preserves explicit text when provided", () => {
    const { graph } = addRoot(createEmpty(), {
      position: { x: 0, y: 0 },
      text: "Корень",
    });
    expect(graph.nodes[0]?.text).toBe("Корень");
  });

  it("allows multiple independent roots", () => {
    const first = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const second = addRoot(first.graph, { position: { x: 100, y: 0 } });
    expect(second.graph.nodes).toHaveLength(2);
    expect(second.graph.edges).toEqual([]);
    expect(second.nodeId).not.toBe(first.nodeId);
  });
});

describe("addChild", () => {
  it("creates a child node and an edge from parent to child", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const { graph, nodeId, edgeId } = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 200, y: 0 },
      text: "Ребёнок",
    });
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
    const child = graph.nodes.find((node) => node.id === nodeId);
    expect(child?.parentId).toBe(root.nodeId);
    expect(child?.text).toBe("Ребёнок");
    const [edge] = graph.edges;
    expect(edge?.id).toBe(edgeId);
    expect(edge?.source).toBe(root.nodeId);
    expect(edge?.target).toBe(nodeId);
  });

  it("defaults child text to empty string when omitted", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const child = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 1, y: 1 },
    });
    const created = child.graph.nodes.find((node) => node.id === child.nodeId);
    expect(created?.text).toBe("");
  });

  it("throws when the parent is missing", () => {
    expect(() =>
      addChild(createEmpty(), { parentId: "missing" as NodeId, position: { x: 0, y: 0 } }),
    ).toThrow(/Parent node not found/);
  });
});

describe("removeSubtree", () => {
  it("removes a leaf node and the edge leading to it", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const child = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 1, y: 1 },
    });
    const after = removeSubtree(child.graph, { nodeId: child.nodeId });
    expect(after.nodes).toHaveLength(1);
    expect(after.nodes[0]?.id).toBe(root.nodeId);
    expect(after.edges).toEqual([]);
  });

  it("removes the entire descendant chain when removing a root", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const child = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 1, y: 0 },
    });
    const grandchild = addChild(child.graph, {
      parentId: child.nodeId,
      position: { x: 2, y: 0 },
    });
    const after = removeSubtree(grandchild.graph, { nodeId: root.nodeId });
    expect(after.nodes).toEqual([]);
    expect(after.edges).toEqual([]);
  });

  it("returns the same graph reference when the target node is missing", () => {
    const graph = createEmpty();
    const after = removeSubtree(graph, { nodeId: "missing" as NodeId });
    expect(after).toBe(graph);
  });

  it("does not affect sibling subtrees", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const left = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: -1, y: 1 },
    });
    const right = addChild(left.graph, {
      parentId: root.nodeId,
      position: { x: 1, y: 1 },
    });
    const after = removeSubtree(right.graph, { nodeId: left.nodeId });
    expect(after.nodes.map((node) => node.id).sort()).toEqual([root.nodeId, right.nodeId].sort());
    expect(after.edges).toHaveLength(1);
    expect(after.edges[0]?.target).toBe(right.nodeId);
  });

  it("skips already-visited targets when collecting the subtree (diamond shape)", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const a = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 1, y: 0 },
    });
    const diamond: Graph = {
      nodes: a.graph.nodes,
      edges: [...a.graph.edges, { id: "dup-edge", source: root.nodeId, target: a.nodeId }],
    };
    const after = removeSubtree(diamond, { nodeId: root.nodeId });
    expect(after.nodes).toEqual([]);
    expect(after.edges).toEqual([]);
  });

  it("tolerates malformed queue state without crashing", () => {
    // BFS impl pops from queue head; covers the `current === undefined` guard via shift().
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const result = removeSubtree(root.graph, { nodeId: root.nodeId });
    expect(result.nodes).toEqual([]);
  });
});

describe("updateText", () => {
  it("changes the text of the targeted node only", () => {
    const root = addRoot(createEmpty(), {
      position: { x: 0, y: 0 },
      text: "old",
    });
    const sibling = addRoot(root.graph, {
      position: { x: 50, y: 0 },
      text: "untouched",
    });
    const after = updateText(sibling.graph, { nodeId: root.nodeId, text: "new" });
    expect(after.nodes.find((node) => node.id === root.nodeId)?.text).toBe("new");
    expect(after.nodes.find((node) => node.id === sibling.nodeId)?.text).toBe("untouched");
  });

  it("returns a graph with the same shape if no node matches", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const after = updateText(root.graph, { nodeId: "missing" as NodeId, text: "x" });
    expect(after.nodes).toEqual(root.graph.nodes);
  });
});

describe("moveNode", () => {
  it("updates the position of the targeted node only", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const after = moveNode(root.graph, {
      nodeId: root.nodeId,
      position: { x: 42, y: 99 },
    });
    expect(after.nodes[0]?.position).toEqual({ x: 42, y: 99 });
  });

  it("leaves other nodes' positions intact", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const sibling = addRoot(root.graph, { position: { x: 5, y: 5 } });
    const after = moveNode(sibling.graph, {
      nodeId: root.nodeId,
      position: { x: 100, y: 100 },
    });
    expect(after.nodes.find((node) => node.id === sibling.nodeId)?.position).toEqual({
      x: 5,
      y: 5,
    });
  });
});

describe("extractSubtree", () => {
  it("returns null for an unknown node", () => {
    expect(extractSubtree(createEmpty(), "ghost")).toBeNull();
  });

  it("snapshots the node, its descendants and only the internal edges", () => {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 }, text: "R" });
    const child = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 10, y: 0 },
      text: "C",
    });
    const grand = addChild(child.graph, {
      parentId: child.nodeId,
      position: { x: 20, y: 0 },
      text: "G",
    });

    const clip = extractSubtree(grand.graph, child.nodeId);
    expect(clip?.rootId).toBe(child.nodeId);
    expect(clip?.nodes.map((n) => n.text).sort()).toEqual(["C", "G"]);
    // Only the C→G edge is internal; the R→C edge is excluded.
    expect(clip?.edges).toHaveLength(1);
    expect(clip?.edges[0]?.target).toBe(grand.nodeId);
  });
});

describe("pasteSubtree", () => {
  function sampleClip(): Subtree {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 }, text: "C" });
    const grand = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 10, y: 0 },
      text: "G",
    });
    const clip = extractSubtree(grand.graph, root.nodeId);
    if (clip === null) throw new Error("expected a clip");
    return clip;
  }

  it("clones the subtree with fresh ids under the target and links it", () => {
    const target = addRoot(createEmpty(), { position: { x: 100, y: 100 }, text: "T" });
    const clip = sampleClip();

    const { graph, rootId } = pasteSubtree(target.graph, clip, target.nodeId, { x: 160, y: 100 });
    expect(graph.nodes).toHaveLength(3); // T + cloned C + cloned G
    const cloneRoot = graph.nodes.find((n) => n.id === rootId);
    expect(cloneRoot?.text).toBe("C");
    expect(cloneRoot?.parentId).toBe(target.nodeId);
    // Fresh ids — none of the clip ids reappear.
    const clipIds = new Set(clip.nodes.map((n) => n.id));
    expect(graph.nodes.some((n) => clipIds.has(n.id))).toBe(false);
    // Link edge target→cloneRoot plus the internal C→G edge.
    expect(graph.edges.filter((e) => e.source === target.nodeId)).toHaveLength(1);
  });

  it("clones a node that has several children", () => {
    const target = addRoot(createEmpty(), { position: { x: 0, y: 0 }, text: "T" });
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 }, text: "P" });
    const a = addChild(root.graph, { parentId: root.nodeId, position: { x: 10, y: 0 }, text: "A" });
    const b = addChild(a.graph, { parentId: root.nodeId, position: { x: 10, y: 20 }, text: "B" });
    const clip = extractSubtree(b.graph, root.nodeId);
    if (clip === null) throw new Error("expected a clip");

    const { graph } = pasteSubtree(target.graph, clip, target.nodeId, { x: 50, y: 0 });
    expect(graph.nodes).toHaveLength(4); // T + cloned P, A, B
    expect(graph.nodes.filter((n) => ["A", "B"].includes(n.text))).toHaveLength(2);
  });

  it("throws when the target is missing", () => {
    expect(() => pasteSubtree(createEmpty(), sampleClip(), "ghost", { x: 0, y: 0 })).toThrow();
  });

  it("throws when the clipboard subtree has no root node", () => {
    const target = addRoot(createEmpty(), { position: { x: 0, y: 0 } });
    const broken: Subtree = { rootId: "missing", nodes: [], edges: [] };
    expect(() => pasteSubtree(target.graph, broken, target.nodeId, { x: 0, y: 0 })).toThrow();
  });

  it("skips clip edges that point to a node absent from the clip", () => {
    const target = addRoot(createEmpty(), { position: { x: 0, y: 0 }, text: "T" });
    // A clip whose only node is the root, but with a dangling edge to a ghost child.
    const broken: Subtree = {
      rootId: "r",
      nodes: [{ id: "r", text: "R", position: { x: 0, y: 0 }, parentId: null }],
      edges: [{ id: "e", source: "r", target: "ghost" }],
    };
    const { graph } = pasteSubtree(target.graph, broken, target.nodeId, { x: 50, y: 0 });
    // Only the cloned root is added (the dangling child is skipped).
    expect(graph.nodes).toHaveLength(2);
  });
});

describe("reparentSubtree", () => {
  function tree(): { graph: Graph; rootId: NodeId; aId: NodeId; bId: NodeId; childId: NodeId } {
    const root = addRoot(createEmpty(), { position: { x: 0, y: 0 }, text: "R" });
    const a = addChild(root.graph, {
      parentId: root.nodeId,
      position: { x: 100, y: 0 },
      text: "A",
    });
    const b = addChild(a.graph, { parentId: root.nodeId, position: { x: 100, y: 50 }, text: "B" });
    const child = addChild(b.graph, { parentId: a.nodeId, position: { x: 200, y: 0 }, text: "C" });
    return {
      graph: child.graph,
      rootId: root.nodeId,
      aId: a.nodeId,
      bId: b.nodeId,
      childId: child.nodeId,
    };
  }

  it("re-attaches the node under the new parent and swaps its incoming edge", () => {
    const { graph, aId, bId } = tree();
    const next = reparentSubtree(graph, {
      nodeId: aId,
      newParentId: bId,
      position: { x: 9, y: 9 },
    });
    expect(next.nodes.find((n) => n.id === aId)?.parentId).toBe(bId);
    expect(next.nodes.find((n) => n.id === aId)?.position).toEqual({ x: 9, y: 9 });
    expect(next.edges.filter((e) => e.target === aId)).toHaveLength(1);
    expect(next.edges.find((e) => e.target === aId)?.source).toBe(bId);
  });

  it("returns the same graph for an unknown node or unknown parent", () => {
    const { graph, aId } = tree();
    expect(
      reparentSubtree(graph, { nodeId: "ghost", newParentId: aId, position: { x: 0, y: 0 } }),
    ).toBe(graph);
    expect(
      reparentSubtree(graph, { nodeId: aId, newParentId: "ghost", position: { x: 0, y: 0 } }),
    ).toBe(graph);
  });

  it("returns the same graph when attaching to itself or to the current parent", () => {
    const { graph, aId, rootId } = tree();
    expect(
      reparentSubtree(graph, { nodeId: aId, newParentId: aId, position: { x: 0, y: 0 } }),
    ).toBe(graph);
    // A is already a child of the root.
    expect(
      reparentSubtree(graph, { nodeId: aId, newParentId: rootId, position: { x: 0, y: 0 } }),
    ).toBe(graph);
  });

  it("returns the same graph when the target is inside the moved subtree (cycle guard)", () => {
    const { graph, aId, childId } = tree();
    // C is a descendant of A — moving A under C would create a cycle.
    expect(
      reparentSubtree(graph, { nodeId: aId, newParentId: childId, position: { x: 0, y: 0 } }),
    ).toBe(graph);
  });
});
