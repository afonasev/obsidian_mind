import type { Graph, MindNode, NodeId, Position } from "./types";

// Visual constants kept in lockstep with CloudNode.module.css.
export const LAYOUT_MIN_WIDTH = 120;
export const LAYOUT_MAX_WIDTH = 360;
export const LAYOUT_HGAP = 80;
export const LAYOUT_VSTEP = 80;

// Convenience: horizontal step between two min-width nodes (a node + the gap).
// Used by the "+" button as a sign hint; the layout itself computes spacing
// from each node's estimated width and the gap.
export const LAYOUT_HSTEP = LAYOUT_MIN_WIDTH + LAYOUT_HGAP;

// Relative font-size steps for a node name. `fontScale` is stored as an integer in
// [FONT_SCALE_MIN, FONT_SCALE_MAX]; FONT_SCALE_BASE (0) means the node's base size.
// Each step multiplies the rendered font size — and thus the estimated node width —
// by FONT_SCALE_STEP, so a larger name widens its node and the layout reflows.
export const FONT_SCALE_MIN = -2;
export const FONT_SCALE_MAX = 6;
export const FONT_SCALE_BASE = 0;
export const FONT_SCALE_STEP = 0.45;

/** The font-size multiplier for a given relative scale step (1 at the base). */
export function fontScaleFactor(fontScale: number): number {
  return 1 + fontScale * FONT_SCALE_STEP;
}

// Approximate font-metric constants — see estimateNodeWidth.
const NON_ROOT_CHAR_WIDTH = 8;
const ROOT_CHAR_WIDTH = 13;
const NODE_HORIZONTAL_PADDING = 36; // CSS .node has 18px padding on each side
const NODE_BORDER = 4; // 2px border on each side
const NODE_VERTICAL_PADDING = 24; // CSS .node has 12px padding top and bottom
const NODE_LINE_HEIGHT = 1.4; // CSS .node line-height
const NON_ROOT_FONT_PX = 14; // CSS .node font-size
const ROOT_FONT_PX = 21; // CSS .root font-size
// Text wraps within the node's content box (max-width minus padding/border).
const NODE_CONTENT_MAX_WIDTH = LAYOUT_MAX_WIDTH - NODE_HORIZONTAL_PADDING - NODE_BORDER;
// Safety margin on the height estimate. The per-char width is approximate and real
// fonts wrap a touch more than predicted, so we over-reserve a little to keep tall
// nodes from overlapping neighbours. Tuned to still leave a single-line node at one
// LAYOUT_VSTEP row (≈74px < 80 even for a root), so normal layouts are unchanged.
const HEIGHT_SAFETY = 1.3;

/**
 * Approximate rendered width of a node, clamped to the same min/max-width that
 * the CSS enforces. The font advance is approximated per character because we
 * cannot measure the real DOM during a pure-function layout pass.
 */
export function estimateNodeWidth(
  text: string,
  isRoot: boolean,
  fontScale: number = FONT_SCALE_BASE,
): number {
  // A larger name font widens the glyphs proportionally, so the layout must widen
  // the node to match (FONT_SCALE_BASE keeps the original width unchanged).
  const charWidth = (isRoot ? ROOT_CHAR_WIDTH : NON_ROOT_CHAR_WIDTH) * fontScaleFactor(fontScale);
  // Multi-line labels are as wide as their longest line, not the total length.
  const longestLine = text.split("\n").reduce((max, line) => Math.max(max, line.length), 0);
  const raw = longestLine * charWidth + NODE_HORIZONTAL_PADDING + NODE_BORDER;
  return Math.min(LAYOUT_MAX_WIDTH, Math.max(LAYOUT_MIN_WIDTH, raw));
}

/**
 * Approximate rendered height of a node. Counts visual lines (hard newlines plus
 * soft wraps at the node's content max-width) and multiplies by the line height,
 * which scales with the name font. Used by the layout so tall nodes (large font
 * or many lines) reserve enough vertical room and neighbours do not overlap.
 */
export function estimateNodeHeight(
  text: string,
  isRoot: boolean,
  fontScale: number = FONT_SCALE_BASE,
): number {
  const factor = fontScaleFactor(fontScale);
  const charWidth = (isRoot ? ROOT_CHAR_WIDTH : NON_ROOT_CHAR_WIDTH) * factor;
  const lineHeight = (isRoot ? ROOT_FONT_PX : NON_ROOT_FONT_PX) * factor * NODE_LINE_HEIGHT;
  const lines = text === "" ? [""] : text.split("\n");
  const visualLines = lines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil((line.length * charWidth) / NODE_CONTENT_MAX_WIDTH)),
    0,
  );
  return (visualLines * lineHeight + NODE_VERTICAL_PADDING + NODE_BORDER) * HEIGHT_SAFETY;
}

export type Side = "left" | "right";

/**
 * The y a new child of `parentId` should be hinted with so the layout — which
 * orders siblings by their y — places it last on its level. Returns a value just
 * below the parent's lowest existing child, or the parent's own y when it has no
 * children yet. (0 for an unknown parent — callers normally guard that already.)
 */
export function appendChildY(graph: Graph, parentId: NodeId): number {
  const parent = graph.nodes.find((node) => node.id === parentId);
  const baseY = parent?.position.y ?? 0;
  let maxY = baseY;
  let hasChild = false;
  for (const node of graph.nodes) {
    if (node.parentId === parentId) {
      hasChild = true;
      if (node.position.y > maxY) {
        maxY = node.position.y;
      }
    }
  }
  return hasChild ? maxY + LAYOUT_VSTEP : baseY;
}

/**
 * Tidy-tree layout for a mindmap. Roots keep their stored positions; descendants
 * are arranged so each parent's children are vertically centred around the
 * parent's y, with one VSTEP per leaf so subtrees never overlap. Direct children
 * of a root branch left or right based on the sign of their stored x relative
 * to the root; deeper descendants inherit that side from their root-side
 * ancestor.
 */
export function layout(graph: Graph, collapsed: ReadonlySet<NodeId>): Graph {
  const childrenOf = buildChildrenIndex(graph);
  const positions = new Map<NodeId, Position>();

  for (const root of graph.nodes) {
    if (root.parentId !== null) {
      continue;
    }
    positions.set(root.id, root.position);
    // A collapsed root hides both sides — its children get no positions, so the
    // canvas drops them just like any other hidden descendant.
    if (collapsed.has(root.id)) {
      continue;
    }
    const rootWidth = estimateNodeWidth(root.text, true, root.style?.fontScale);
    const direct = childrenOf.get(root.id) ?? [];
    const right = direct.filter((child) => child.position.x >= root.position.x);
    const left = direct.filter((child) => child.position.x < root.position.x);
    layoutSide(root.position, rootWidth, right, "right", childrenOf, positions, collapsed);
    layoutSide(root.position, rootWidth, left, "left", childrenOf, positions, collapsed);
  }

  return {
    nodes: graph.nodes.map((node) => {
      const next = positions.get(node.id);
      return next === undefined ? node : { ...node, position: next };
    }),
    edges: graph.edges,
  };
}

/**
 * Returns the side ("left" / "right") this non-root node lives on relative to
 * its root ancestor. Roots and orphans (which the domain forbids but we still
 * handle defensively) return `null`.
 */
export function sideOf(graph: Graph, nodeId: NodeId): Side | null {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return resolveSide(byId, nodeId);
}

function resolveSide(byId: Map<NodeId, MindNode>, nodeId: NodeId): Side | null {
  const node = byId.get(nodeId);
  if (node === undefined || node.parentId === null) {
    return null;
  }
  const parent = byId.get(node.parentId);
  if (parent === undefined) {
    return null;
  }
  if (parent.parentId === null) {
    return node.position.x >= parent.position.x ? "right" : "left";
  }
  return resolveSide(byId, parent.id);
}

function buildChildrenIndex(graph: Graph): Map<NodeId, MindNode[]> {
  const map = new Map<NodeId, MindNode[]>();
  for (const node of graph.nodes) {
    if (node.parentId === null) {
      continue;
    }
    const list = map.get(node.parentId);
    if (list === undefined) {
      map.set(node.parentId, [node]);
    } else {
      list.push(node);
    }
  }
  return map;
}

function layoutSide(
  parentPosition: Position,
  parentWidth: number,
  children: readonly MindNode[],
  side: Side,
  childrenOf: Map<NodeId, MindNode[]>,
  positions: Map<NodeId, Position>,
  collapsed: ReadonlySet<NodeId>,
): void {
  if (children.length === 0) {
    return;
  }
  // Order siblings by their current vertical position so dragging a node above or
  // below a sibling reorders them. Array.sort is stable, so freshly added children
  // (which all share the parent's y until laid out) keep their insertion order.
  const ordered = [...children].sort((a, b) => a.position.y - b.position.y);
  const items = ordered.map((child) => ({
    child,
    width: estimateNodeWidth(child.text, false, child.style?.fontScale),
    rows: subtreeRows(child, childrenOf, collapsed),
  }));
  const totalRows = items.reduce((sum, item) => sum + item.rows, 0);
  const centerOffset = (totalRows - 1) / 2;

  let cumulativeRows = 0;
  for (const item of items) {
    const centerRow = cumulativeRows + (item.rows - 1) / 2;
    const childY = parentPosition.y + (centerRow - centerOffset) * LAYOUT_VSTEP;
    // Right-side: align children's left edges to (parent's right edge + gap).
    // Left-side: align children's right edges to (parent's left edge − gap).
    // This keeps the connector-handle side flush across siblings even when
    // their widths differ, and naturally widens the level when the parent grows.
    const childX =
      side === "right"
        ? parentPosition.x + parentWidth + LAYOUT_HGAP
        : parentPosition.x - LAYOUT_HGAP - item.width;
    const childPos: Position = { x: childX, y: childY };
    positions.set(item.child.id, childPos);
    // A collapsed node is a leaf for layout: skip recursing into its hidden
    // subtree so it occupies a single row and neighbours close in around it.
    if (!collapsed.has(item.child.id)) {
      const grandchildren = childrenOf.get(item.child.id) ?? [];
      layoutSide(childPos, item.width, grandchildren, side, childrenOf, positions, collapsed);
    }
    cumulativeRows += item.rows;
  }
}

// Vertical space a node reserves for itself, in VSTEP units. A node taller than
// one VSTEP (large font or many lines) claims extra rows so neighbours keep clear.
function ownRows(node: MindNode): number {
  const height = estimateNodeHeight(node.text, node.parentId === null, node.style?.fontScale);
  return Math.max(1, Math.ceil(height / LAYOUT_VSTEP));
}

function subtreeRows(
  node: MindNode,
  childrenOf: Map<NodeId, MindNode[]>,
  collapsed: ReadonlySet<NodeId>,
): number {
  const own = ownRows(node);
  // A collapsed node counts as a leaf — its own height — regardless of the hidden subtree.
  if (collapsed.has(node.id)) {
    return own;
  }
  const children = childrenOf.get(node.id) ?? [];
  if (children.length === 0) {
    return own;
  }
  // A subtree needs room for the taller of: its descendants' rows, or the node itself.
  const childrenRows = children.reduce(
    (sum, child) => sum + subtreeRows(child, childrenOf, collapsed),
    0,
  );
  return Math.max(own, childrenRows);
}
