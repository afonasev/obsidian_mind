import {
  activeWorkspaceKey,
  META_COLLAPSED_ROOTS_KEY,
  META_EDITOR_COLLAPSED_KEY,
  META_EDITOR_WIDTH_KEY,
  META_LAST_VAULT_PATH_KEY,
  META_PANEL_COLLAPSED_KEY,
  META_PANEL_WIDTH_KEY,
  META_STORE,
  openMindMapDb,
} from "./db";

/**
 * App-settings persistence in IndexedDB. Knowledge-base content (graphs, spaces)
 * lives in vault files via the `VaultStore` port — this module keeps only the
 * settings that are not part of the content: last vault, panel state/widths, and
 * the active workspace per vault.
 */

/** Absolute path of the last active vault, or null when none was ever chosen. */
export async function loadLastVaultPath(): Promise<string | null> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, META_LAST_VAULT_PATH_KEY);
    return typeof value === "string" ? value : null;
  } finally {
    db.close();
  }
}

export async function saveLastVaultPath(path: string | null): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, path, META_LAST_VAULT_PATH_KEY);
  } finally {
    db.close();
  }
}

/** Active workspace id remembered for `vaultPath`, or null when none is set. */
export async function loadActiveWorkspaceId(vaultPath: string): Promise<string | null> {
  const db = await openMindMapDb();
  try {
    const value = await db.get(META_STORE, activeWorkspaceKey(vaultPath));
    return typeof value === "string" ? value : null;
  } finally {
    db.close();
  }
}

export async function saveActiveWorkspaceId(
  vaultPath: string,
  workspaceId: string | null,
): Promise<void> {
  const db = await openMindMapDb();
  try {
    await db.put(META_STORE, workspaceId, activeWorkspaceKey(vaultPath));
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
