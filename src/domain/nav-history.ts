import type { NodeId } from "./types";

// Same depth bound as the undo/redo stacks (see MAX_HISTORY in the store): a long
// session must not grow the focus history without limit. Oldest entries drop from
// the head once the cap is exceeded.
export const MAX_NAV_HISTORY = 100;

/** One focus point: which node, in which workspace, the selection rested on. */
export interface NavEntry {
  readonly workspaceId: string;
  readonly nodeId: NodeId;
}

/** Linear focus timeline with a cursor at the current position (-1 when empty). */
export interface NavHistory {
  readonly history: readonly NavEntry[];
  readonly cursor: number;
}

export const EMPTY_NAV_HISTORY: NavHistory = { history: [], cursor: -1 };

function sameEntry(a: NavEntry, b: NavEntry): boolean {
  return a.workspaceId === b.workspaceId && a.nodeId === b.nodeId;
}

/**
 * Append `entry` as the new current position. A repeat of the entry already at
 * the cursor is ignored (dedup). Any forward tail (entries after the cursor) is
 * dropped — a fresh selection after going back forks the timeline. When the cap
 * is exceeded the oldest entry is dropped from the head and the cursor follows.
 */
export function record(state: NavHistory, entry: NavEntry): NavHistory {
  const current = state.history[state.cursor];
  if (current !== undefined && sameEntry(current, entry)) {
    return state;
  }
  const next = [...state.history.slice(0, state.cursor + 1), entry];
  const trimmed = next.length > MAX_NAV_HISTORY ? next.slice(next.length - MAX_NAV_HISTORY) : next;
  return { history: trimmed, cursor: trimmed.length - 1 };
}

/**
 * Target index for a «Назад» step. When the visible state is out of sync with the
 * cursor (after a workspace switch or a deselect — `matchesCursor` is false), the
 * first back snaps onto the cursor; otherwise it moves one step earlier. The
 * result may fall out of range; callers gate with {@link canGoBack}.
 */
export function back(state: NavHistory, matchesCursor: boolean): number {
  return matchesCursor ? state.cursor - 1 : state.cursor;
}

/** Target index for a «Вперёд» step — mirror of {@link back}. */
export function forward(state: NavHistory, matchesCursor: boolean): number {
  return matchesCursor ? state.cursor + 1 : state.cursor;
}

/**
 * Drop every entry of `workspaceId` and move the cursor onto a surviving entry:
 * the nearest one at or before the old position (or the first remaining entry
 * when the whole prefix was removed). Empties the history when nothing survives.
 */
export function pruneWorkspace(state: NavHistory, workspaceId: string): NavHistory {
  const history = state.history.filter((entry) => entry.workspaceId !== workspaceId);
  if (history.length === 0) {
    return EMPTY_NAV_HISTORY;
  }
  const survivorsUpToCursor = state.history
    .slice(0, state.cursor + 1)
    .filter((entry) => entry.workspaceId !== workspaceId).length;
  const cursor = Math.min(Math.max(survivorsUpToCursor - 1, 0), history.length - 1);
  return { history, cursor };
}

export function canGoBack(state: NavHistory): boolean {
  return state.cursor > 0;
}

export function canGoForward(state: NavHistory): boolean {
  return state.cursor < state.history.length - 1;
}
