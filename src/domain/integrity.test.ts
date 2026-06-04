import { describe, expect, it } from "vitest";
import { sanitize } from "./integrity";
import type { Graph } from "./types";

describe("sanitize", () => {
  it("returns the same graph reference when every edge is valid", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", text: "", position: { x: 0, y: 0 }, parentId: null },
        { id: "b", text: "", position: { x: 1, y: 0 }, parentId: "a" },
      ],
      edges: [{ id: "e1", source: "a", target: "b" }],
    };
    expect(sanitize(graph)).toBe(graph);
  });

  it("drops edges whose source is missing", () => {
    const graph: Graph = {
      nodes: [{ id: "a", text: "", position: { x: 0, y: 0 }, parentId: null }],
      edges: [
        { id: "ok", source: "a", target: "a" },
        { id: "broken", source: "missing", target: "a" },
      ],
    };
    const after = sanitize(graph);
    expect(after.edges.map((edge) => edge.id)).toEqual(["ok"]);
    expect(after.nodes).toBe(graph.nodes);
  });

  it("drops edges whose target is missing", () => {
    const graph: Graph = {
      nodes: [{ id: "a", text: "", position: { x: 0, y: 0 }, parentId: null }],
      edges: [{ id: "broken", source: "a", target: "ghost" }],
    };
    const after = sanitize(graph);
    expect(after.edges).toEqual([]);
  });

  it("preserves nodes even if every edge is dropped", () => {
    const graph: Graph = {
      nodes: [
        { id: "a", text: "", position: { x: 0, y: 0 }, parentId: null },
        { id: "b", text: "", position: { x: 1, y: 1 }, parentId: null },
      ],
      edges: [{ id: "dangling", source: "x", target: "y" }],
    };
    const after = sanitize(graph);
    expect(after.nodes).toBe(graph.nodes);
    expect(after.edges).toEqual([]);
  });
});
