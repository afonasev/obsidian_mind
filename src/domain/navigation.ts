import type { Graph, NodeId } from "./types";

export type NavigationDirection = "left" | "right" | "up" | "down";

/**
 * Returns the id of the nearest node in the given direction relative to
 * `fromId`, or `null` if no candidate lies in that half-plane.
 *
 * Selection is scored by two axes:
 *   - left/right ⇒ primary = |Δy| (prefer the same row), secondary = |Δx|
 *   - up/down    ⇒ primary = |Δx| (prefer the same column), secondary = |Δy|
 *
 * That matches the spatial-navigation intuition: ArrowLeft jumps to the closest
 * node that lies to the left and on roughly the same row; ArrowUp jumps to the
 * closest node above and in roughly the same column.
 */
export function findNeighbor(
  graph: Graph,
  fromId: NodeId,
  direction: NavigationDirection,
): NodeId | null {
  const from = graph.nodes.find((node) => node.id === fromId);
  if (from === undefined) {
    return null;
  }
  const horizontal = direction === "left" || direction === "right";

  let bestId: NodeId | null = null;
  let bestPrimary = Number.POSITIVE_INFINITY;
  let bestSecondary = Number.POSITIVE_INFINITY;

  for (const node of graph.nodes) {
    if (node.id === fromId) {
      continue;
    }
    const dx = node.position.x - from.position.x;
    const dy = node.position.y - from.position.y;
    if (!inDirection(direction, dx, dy)) {
      continue;
    }
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const primary = horizontal ? ady : adx;
    const secondary = horizontal ? adx : ady;
    if (primary < bestPrimary || (primary === bestPrimary && secondary < bestSecondary)) {
      bestId = node.id;
      bestPrimary = primary;
      bestSecondary = secondary;
    }
  }
  return bestId;
}

function inDirection(direction: NavigationDirection, dx: number, dy: number): boolean {
  switch (direction) {
    case "left":
      return dx < 0;
    case "right":
      return dx > 0;
    case "up":
      return dy < 0;
    case "down":
      return dy > 0;
  }
}
