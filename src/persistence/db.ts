import { type IDBPDatabase, openDB } from "idb";

export const DB_NAME = "mindmap";
// v3 drops the content stores (graph, workspaces): the knowledge base now lives in
// vault files (capability `vault-storage`). IndexedDB keeps only app settings.
export const DB_VERSION = 3;
export const META_STORE = "meta";

// Names of the content stores removed in v3, deleted on upgrade.
const LEGACY_GRAPH_STORE = "graph";
const LEGACY_WORKSPACES_STORE = "workspaces";

// Fixed keys inside the `meta` object store.
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

/**
 * Key for the active workspace of one vault. Per-vault (the path is part of the
 * key) so each vault remembers its own open space independently.
 */
export function activeWorkspaceKey(vaultPath: string): string {
  return `activeWorkspace:${vaultPath}`;
}

export interface MindMapDb {
  meta: {
    // Heterogeneous singletons (panel state, widths, last vault) — narrowed on read.
    key: string;
    value: unknown;
  };
}

export function openMindMapDb(): Promise<IDBPDatabase<MindMapDb>> {
  return openDB<MindMapDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // Content moved to vault files (BREAKING, no migration): drop the old graph
      // and workspaces stores and keep only `meta` for app settings.
      if (database.objectStoreNames.contains(LEGACY_GRAPH_STORE)) {
        database.deleteObjectStore(LEGACY_GRAPH_STORE);
      }
      if (database.objectStoreNames.contains(LEGACY_WORKSPACES_STORE)) {
        database.deleteObjectStore(LEGACY_WORKSPACES_STORE);
      }
      if (!database.objectStoreNames.contains(META_STORE)) {
        database.createObjectStore(META_STORE);
      }
    },
  });
}
