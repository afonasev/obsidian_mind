import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NavEntry } from "../../domain/nav-history";
import type { Graph, MindNode } from "../../domain/types";
import { mindMapStore } from "../../store/mindmap-store";
import { FocusNav } from "./FocusNav";

function root(id: string): MindNode {
  return { id, text: "", position: { x: 0, y: 0 }, parentId: null };
}

function reset(): void {
  act(() => {
    mindMapStore.setState({
      graph: { nodes: [], edges: [] },
      selectedNodeId: null,
      navHistory: [],
      navCursor: -1,
      workspaces: [],
      activeWorkspaceId: null,
    });
  });
}

/** Seed an active workspace with two root nodes and a two-point focus history. */
function seedTwoNodeHistory(cursor: number, selectedNodeId: string): void {
  const history: NavEntry[] = [
    { workspaceId: "ws", nodeId: "a" },
    { workspaceId: "ws", nodeId: "b" },
  ];
  const graph: Graph = { nodes: [root("a"), root("b")], edges: [] };
  act(() => {
    mindMapStore.setState({
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
      activeWorkspaceId: "ws",
      graph,
      selectedNodeId,
      navHistory: history,
      navCursor: cursor,
    });
  });
}

beforeEach(reset);
afterEach(reset);

describe("FocusNav", () => {
  const backButton = (): HTMLElement =>
    screen.getByRole("button", { name: "Назад по истории фокуса" });
  const forwardButton = (): HTMLElement =>
    screen.getByRole("button", { name: "Вперёд по истории фокуса" });

  it("disables both buttons when the history is empty", () => {
    render(<FocusNav />);
    expect(backButton()).toBeDisabled();
    expect(forwardButton()).toBeDisabled();
  });

  it("enables back at the latest entry and forward after a step back", () => {
    seedTwoNodeHistory(1, "b");
    render(<FocusNav />);
    expect(backButton()).toBeEnabled();
    expect(forwardButton()).toBeDisabled();

    act(() => {
      mindMapStore.setState({ navCursor: 0 });
    });
    expect(backButton()).toBeDisabled();
    expect(forwardButton()).toBeEnabled();
  });

  it("steps the focus history back when the back button is clicked", async () => {
    const user = userEvent.setup();
    seedTwoNodeHistory(1, "b");
    render(<FocusNav />);
    await user.click(backButton());
    await waitFor(() => {
      expect(mindMapStore.getState().navCursor).toBe(0);
    });
    expect(mindMapStore.getState().selectedNodeId).toBe("a");
  });

  it("steps the focus history forward when the forward button is clicked", async () => {
    const user = userEvent.setup();
    seedTwoNodeHistory(0, "a");
    render(<FocusNav />);
    await user.click(forwardButton());
    await waitFor(() => {
      expect(mindMapStore.getState().navCursor).toBe(1);
    });
    expect(mindMapStore.getState().selectedNodeId).toBe("b");
  });
});
