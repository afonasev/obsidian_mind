import { FONT_SCALE_MAX, FONT_SCALE_MIN } from "./layout";
import type { EdgeId, Graph, MindEdge, MindNode, NodeId, NodeNameStyle, Position } from "./types";

export function createEmpty(): Graph {
  return { nodes: [], edges: [] };
}

interface AddRootInput {
  readonly position: Position;
  readonly text?: string;
}

interface AddRootResult {
  readonly graph: Graph;
  readonly nodeId: NodeId;
}

export function addRoot(graph: Graph, input: AddRootInput): AddRootResult {
  const node: MindNode = {
    id: crypto.randomUUID(),
    text: input.text ?? "",
    position: input.position,
    parentId: null,
  };
  return {
    graph: { nodes: [...graph.nodes, node], edges: graph.edges },
    nodeId: node.id,
  };
}

interface AddChildInput {
  readonly parentId: NodeId;
  readonly position: Position;
  readonly text?: string;
}

interface AddChildResult {
  readonly graph: Graph;
  readonly nodeId: NodeId;
  readonly edgeId: EdgeId;
}

export function addChild(graph: Graph, input: AddChildInput): AddChildResult {
  const parent = graph.nodes.find((node) => node.id === input.parentId);
  if (parent === undefined) {
    throw new Error(`Parent node not found: ${input.parentId}`);
  }
  const node: MindNode = {
    id: crypto.randomUUID(),
    text: input.text ?? "",
    position: input.position,
    parentId: input.parentId,
    // Inherit a snapshot of the parent's fill colour (only `color`, not the whole
    // style — bold/italic are not copied). Copied by value, so later re-colouring
    // the parent never touches this already-created child. Absent when the parent
    // has no colour, so the child stays on the default surface.
    ...(parent.style?.color !== undefined ? { style: { color: parent.style.color } } : {}),
  };
  const edge: MindEdge = {
    id: crypto.randomUUID(),
    source: input.parentId,
    target: node.id,
  };
  return {
    graph: {
      nodes: [...graph.nodes, node],
      edges: [...graph.edges, edge],
    },
    nodeId: node.id,
    edgeId: edge.id,
  };
}

interface RemoveSubtreeInput {
  readonly nodeId: NodeId;
}

export function removeSubtree(graph: Graph, input: RemoveSubtreeInput): Graph {
  const toRemove = subtreeIds(graph, input.nodeId);
  if (toRemove.size === 0) {
    return graph;
  }
  return {
    nodes: graph.nodes.filter((node) => !toRemove.has(node.id)),
    edges: graph.edges.filter((edge) => !toRemove.has(edge.source) && !toRemove.has(edge.target)),
  };
}

interface UpdateTextInput {
  readonly nodeId: NodeId;
  readonly text: string;
}

export function updateText(graph: Graph, input: UpdateTextInput): Graph {
  return {
    nodes: graph.nodes.map((node) =>
      node.id === input.nodeId ? { ...node, text: input.text } : node,
    ),
    edges: graph.edges,
  };
}

interface UpdateBodyInput {
  readonly nodeId: NodeId;
  readonly body: string;
}

// Sets the markdown body of one node. Unlike `updateText` there is no layout
// concern — the body never renders on the canvas, so descendants do not move.
export function updateBody(graph: Graph, input: UpdateBodyInput): Graph {
  return {
    nodes: graph.nodes.map((node) =>
      node.id === input.nodeId ? { ...node, body: input.body } : node,
    ),
    edges: graph.edges,
  };
}

interface UpdateNodeStyleInput {
  readonly nodeId: NodeId;
  // A partial patch merged onto the node's current style; absent keys are kept.
  readonly style: NodeNameStyle;
  // Keys to remove from the style outright. A merge patch cannot express "delete
  // color": under exactOptionalPropertyTypes a patch with `color: undefined` is
  // not even constructible as NodeNameStyle, and spreading an absent key keeps the
  // old value. Resetting a node to the default surface needs the key actually gone.
  readonly clear?: readonly (keyof NodeNameStyle)[];
}

/**
 * Merge a style patch onto one node's name style. `fontScale` is clamped to the
 * [FONT_SCALE_MIN, FONT_SCALE_MAX] range here so the range invariant lives in one
 * place. Keys listed in `clear` are removed after the merge (e.g. colour reset).
 * No layout concern in the domain — the store re-flows after the mutation.
 */
export function updateNodeStyle(graph: Graph, input: UpdateNodeStyleInput): Graph {
  return {
    nodes: graph.nodes.map((node) => {
      if (node.id !== input.nodeId) {
        return node;
      }
      const merged: NodeNameStyle = { ...node.style, ...input.style };
      const clamped =
        merged.fontScale === undefined
          ? merged
          : {
              ...merged,
              fontScale: Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, merged.fontScale)),
            };
      // Mutable copy so `clear` keys can be deleted (NodeNameStyle fields are readonly).
      const style: { -readonly [K in keyof NodeNameStyle]?: NodeNameStyle[K] } = { ...clamped };
      for (const key of input.clear ?? []) {
        delete style[key];
      }
      return { ...node, style };
    }),
    edges: graph.edges,
  };
}

interface MoveNodeInput {
  readonly nodeId: NodeId;
  readonly position: Position;
}

export function moveNode(graph: Graph, input: MoveNodeInput): Graph {
  return {
    nodes: graph.nodes.map((node) =>
      node.id === input.nodeId ? { ...node, position: input.position } : node,
    ),
    edges: graph.edges,
  };
}

/**
 * A self-contained snapshot of a node and its whole subtree, suitable for the
 * clipboard. `edges` are only those internal to the subtree.
 */
export interface Subtree {
  readonly rootId: NodeId;
  readonly nodes: readonly MindNode[];
  readonly edges: readonly MindEdge[];
}

/** Snapshot the node and its descendants, or `null` if the node is unknown. */
export function extractSubtree(graph: Graph, nodeId: NodeId): Subtree | null {
  const ids = subtreeIds(graph, nodeId);
  if (ids.size === 0) {
    return null;
  }
  return {
    rootId: nodeId,
    nodes: graph.nodes.filter((node) => ids.has(node.id)),
    edges: graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

interface PasteResult {
  readonly graph: Graph;
  readonly rootId: NodeId;
}

/**
 * Clone `clip` with fresh ids and attach its root as a child of `parentId`. The
 * cloned root is placed at `rootPosition` (a side hint relative to the parent);
 * descendants keep their relative offsets. New ids are generated top-down so each
 * child references its parent's fresh id without any post-hoc remapping.
 */
export function pasteSubtree(
  graph: Graph,
  clip: Subtree,
  parentId: NodeId,
  rootPosition: Position,
): PasteResult {
  if (!graph.nodes.some((node) => node.id === parentId)) {
    throw new Error(`Paste target not found: ${parentId}`);
  }
  const byId = new Map(clip.nodes.map((node) => [node.id, node]));
  const clipRoot = byId.get(clip.rootId);
  if (clipRoot === undefined) {
    throw new Error("Clipboard subtree has no root node");
  }
  const childrenById = new Map<NodeId, NodeId[]>();
  for (const edge of clip.edges) {
    const list = childrenById.get(edge.source);
    if (list === undefined) {
      childrenById.set(edge.source, [edge.target]);
    } else {
      list.push(edge.target);
    }
  }
  const dx = rootPosition.x - clipRoot.position.x;
  const dy = rootPosition.y - clipRoot.position.y;
  const newNodes: MindNode[] = [];
  const newEdges: MindEdge[] = [];

  function clone(source: MindNode, newParentId: NodeId): NodeId {
    const id = crypto.randomUUID();
    newNodes.push({
      id,
      text: source.text,
      position: { x: source.position.x + dx, y: source.position.y + dy },
      parentId: newParentId,
    });
    newEdges.push({ id: crypto.randomUUID(), source: newParentId, target: id });
    for (const childId of childrenById.get(source.id) ?? []) {
      const child = byId.get(childId);
      if (child !== undefined) {
        clone(child, id);
      }
    }
    return id;
  }

  const rootId = clone(clipRoot, parentId);
  return {
    graph: {
      nodes: [...graph.nodes, ...newNodes],
      edges: [...graph.edges, ...newEdges],
    },
    rootId,
  };
}

interface ReparentInput {
  readonly nodeId: NodeId;
  readonly newParentId: NodeId;
  readonly position: Position;
}

/**
 * Re-attach `nodeId` (with its subtree) under `newParentId`. Returns the SAME
 * graph reference when the move is invalid — unknown node/parent, attaching to
 * itself, the node is already that parent's child, or the target lies inside the
 * moved subtree (which would create a cycle) — so callers can skip a no-op.
 */
export function reparentSubtree(graph: Graph, input: ReparentInput): Graph {
  const { nodeId, newParentId, position } = input;
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node === undefined || !graph.nodes.some((n) => n.id === newParentId)) {
    return graph;
  }
  if (nodeId === newParentId || node.parentId === newParentId) {
    return graph;
  }
  if (subtreeIds(graph, nodeId).has(newParentId)) {
    return graph;
  }
  return {
    nodes: graph.nodes.map((n) =>
      n.id === nodeId ? { ...n, parentId: newParentId, position } : n,
    ),
    // Drop the node's old incoming edge, add the new parent→node edge.
    edges: [
      ...graph.edges.filter((e) => e.target !== nodeId),
      { id: crypto.randomUUID(), source: newParentId, target: nodeId },
    ],
  };
}

interface DetachInput {
  readonly nodeId: NodeId;
  readonly position: Position;
}

/**
 * Открепить `nodeId` от родителя, сделав его новым корнем своей ветки. Возвращает
 * ТУ ЖЕ ссылку на граф, если открепление невозможно — узел неизвестен или уже
 * корень (`parentId === null`), — чтобы вызывающий мог пропустить no-op. При
 * успехе: `parentId → null`, новая `position`, удаление входящего ребра
 * (`target === nodeId`). Дети сохраняют свои `parentId`, поэтому поддерево
 * остаётся связным.
 */
export function detachAsRoot(graph: Graph, input: DetachInput): Graph {
  const { nodeId, position } = input;
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node === undefined || node.parentId === null) {
    return graph;
  }
  return {
    nodes: graph.nodes.map((n) => (n.id === nodeId ? { ...n, parentId: null, position } : n)),
    edges: graph.edges.filter((e) => e.target !== nodeId),
  };
}

/** Ids of `rootId` and all its descendants (empty set if `rootId` is unknown). */
export function subtreeIds(graph: Graph, rootId: NodeId): Set<NodeId> {
  if (!graph.nodes.some((node) => node.id === rootId)) {
    return new Set();
  }
  const result = new Set<NodeId>([rootId]);
  const stack: NodeId[] = [rootId];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    for (const edge of graph.edges) {
      if (edge.source === current && !result.has(edge.target)) {
        result.add(edge.target);
        stack.push(edge.target);
      }
    }
  }
  return result;
}
