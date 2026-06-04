import { describe, expect, it } from "vitest";
import {
  back,
  canGoBack,
  canGoForward,
  EMPTY_NAV_HISTORY,
  forward,
  MAX_NAV_HISTORY,
  type NavEntry,
  type NavHistory,
  pruneWorkspace,
  record,
} from "./nav-history";

function entry(workspaceId: string, nodeId: string): NavEntry {
  return { workspaceId, nodeId };
}

function historyOf(cursor: number, ...entries: NavEntry[]): NavHistory {
  return { history: entries, cursor };
}

describe("record", () => {
  it("appends the first entry and points the cursor at it", () => {
    const next = record(EMPTY_NAV_HISTORY, entry("w1", "a"));
    expect(next).toEqual(historyOf(0, entry("w1", "a")));
  });

  it("appends a new entry after the cursor and advances the cursor", () => {
    const start = historyOf(0, entry("w1", "a"));
    const next = record(start, entry("w1", "b"));
    expect(next).toEqual(historyOf(1, entry("w1", "a"), entry("w1", "b")));
  });

  it("ignores a repeat of the entry already at the cursor", () => {
    const start = historyOf(0, entry("w1", "a"));
    expect(record(start, entry("w1", "a"))).toBe(start);
  });

  it("records the same node in a different workspace as a new entry", () => {
    const start = historyOf(0, entry("w1", "a"));
    const next = record(start, entry("w2", "a"));
    expect(next).toEqual(historyOf(1, entry("w1", "a"), entry("w2", "a")));
  });

  it("truncates the forward tail before appending a new branch", () => {
    const start = historyOf(0, entry("w1", "a"), entry("w1", "b"), entry("w1", "c"));
    const next = record(start, entry("w1", "d"));
    expect(next).toEqual(historyOf(1, entry("w1", "a"), entry("w1", "d")));
  });

  it("drops the oldest entry and shifts the cursor when the cap is exceeded", () => {
    let state: NavHistory = EMPTY_NAV_HISTORY;
    for (let i = 0; i < MAX_NAV_HISTORY + 5; i++) {
      state = record(state, entry("w1", `n${i}`));
    }
    expect(state.history).toHaveLength(MAX_NAV_HISTORY);
    expect(state.cursor).toBe(MAX_NAV_HISTORY - 1);
    expect(state.history[0]).toEqual(entry("w1", "n5"));
    expect(state.history.at(-1)).toEqual(entry("w1", `n${MAX_NAV_HISTORY + 4}`));
  });
});

describe("back / forward", () => {
  const state = historyOf(1, entry("w1", "a"), entry("w1", "b"), entry("w1", "c"));

  it("steps one earlier when the visible state matches the cursor", () => {
    expect(back(state, true)).toBe(0);
  });

  it("snaps onto the cursor when the visible state is out of sync", () => {
    expect(back(state, false)).toBe(1);
  });

  it("steps one later when the visible state matches the cursor", () => {
    expect(forward(state, true)).toBe(2);
  });

  it("snaps onto the cursor going forward when out of sync", () => {
    expect(forward(state, false)).toBe(1);
  });
});

describe("canGoBack / canGoForward", () => {
  it("are both false on an empty history", () => {
    expect(canGoBack(EMPTY_NAV_HISTORY)).toBe(false);
    expect(canGoForward(EMPTY_NAV_HISTORY)).toBe(false);
  });

  it("disable back at the first entry and forward at the last", () => {
    const start = historyOf(0, entry("w1", "a"), entry("w1", "b"));
    expect(canGoBack(start)).toBe(false);
    expect(canGoForward(start)).toBe(true);
    const end = historyOf(1, entry("w1", "a"), entry("w1", "b"));
    expect(canGoBack(end)).toBe(true);
    expect(canGoForward(end)).toBe(false);
  });
});

describe("pruneWorkspace", () => {
  it("empties the history when every entry belonged to the workspace", () => {
    const start = historyOf(1, entry("w1", "a"), entry("w1", "b"));
    expect(pruneWorkspace(start, "w1")).toBe(EMPTY_NAV_HISTORY);
  });

  it("keeps the history unchanged when no entry matches", () => {
    const start = historyOf(1, entry("w1", "a"), entry("w1", "b"));
    expect(pruneWorkspace(start, "w2")).toEqual(start);
  });

  it("removes matching entries and keeps the cursor at or before its old position", () => {
    // cursor on b@w2 (index 1); pruning w1 leaves [b@w2, c@w2], cursor → 0.
    const start = historyOf(1, entry("w1", "a"), entry("w2", "b"), entry("w2", "c"));
    expect(pruneWorkspace(start, "w1")).toEqual(historyOf(0, entry("w2", "b"), entry("w2", "c")));
  });

  it("keeps the cursor on a surviving entry before the old position", () => {
    // cursor on c@w1 (index 2, removed); survivors before it: a@w2 only → cursor 0.
    const start = historyOf(2, entry("w2", "a"), entry("w1", "b"), entry("w1", "c"));
    expect(pruneWorkspace(start, "w1")).toEqual(historyOf(0, entry("w2", "a")));
  });

  it("falls back to the first remaining entry when the whole prefix was removed", () => {
    // cursor on a@w1 (index 0, removed); nothing survives before it → cursor 0 (b@w2).
    const start = historyOf(0, entry("w1", "a"), entry("w2", "b"));
    expect(pruneWorkspace(start, "w1")).toEqual(historyOf(0, entry("w2", "b")));
  });
});
