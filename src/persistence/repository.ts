import { sanitize } from "../domain/integrity";
import type { Graph, MindEdge, MindNode, NodeId } from "../domain/types";
import type { PanelRoot, Workspace } from "../domain/workspaces";
import {
  collapsedNodesKey,
  GRAPH_STORE,
  META_ACTIVE_WORKSPACE_KEY,
  META_COLLAPSED_ROOTS_KEY,
  META_EDITOR_COLLAPSED_KEY,
  META_EDITOR_WIDTH_KEY,
  META_PANEL_COLLAPSED_KEY,
  META_PANEL_WIDTH_KEY,
  META_STORE,
  openMindMapDb,
  type StoredGraph,
  WORKSPACES_STORE,
} from "./db";

export async function loadGraph(workspaceId: string): Promise<Graph | null> {
  const db = await openMindMapDb();
  try {
    const record = await db.get(GRAPH_STORE, workspaceId);
    if (!record) {
      return null;
    }
    return sanitize(toGraph(record));
  } finally {
    db.close();
  }
}

export async function saveGraph(workspaceId: string, graph: Graph): Promise<void> {
  const db = await openMindMapDb();
  try {
    const record: StoredGraph = {
      version: 2,
      nodes: graph.nodes,
      edges: graph.edges,
      updatedAt: Date.now(),
    };
    await db.put(GRAPH_STORE, record, workspaceId);
  } finally {
    db.close();
  }
}

/**
 * Roots (parentId === null) of every workspace's graph, keyed by workspace id.
 * Reads the graph store once; edges are irrelevant here, so we skip `sanitize`
 * and read only the node list. The panel's second level renders this map.
 */
export async function loadAllRoots(): Promise<Map<string, readonly PanelRoot[]>> {
  const db = await openMindMapDb();
  try {
    const map = new Map<string, readonly PanelRoot[]>();
    // A cursor yields key+value together, so there is no index-misalignment branch
    // to defend against (unlike zipping getAllKeys with getAll).
    let cursor = await db.transaction(GRAPH_STORE).store.openCursor();
    while (cursor) {
      // Graph keys are always string workspace ids; idb types the cursor key as the
      // wider IDBValidKey, so normalize it back to string.
      map.set(String(cursor.key), rootsOf(cursor.value));
      cursor = await cursor.continue();
    }
    return map;
  } finally {
    db.close();
  }
}

/** All workspaces, ordered by creation time (the list order shown in the panel). */
export async function loadWorkspaces(): Promise<readonly Workspace[]> {
  const db = await openMindMapDb();
  try {
    const all = await db.getAll(WORKSPACES_STORE);
    return [...all].sort((a, b) => a.createdAt - b.createdAt);
  } finally {
    db.close();
  }
}

export async function saveWorkspace(workspace: Workspace): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(WORKSPACES_STORE, workspace, workspace.id);
  } finally {
    db.close();
  }
}

/** Delete a workspace together with its graph record, atomically. */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const db = await openMindMapDb();
  try {
    const tx = db.transaction([WORKSPACES_STORE, GRAPH_STORE, META_STORE], "readwrite");
    await Promise.all([
      tx.objectStore(WORKSPACES_STORE).delete(workspaceId),
      tx.objectStore(GRAPH_STORE).delete(workspaceId),
      tx.objectStore(META_STORE).delete(collapsedNodesKey(workspaceId)),
      tx.done,
    ]);
  } finally {
    db.close();
  }
}

export async function loadActiveWorkspaceId(): Promise<string | null> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, META_ACTIVE_WORKSPACE_KEY);
    return typeof value === "string" ? value : null;
  } finally {
    db.close();
  }
}

export async function saveActiveWorkspaceId(workspaceId: string | null): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, workspaceId, META_ACTIVE_WORKSPACE_KEY);
  } finally {
    db.close();
  }
}

export async function loadPanelCollapsed(): Promise<boolean> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, META_PANEL_COLLAPSED_KEY);
    return value === true;
  } finally {
    db.close();
  }
}

export async function savePanelCollapsed(collapsed: boolean): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, collapsed, META_PANEL_COLLAPSED_KEY);
  } finally {
    db.close();
  }
}

export async function loadEditorCollapsed(): Promise<boolean> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, META_EDITOR_COLLAPSED_KEY);
    return value === true;
  } finally {
    db.close();
  }
}

export async function saveEditorCollapsed(collapsed: boolean): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, collapsed, META_EDITOR_COLLAPSED_KEY);
  } finally {
    db.close();
  }
}

/** Stored width (px) of the left panel, or null when the user never resized it. */
export async function loadPanelWidth(): Promise<number | null> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, META_PANEL_WIDTH_KEY);
    return typeof value === "number" ? value : null;
  } finally {
    db.close();
  }
}

export async function savePanelWidth(width: number): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, width, META_PANEL_WIDTH_KEY);
  } finally {
    db.close();
  }
}

/** Stored width (px) of the right editor panel, or null when never resized. */
export async function loadEditorWidth(): Promise<number | null> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, META_EDITOR_WIDTH_KEY);
    return typeof value === "number" ? value : null;
  } finally {
    db.close();
  }
}

export async function saveEditorWidth(width: number): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, width, META_EDITOR_WIDTH_KEY);
  } finally {
    db.close();
  }
}

export async function loadCollapsedRoots(): Promise<readonly string[]> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, META_COLLAPSED_ROOTS_KEY);
    return Array.isArray(value) ? (value as readonly string[]) : [];
  } finally {
    db.close();
  }
}

export async function saveCollapsedRoots(ids: readonly string[]): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, ids, META_COLLAPSED_ROOTS_KEY);
  } finally {
    db.close();
  }
}

export async function loadCollapsedNodes(workspaceId: string): Promise<readonly NodeId[]> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, collapsedNodesKey(workspaceId));
    return Array.isArray(value) ? (value as readonly NodeId[]) : [];
  } finally {
    db.close();
  }
}

export async function saveCollapsedNodes(
  workspaceId: string,
  ids: readonly NodeId[],
): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, ids, collapsedNodesKey(workspaceId));
  } finally {
    db.close();
  }
}

function toGraph(record: StoredGraph): Graph {
  return {
    nodes: (record.nodes ?? []) as readonly MindNode[],
    edges: (record.edges ?? []) as readonly MindEdge[],
  };
}

/** Extract the root nodes from a stored graph record as lightweight panel entries. */
function rootsOf(record: StoredGraph): readonly PanelRoot[] {
  return toGraph(record)
    .nodes.filter((node) => node.parentId === null)
    .map((node) => ({ id: node.id, text: node.text }));
}
