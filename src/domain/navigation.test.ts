import { describe, expect, it } from "vitest";
import { findNeighbor } from "./navigation";
import type { Graph, MindNode } from "./types";

function node(id: string, x: number, y: number): MindNode {
  return { id, parentId: null, text: "", position: { x, y } };
}

function graphOf(...nodes: MindNode[]): Graph {
  return { nodes, edges: [] };
}

describe("findNeighbor", () => {
  it("returns null when the source node id is unknown", () => {
    expect(findNeighbor(graphOf(node("a", 0, 0)), "ghost", "left")).toBeNull();
  });

  it("returns null when no candidate lies in the requested half-plane", () => {
    const g = graphOf(node("a", 0, 0), node("b", 100, 0));
    expect(findNeighbor(g, "b", "right")).toBeNull();
    expect(findNeighbor(g, "a", "left")).toBeNull();
    expect(findNeighbor(g, "a", "up")).toBeNull();
    expect(findNeighbor(g, "a", "down")).toBeNull();
  });

  it("picks the nearest node along the same row for left/right", () => {
    const g = graphOf(
      node("a", 0, 0),
      node("b", 100, 0),
      node("c", 200, 0),
      // same x as b but offset in y — should lose to b when starting from a/right.
      node("d", 100, 80),
    );
    expect(findNeighbor(g, "a", "right")).toBe("b");
    expect(findNeighbor(g, "c", "left")).toBe("b");
  });

  it("prefers same-column candidates for up/down even when another node is closer Euclideanly", () => {
    const g = graphOf(
      node("a", 0, 0),
      // exactly below a but far in y.
      node("b", 0, 100),
      // closer in straight-line distance but off-column.
      node("c", 50, 50),
    );
    expect(findNeighbor(g, "a", "down")).toBe("b");
    expect(findNeighbor(g, "b", "up")).toBe("a");
  });

  it("breaks same-row ties by closest along the primary direction", () => {
    const g = graphOf(node("a", 0, 0), node("b", 100, 0), node("c", 200, 0));
    expect(findNeighbor(g, "a", "right")).toBe("b");
  });

  it("ignores nodes on the boundary (Δx === 0 for left/right, Δy === 0 for up/down)", () => {
    const g = graphOf(node("a", 0, 0), node("b", 0, 50));
    // b is directly below a — no horizontal motion, so neither right nor left applies.
    expect(findNeighbor(g, "a", "right")).toBeNull();
    expect(findNeighbor(g, "a", "left")).toBeNull();
    // But b is below a, so down works.
    expect(findNeighbor(g, "a", "down")).toBe("b");
  });
});
