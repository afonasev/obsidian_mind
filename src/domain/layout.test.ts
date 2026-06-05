import { describe, expect, it } from "vitest";
import {
  appendChildY,
  estimateNodeHeight,
  estimateNodeWidth,
  FONT_SCALE_MAX,
  LAYOUT_HSTEP,
  LAYOUT_MAX_WIDTH,
  LAYOUT_MIN_WIDTH,
  LAYOUT_VSTEP,
  layout,
  sideOf,
} from "./layout";
import type { Graph, MindNode, NodeId } from "./types";

const EMPTY: ReadonlySet<NodeId> = new Set();

function node(id: string, parentId: string | null, x: number, y: number, text = ""): MindNode {
  return { id, parentId, position: { x, y }, text };
}

function graphOf(...nodes: MindNode[]): Graph {
  const edges = nodes
    .filter((n) => n.parentId !== null)
    .map((n) => ({ id: `e-${n.id}`, source: n.parentId as string, target: n.id }));
  return { nodes, edges };
}

describe("layout", () => {
  it("leaves a single root in place", () => {
    const g = graphOf(node("r", null, 5, 7));
    const out = layout(g, EMPTY);
    expect(out.nodes[0]?.position).toEqual({ x: 5, y: 7 });
  });

  it("places one right-side child to the right of the root at the root's y", () => {
    const g = graphOf(node("r", null, 100, 50), node("c", "r", 105, 99));
    const out = layout(g, EMPTY);
    const c = out.nodes.find((n) => n.id === "c");
    expect(c?.position).toEqual({ x: 100 + LAYOUT_HSTEP, y: 50 });
  });

  it("places one left-side child to the left of the root at the root's y", () => {
    const g = graphOf(node("r", null, 100, 50), node("c", "r", 90, 99));
    const out = layout(g, EMPTY);
    const c = out.nodes.find((n) => n.id === "c");
    expect(c?.position).toEqual({ x: 100 - LAYOUT_HSTEP, y: 50 });
  });

  it("centres two right-side children vertically around the root", () => {
    const g = graphOf(node("r", null, 0, 0), node("a", "r", 10, 99), node("b", "r", 20, 99));
    const out = layout(g, EMPTY);
    const a = out.nodes.find((n) => n.id === "a");
    const b = out.nodes.find((n) => n.id === "b");
    // 2 leaves → straddle root.y by ±VSTEP/2
    expect(a?.position).toEqual({ x: LAYOUT_HSTEP, y: -LAYOUT_VSTEP / 2 });
    expect(b?.position).toEqual({ x: LAYOUT_HSTEP, y: LAYOUT_VSTEP / 2 });
  });

  it("orders siblings by their vertical position so a dragged node reorders", () => {
    // "a" was inserted first but dragged below "b" (larger y); after layout "b"
    // (smaller input y) must take the top slot.
    const g = graphOf(node("r", null, 0, 0), node("a", "r", 10, 50), node("b", "r", 10, -50));
    const out = layout(g, EMPTY);
    const a = out.nodes.find((n) => n.id === "a");
    const b = out.nodes.find((n) => n.id === "b");
    expect(b?.position.y).toBeLessThan(a?.position.y ?? 0);
  });

  it("places the middle of three leaves at the root's y", () => {
    const g = graphOf(
      node("r", null, 0, 0),
      node("a", "r", 10, 99),
      node("b", "r", 10, 99),
      node("c", "r", 10, 99),
    );
    const out = layout(g, EMPTY);
    const ys = ["a", "b", "c"].map((id) => out.nodes.find((n) => n.id === id)?.position.y);
    expect(ys).toEqual([-LAYOUT_VSTEP, 0, LAYOUT_VSTEP]);
  });

  it("reserves extra vertical rows for a tall (large-font) sibling so neighbours don't overlap", () => {
    // A node with the largest font scale is taller than one VSTEP, so it claims two
    // rows; the next sibling is pushed below by more than a single VSTEP.
    const tall: MindNode = {
      id: "a",
      parentId: "r",
      position: { x: 10, y: -50 },
      text: "X",
      style: { fontScale: FONT_SCALE_MAX },
    };
    const g = graphOf(node("r", null, 0, 0), tall, node("b", "r", 10, 50));
    const out = layout(g, EMPTY);
    const a = out.nodes.find((n) => n.id === "a");
    const b = out.nodes.find((n) => n.id === "b");
    expect(a?.position.y).toBe(-LAYOUT_VSTEP / 2);
    expect(b?.position.y).toBe(LAYOUT_VSTEP);
    expect((b?.position.y ?? 0) - (a?.position.y ?? 0)).toBeGreaterThan(LAYOUT_VSTEP);
  });

  it("expands each child's vertical slot by its leaf count so subtrees do not overlap", () => {
    // Tree:
    //   r
    //   ├── a (right)         ← 2 leaves under it
    //   │    ├── aa
    //   │    └── ab
    //   └── b (right)         ← 1 leaf
    const g = graphOf(
      node("r", null, 0, 0),
      node("a", "r", 10, 0),
      node("aa", "a", 20, 0),
      node("ab", "a", 20, 0),
      node("b", "r", 10, 0),
    );
    const out = layout(g, EMPTY);
    const find = (id: string): MindNode | undefined => out.nodes.find((n) => n.id === id);
    const a = find("a");
    const b = find("b");
    const aa = find("aa");
    const ab = find("ab");
    // Total rows = 2 + 1 = 3, centred ⇒ first row offset = -VSTEP
    // a occupies rows [0,1] (centerRow 0.5 ⇒ -VSTEP/2 from root)
    // b occupies row 2     (centerRow 2.0 ⇒ +VSTEP from root)
    expect(a?.position).toEqual({ x: LAYOUT_HSTEP, y: -LAYOUT_VSTEP / 2 });
    expect(b?.position).toEqual({ x: LAYOUT_HSTEP, y: LAYOUT_VSTEP });
    // a's leaves straddle a.y by ±VSTEP/2
    expect(aa?.position).toEqual({ x: 2 * LAYOUT_HSTEP, y: -LAYOUT_VSTEP });
    expect(ab?.position).toEqual({ x: 2 * LAYOUT_HSTEP, y: 0 });
  });

  it("lays out left and right sides of the same root independently", () => {
    const g = graphOf(node("r", null, 50, 100), node("L", "r", 0, 0), node("R", "r", 999, 0));
    const out = layout(g, EMPTY);
    const l = out.nodes.find((n) => n.id === "L");
    const r = out.nodes.find((n) => n.id === "R");
    expect(l?.position).toEqual({ x: 50 - LAYOUT_HSTEP, y: 100 });
    expect(r?.position).toEqual({ x: 50 + LAYOUT_HSTEP, y: 100 });
  });

  it("lays out multiple roots independently, anchored on their stored positions", () => {
    const g = graphOf(
      node("r1", null, 0, 0),
      node("r2", null, 500, 500),
      node("c1", "r1", 1, 0),
      node("c2", "r2", 501, 0),
    );
    const out = layout(g, EMPTY);
    expect(out.nodes.find((n) => n.id === "c1")?.position).toEqual({
      x: LAYOUT_HSTEP,
      y: 0,
    });
    expect(out.nodes.find((n) => n.id === "c2")?.position).toEqual({
      x: 500 + LAYOUT_HSTEP,
      y: 500,
    });
  });

  it("preserves edges unchanged", () => {
    const g = graphOf(node("r", null, 0, 0), node("c", "r", 10, 0));
    const out = layout(g, EMPTY);
    expect(out.edges).toBe(g.edges);
  });

  it("pushes a child further right when its parent's text (and therefore width) grows", () => {
    const short = layout(graphOf(node("r", null, 0, 0, "x"), node("c", "r", 10, 0, "")), EMPTY);
    const wide = layout(
      graphOf(node("r", null, 0, 0, "x".repeat(40)), node("c", "r", 10, 0, "")),
      EMPTY,
    );
    const shortX = short.nodes.find((n) => n.id === "c")?.position.x ?? 0;
    const wideX = wide.nodes.find((n) => n.id === "c")?.position.x ?? 0;
    expect(wideX).toBeGreaterThan(shortX);
  });

  it("aligns the right edges of left-side siblings, so their x differs by their widths", () => {
    const g = graphOf(
      node("r", null, 0, 0),
      node("short", "r", -10, 0, "ab"),
      node("long", "r", -10, 0, "abcdefghijklmnop"),
    );
    const out = layout(g, EMPTY);
    const shortNode = out.nodes.find((n) => n.id === "short");
    const longNode = out.nodes.find((n) => n.id === "long");
    // Two children → straddle root.y. The wider one sits further left by the
    // difference in width (right-edge alignment for the left side).
    const shortWidth = estimateNodeWidth("ab", false);
    const longWidth = estimateNodeWidth("abcdefghijklmnop", false);
    expect(shortNode?.position.x).toBeGreaterThan(longNode?.position.x ?? 0);
    expect((shortNode?.position.x ?? 0) - (longNode?.position.x ?? 0)).toBe(longWidth - shortWidth);
  });

  it("leaves orphan nodes (parent points to a missing node) at their stored position", () => {
    const orphan: MindNode = {
      id: "orphan",
      text: "",
      position: { x: 42, y: 17 },
      parentId: "ghost",
    };
    const g: Graph = { nodes: [orphan], edges: [] };
    const out = layout(g, EMPTY);
    expect(out.nodes[0]?.position).toEqual({ x: 42, y: 17 });
  });

  it("treats a collapsed node as a single row so its neighbours close in without a gap", () => {
    // "a" hides a 2-leaf subtree; collapsed it must occupy one row, so a/b
    // straddle the root by ±VSTEP/2 exactly as two plain leaves would.
    const g = graphOf(
      node("r", null, 0, 0),
      node("a", "r", 10, 0),
      node("aa", "a", 20, 0),
      node("ab", "a", 20, 0),
      node("b", "r", 10, 0),
    );
    const out = layout(g, new Set(["a"]));
    const a = out.nodes.find((n) => n.id === "a");
    const b = out.nodes.find((n) => n.id === "b");
    expect(a?.position).toEqual({ x: LAYOUT_HSTEP, y: -LAYOUT_VSTEP / 2 });
    expect(b?.position).toEqual({ x: LAYOUT_HSTEP, y: LAYOUT_VSTEP / 2 });
  });

  it("does not recurse into the children of a collapsed node", () => {
    const g = graphOf(node("r", null, 0, 0), node("a", "r", 10, 0), node("aa", "a", 999, 999));
    const out = layout(g, new Set(["a"]));
    // The hidden grandchild keeps its stale stored position — layout skips it.
    expect(out.nodes.find((n) => n.id === "aa")?.position).toEqual({ x: 999, y: 999 });
  });

  it("hides both sides when the root itself is collapsed", () => {
    const g = graphOf(node("r", null, 0, 0), node("L", "r", -10, 999), node("R", "r", 10, 999));
    const out = layout(g, new Set(["r"]));
    // Collapsed root leaves its direct children at their stale positions.
    expect(out.nodes.find((n) => n.id === "L")?.position).toEqual({ x: -10, y: 999 });
    expect(out.nodes.find((n) => n.id === "R")?.position).toEqual({ x: 10, y: 999 });
  });

  it("restores descendant layout once the node is expanded again", () => {
    const g = graphOf(
      node("r", null, 0, 0),
      node("a", "r", 10, 0),
      node("aa", "a", 20, 0),
      node("ab", "a", 20, 0),
      node("b", "r", 10, 0),
    );
    const collapsed = layout(g, new Set(["a"]));
    const expanded = layout(collapsed, EMPTY);
    // Expanding re-runs the full tidy-tree: a regains its 2-row slot, b moves down.
    const a = expanded.nodes.find((n) => n.id === "a");
    const b = expanded.nodes.find((n) => n.id === "b");
    const aa = expanded.nodes.find((n) => n.id === "aa");
    const ab = expanded.nodes.find((n) => n.id === "ab");
    expect(a?.position).toEqual({ x: LAYOUT_HSTEP, y: -LAYOUT_VSTEP / 2 });
    expect(b?.position).toEqual({ x: LAYOUT_HSTEP, y: LAYOUT_VSTEP });
    expect(aa?.position).toEqual({ x: 2 * LAYOUT_HSTEP, y: -LAYOUT_VSTEP });
    expect(ab?.position).toEqual({ x: 2 * LAYOUT_HSTEP, y: 0 });
  });
});

describe("estimateNodeWidth", () => {
  it("clamps empty text to the minimum width", () => {
    expect(estimateNodeWidth("", false)).toBe(LAYOUT_MIN_WIDTH);
    expect(estimateNodeWidth("", true)).toBe(LAYOUT_MIN_WIDTH);
  });

  it("clamps very long text to the maximum width", () => {
    expect(estimateNodeWidth("x".repeat(500), false)).toBe(LAYOUT_MAX_WIDTH);
    expect(estimateNodeWidth("x".repeat(500), true)).toBe(LAYOUT_MAX_WIDTH);
  });

  it("uses a wider per-character advance for the root font", () => {
    const text = "x".repeat(20);
    expect(estimateNodeWidth(text, true)).toBeGreaterThan(estimateNodeWidth(text, false));
  });

  it("sizes a multi-line label by its longest line, not the total length", () => {
    // "xxxxx\nxx" has 8 chars total but the longest line is 5 — width matches "xxxxx".
    expect(estimateNodeWidth("xxxxx\nxx", false)).toBe(estimateNodeWidth("xxxxx", false));
  });

  it("widens the node as the font scale grows and narrows as it shrinks", () => {
    // Long enough that the base width sits above the min clamp, so the shrink shows.
    const text = "x".repeat(30);
    const base = estimateNodeWidth(text, false);
    expect(estimateNodeWidth(text, false, 2)).toBeGreaterThan(base);
    expect(estimateNodeWidth(text, false, -2)).toBeLessThan(base);
  });
});

describe("estimateNodeHeight", () => {
  it("a root is taller than a non-root with the same text (larger font)", () => {
    expect(estimateNodeHeight("Идея", true)).toBeGreaterThan(estimateNodeHeight("Идея", false));
  });

  it("an empty node is as tall as a single-line node", () => {
    expect(estimateNodeHeight("", false)).toBe(estimateNodeHeight("x", false));
  });

  it("more hard lines make a taller node", () => {
    expect(estimateNodeHeight("a\nb\nc", false)).toBeGreaterThan(estimateNodeHeight("a", false));
  });

  it("a single long line that soft-wraps adds height", () => {
    expect(estimateNodeHeight("x".repeat(200), false)).toBeGreaterThan(
      estimateNodeHeight("x", false),
    );
  });

  it("a larger font scale makes a taller node", () => {
    expect(estimateNodeHeight("Идея", false, FONT_SCALE_MAX)).toBeGreaterThan(
      estimateNodeHeight("Идея", false),
    );
  });
});

describe("sideOf", () => {
  it("returns null for roots", () => {
    const g = graphOf(node("r", null, 0, 0));
    expect(sideOf(g, "r")).toBeNull();
  });

  it("returns 'right' for a direct child whose stored x is to the right of its root", () => {
    const g = graphOf(node("r", null, 0, 0), node("c", "r", 5, 0));
    expect(sideOf(g, "c")).toBe("right");
  });

  it("returns 'left' for a direct child whose stored x is to the left of its root", () => {
    const g = graphOf(node("r", null, 0, 0), node("c", "r", -5, 0));
    expect(sideOf(g, "c")).toBe("left");
  });

  it("inherits the side from the root-side ancestor for grandchildren", () => {
    const g = graphOf(
      node("r", null, 0, 0),
      node("c", "r", 100, 0),
      node("g", "c", 50, 0), // stored x is to the right of root, < parent's x
    );
    expect(sideOf(g, "g")).toBe("right");
  });

  it("returns null when the node id is unknown", () => {
    const g = graphOf(node("r", null, 0, 0));
    expect(sideOf(g, "ghost")).toBeNull();
  });

  it("returns null when an ancestor link points to a missing node", () => {
    const orphan: MindNode = {
      id: "orphan",
      text: "",
      position: { x: 0, y: 0 },
      parentId: "ghost",
    };
    const g: Graph = { nodes: [orphan], edges: [] };
    expect(sideOf(g, "orphan")).toBeNull();
  });
});

describe("appendChildY", () => {
  it("returns the parent's own y when it has no children yet", () => {
    const g = graphOf(node("r", null, 0, 30));
    expect(appendChildY(g, "r")).toBe(30);
  });

  it("returns one step below the lowest existing child", () => {
    const g = graphOf(node("r", null, 0, 30), node("a", "r", 100, 10), node("b", "r", 100, 90));
    expect(appendChildY(g, "r")).toBe(90 + LAYOUT_VSTEP);
  });

  it("returns 0 for an unknown parent", () => {
    const g = graphOf(node("r", null, 0, 30));
    expect(appendChildY(g, "ghost")).toBe(0);
  });
});
