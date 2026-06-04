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

// Approximate font-metric constants — see estimateNodeWidth.
const NON_ROOT_CHAR_WIDTH = 8;
const ROOT_CHAR_WIDTH = 13;
const NODE_HORIZONTAL_PADDING = 36; // CSS .node has 18px padding on each side
const NODE_BORDER = 4; // 2px border on each side

/**
 * Approximate rendered width of a node, clamped to the same min/max-width that
 * the CSS enforces. The font advance is approximated per character because we
 * cannot measure the real DOM during a pure-function layout pass.
 */
export function estimateNodeWidth(text: string, isRoot: boolean): number {
  const charWidth = isRoot ? ROOT_CHAR_WIDTH : NON_ROOT_CHAR_WIDTH;
  const raw = text.length * charWidth + NODE_HORIZONTAL_PADDING + NODE_BORDER;
  return Math.min(LAYOUT_MAX_WIDTH, Math.max(LAYOUT_MIN_WIDTH, raw));
}

export type Side = "left" | "right";

/**
 * Tidy-tree layout for a mindmap. Roots keep their stored positions; descendants
 * are arranged so each parent's children are vertically centred around the
 * parent's y, with one VSTEP per leaf so subtrees never overlap. Direct children
 * of a root branch left or right based on the sign of their stored x relative
 * to the root; deeper descendants inherit that side from their root-side
 * ancestor.
 */
export function layout(graph: Graph): Graph {
  const childrenOf = buildChildrenIndex(graph);
  const positions = new Map<NodeId, Position>();

  for (const root of graph.nodes) {
    if (root.parentId !== null) {
      continue;
    }
    positions.set(root.id, root.position);
    const rootWidth = estimateNodeWidth(root.text, true);
    const direct = childrenOf.get(root.id) ?? [];
    const right = direct.filter((child) => child.position.x >= root.position.x);
    const left = direct.filter((child) => child.position.x < root.position.x);
    layoutSide(root.position, rootWidth, right, "right", childrenOf, positions);
    layoutSide(root.position, rootWidth, left, "left", childrenOf, positions);
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
    width: estimateNodeWidth(child.text, false),
    rows: subtreeRows(child.id, childrenOf),
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
    const grandchildren = childrenOf.get(item.child.id) ?? [];
    layoutSide(childPos, item.width, grandchildren, side, childrenOf, positions);
    cumulativeRows += item.rows;
  }
}

function subtreeRows(id: NodeId, childrenOf: Map<NodeId, MindNode[]>): number {
  const children = childrenOf.get(id) ?? [];
  if (children.length === 0) {
    return 1;
  }
  return children.reduce((sum, child) => sum + subtreeRows(child.id, childrenOf), 0);
}
