import { type IDBPDatabase, openDB } from "idb";
import type { Workspace } from "../domain/workspaces";

export const DB_NAME = "mindmap";
export const DB_VERSION = 2;
export const GRAPH_STORE = "graph";
export const WORKSPACES_STORE = "workspaces";
export const META_STORE = "meta";

// Fixed keys inside the `meta` object store.
export const META_ACTIVE_WORKSPACE_KEY = "activeWorkspaceId";
export const META_PANEL_COLLAPSED_KEY = "panelCollapsed";
// Collapsed state of the right-hand editor panel (absent = expanded).
export const META_EDITOR_COLLAPSED_KEY = "editorPanelCollapsed";
// User-adjusted widths (px) of the left and right panels (absent = default width).
export const META_PANEL_WIDTH_KEY = "panelWidth";
export const META_EDITOR_WIDTH_KEY = "editorPanelWidth";
// Ids of workspaces whose root list is collapsed in the panel (absent = expanded).
export const META_COLLAPSED_ROOTS_KEY = "collapsedWorkspaceRoots";
// Absolute path of the last active vault directory (absent = no vault chosen yet).
export const META_LAST_VAULT_PATH_KEY = "lastVaultPath";

/** Key for the per-workspace list of collapsed node ids inside the `meta` store. */
export function collapsedNodesKey(workspaceId: string): string {
  return `collapsedNodes:${workspaceId}`;
}

export interface MindMapDb {
  graph: {
    // One graph record per workspace, keyed by workspace id.
    key: string;
    value: StoredGraph;
  };
  workspaces: {
    key: string;
    value: Workspace;
  };
  meta: {
    // Heterogeneous singletons (active id, panel state) — narrowed on read.
    key: string;
    value: unknown;
  };
}

export interface StoredGraph {
  readonly version: 2;
  readonly nodes: unknown;
  readonly edges: unknown;
  readonly updatedAt: number;
}

export function openMindMapDb(): Promise<IDBPDatabase<MindMapDb>> {
  return openDB<MindMapDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // v1→v2 is a breaking schema change: the old single-graph store kept its
      // only record under the fixed key `current`. We drop it (no migration —
      // real users have no graph yet) and recreate `graph` keyed by workspace id.
      if (database.objectStoreNames.contains(GRAPH_STORE)) {
        database.deleteObjectStore(GRAPH_STORE);
      }
      database.createObjectStore(GRAPH_STORE);
      database.createObjectStore(WORKSPACES_STORE);
      database.createObjectStore(META_STORE);
    },
  });
}
