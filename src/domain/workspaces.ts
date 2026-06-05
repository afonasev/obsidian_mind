export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
}

/** A root node (parentId === null) as shown in the panel's second level. */
export interface PanelRoot {
  readonly id: string;
  readonly text: string;
}

/** Append a new workspace to the list (order = creation order). */
export function createWorkspace(
  list: readonly Workspace[],
  workspace: Workspace,
): readonly Workspace[] {
  return [...list, workspace];
}

/**
 * Rename a workspace. An empty (whitespace-only) name is rejected — the same list
 * reference is returned unchanged so callers can keep the previous name.
 */
export function renameWorkspace(
  list: readonly Workspace[],
  id: string,
  name: string,
): readonly Workspace[] {
  if (name.trim() === "") {
    return list;
  }
  return list.map((workspace) => (workspace.id === id ? { ...workspace, name } : workspace));
}

/** Remove a workspace by id. Unknown id leaves the list unchanged. */
export function removeWorkspace(list: readonly Workspace[], id: string): readonly Workspace[] {
  return list.filter((workspace) => workspace.id !== id);
}

/**
 * The workspace to activate after `id` is deleted: the next one in the list,
 * else the previous one, else `null` when `id` was the only entry. Returns `null`
 * when `id` is not in the list.
 */
export function neighborOf(list: readonly Workspace[], id: string): Workspace | null {
  const index = list.findIndex((workspace) => workspace.id === id);
  if (index === -1) {
    return null;
  }
  return list[index + 1] ?? list[index - 1] ?? null;
}
