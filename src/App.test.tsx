import "fake-indexeddb/auto";
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { mindMapStore } from "./store/mindmap-store";

function clearStore(): void {
  act(() => {
    const ids = mindMapStore.getState().graph.nodes.map((node) => node.id);
    for (const id of ids) {
      mindMapStore.getState().removeSubtree(id);
    }
    mindMapStore.getState().selectNode(null);
    mindMapStore.getState().stopEditing();
  });
}

describe("App", () => {
  afterEach(() => {
    clearStore();
  });

  it("renders the mindmap canvas", () => {
    const { container } = render(<App />);
    expect(container.querySelector(".react-flow")).not.toBeNull();
  });

  it("schedules a debounced save when the graph changes after mount", async () => {
    render(<App />);
    // Allow the mount effect's loadFromStorage() promise to settle so the saver is bound.
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      mindMapStore.getState().addRoot({ position: { x: 0, y: 0 } });
    });
    expect(mindMapStore.getState().graph.nodes.length).toBeGreaterThan(0);
  });
});
