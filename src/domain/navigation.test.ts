import { describe, expect, it } from "vitest";
import { findNeighbor } from "./navigation";
import type { Graph, MindNode } from "./types";

function node(id: string, x: number, y: number, parentId: string | null = null): MindNode {
  return { id, parentId, text: "", position: { x, y } };
}

function graphOf(...nodes: MindNode[]): Graph {
  return { nodes, edges: [] };
}

const NONE: ReadonlySet<string> = new Set();

describe("findNeighbor", () => {
  it("returns null when the source node id is unknown", () => {
    expect(findNeighbor(graphOf(node("a", 0, 0)), "ghost", "left", NONE)).toBeNull();
  });

  it("returns null when no candidate lies in the requested half-plane", () => {
    const g = graphOf(node("a", 0, 0), node("b", 100, 0));
    expect(findNeighbor(g, "b", "right", NONE)).toBeNull();
    expect(findNeighbor(g, "a", "left", NONE)).toBeNull();
    expect(findNeighbor(g, "a", "up", NONE)).toBeNull();
    expect(findNeighbor(g, "a", "down", NONE)).toBeNull();
  });

  it("picks the nearest node along the same row for left/right", () => {
    const g = graphOf(
      node("a", 0, 0),
      node("b", 100, 0),
      node("c", 200, 0),
      // same x as b but offset in y — should lose to b when starting from a/right.
      node("d", 100, 80),
    );
    expect(findNeighbor(g, "a", "right", NONE)).toBe("b");
    expect(findNeighbor(g, "c", "left", NONE)).toBe("b");
  });

  it("prefers same-column candidates for up/down even when another node is closer Euclideanly", () => {
    const g = graphOf(
      node("a", 0, 0),
      // exactly below a but far in y.
      node("b", 0, 100),
      // closer in straight-line distance but off-column.
      node("c", 50, 50),
    );
    expect(findNeighbor(g, "a", "down", NONE)).toBe("b");
    expect(findNeighbor(g, "b", "up", NONE)).toBe("a");
  });

  it("breaks same-row ties by closest along the primary direction", () => {
    const g = graphOf(node("a", 0, 0), node("b", 100, 0), node("c", 200, 0));
    expect(findNeighbor(g, "a", "right", NONE)).toBe("b");
  });

  it("ignores nodes on the boundary (Δx === 0 for left/right, Δy === 0 for up/down)", () => {
    const g = graphOf(node("a", 0, 0), node("b", 0, 50));
    // b is directly below a — no horizontal motion, so neither right nor left applies.
    expect(findNeighbor(g, "a", "right", NONE)).toBeNull();
    expect(findNeighbor(g, "a", "left", NONE)).toBeNull();
    // But b is below a, so down works.
    expect(findNeighbor(g, "a", "down", NONE)).toBe("b");
  });

  it("does not select a hidden descendant when navigating from a collapsed node", () => {
    // a → b (collapsed) → c; c sits to the right of b but is hidden.
    const g: Graph = {
      nodes: [node("a", 0, 0), node("b", 100, 0, "a"), node("c", 200, 0, "b")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ],
    };
    expect(findNeighbor(g, "b", "right", new Set(["b"]))).toBeNull();
  });

  it("still reaches visible neighbours when some other branch is collapsed", () => {
    // a has visible child b (right) and a collapsed branch d→e elsewhere.
    const g: Graph = {
      nodes: [
        node("a", 0, 0),
        node("b", 100, 0, "a"),
        node("d", 0, 100, "a"),
        node("e", 0, 200, "d"),
      ],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "a", target: "d" },
        { id: "e3", source: "d", target: "e" },
      ],
    };
    // e is hidden under collapsed d, but b stays reachable to the right of a.
    expect(findNeighbor(g, "a", "right", new Set(["d"]))).toBe("b");
    // d itself (the collapsed node) stays visible below a.
    expect(findNeighbor(g, "a", "down", new Set(["d"]))).toBe("d");
  });

  it("treats an empty collapsed set identically to the unfiltered behaviour", () => {
    const g: Graph = {
      nodes: [node("a", 0, 0), node("b", 100, 0, "a"), node("c", 200, 0, "b")],
      edges: [
        { id: "e1", source: "a", target: "b" },
        { id: "e2", source: "b", target: "c" },
      ],
    };
    // With nothing collapsed, the descendant c is a normal candidate.
    expect(findNeighbor(g, "b", "right", NONE)).toBe("c");
  });
});
