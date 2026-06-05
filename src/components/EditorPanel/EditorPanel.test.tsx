import "fake-indexeddb/auto";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Graph } from "../../domain/types";
import { DB_NAME } from "../../persistence/db";
import { mindMapStore } from "../../store/mindmap-store";
import { EditorPanel } from "./EditorPanel";

async function resetDb(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function resetStore(): void {
  act(() => {
    mindMapStore.setState({
      graph: { nodes: [], edges: [] },
      past: [],
      future: [],
      selectedNodeId: null,
      editingNodeId: null,
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
      activeWorkspaceId: "ws",
      editorCollapsed: false,
      editorWidth: 320,
      reveal: null,
    });
  });
}

const TWO_NODES: Graph = {
  nodes: [
    { id: "root", text: "Корень", position: { x: 0, y: 0 }, parentId: null },
    { id: "child", text: "Ребёнок", position: { x: 0, y: 0 }, parentId: "root" },
  ],
  edges: [{ id: "e", source: "root", target: "child" }],
};

/** Seed the two-node graph and select `id`. */
function seedAndSelect(id: string, graph: Graph = TWO_NODES): void {
  act(() => {
    mindMapStore.setState({ graph, selectedNodeId: id });
  });
}

beforeEach(async () => {
  await resetDb();
  resetStore();
});

afterEach(async () => {
  await act(async () => {
    await mindMapStore.getState().flush();
  });
  await resetDb();
});

describe("EditorPanel — collapse", () => {
  it("collapses and expands via the toggle, persisting the state", async () => {
    const user = userEvent.setup();
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: "Свернуть панель редактора" }));
    expect(mindMapStore.getState().editorCollapsed).toBe(true);
    await user.click(screen.getByRole("button", { name: "Развернуть панель редактора" }));
    expect(mindMapStore.getState().editorCollapsed).toBe(false);
  });

  it("hides the content when collapsed", () => {
    seedAndSelect("child");
    act(() => mindMapStore.setState({ editorCollapsed: true }));
    render(<EditorPanel />);
    expect(screen.queryByLabelText("Имя узла")).not.toBeInTheDocument();
  });
});

describe("EditorPanel — resize", () => {
  it("widens the panel when the left handle is dragged leftwards", () => {
    render(<EditorPanel />);
    const handle = screen.getByRole("separator", { name: "Изменить ширину панели редактора" });

    act(() => {
      fireEvent.mouseDown(handle, { clientX: 0 });
    });
    // Dragging left (negative clientX) grows the right panel.
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: -50 }));
    });
    // 320 (start) - (-50) = 370.
    expect(mindMapStore.getState().editorWidth).toBe(370);

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"));
    });
    expect(mindMapStore.getState().editorWidth).toBe(370);
  });
});

describe("EditorPanel — empty state", () => {
  it("shows a hint and no fields when nothing is selected", () => {
    render(<EditorPanel />);
    expect(screen.getByText("Выберите узел")).toBeInTheDocument();
    expect(screen.queryByLabelText("Имя узла")).not.toBeInTheDocument();
  });

  it("shows the hint when the selected id has no matching node", () => {
    act(() => mindMapStore.setState({ graph: { nodes: [], edges: [] }, selectedNodeId: "ghost" }));
    render(<EditorPanel />);
    expect(screen.getByText("Выберите узел")).toBeInTheDocument();
  });
});

describe("EditorPanel — parent link", () => {
  it("focuses the parent when its name is clicked", async () => {
    const user = userEvent.setup();
    seedAndSelect("child");
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: "Корень" }));
    expect(mindMapStore.getState().selectedNodeId).toBe("root");
    expect(mindMapStore.getState().reveal?.nodeId).toBe("root");
  });

  it("does not render a parent row for a root node", () => {
    seedAndSelect("root");
    render(<EditorPanel />);
    expect(screen.queryByRole("button", { name: "Корень" })).not.toBeInTheDocument();
  });

  it("shows a placeholder when the parent id has no matching node", () => {
    const graph: Graph = {
      nodes: [{ id: "child", text: "Ребёнок", position: { x: 0, y: 0 }, parentId: "ghost" }],
      edges: [],
    };
    seedAndSelect("child", graph);
    render(<EditorPanel />);
    expect(screen.getByRole("button", { name: "Без названия" })).toBeInTheDocument();
  });
});

describe("EditorPanel — title", () => {
  it("renames the node as the title is edited", async () => {
    const user = userEvent.setup();
    seedAndSelect("child");
    render(<EditorPanel />);
    const input = screen.getByLabelText("Имя узла");
    await user.type(input, "!");
    expect(mindMapStore.getState().graph.nodes.find((n) => n.id === "child")?.text).toBe(
      "Ребёнок!",
    );
  });

  it("reflects an external rename of the selected node", () => {
    seedAndSelect("child");
    render(<EditorPanel />);
    act(() => mindMapStore.getState().updateText("child", "Переименован"));
    expect(screen.getByLabelText("Имя узла")).toHaveValue("Переименован");
  });
});

describe("EditorPanel — body view/edit", () => {
  it("renders markdown and GFM in view mode", () => {
    const graph: Graph = {
      nodes: [
        {
          id: "root",
          text: "Корень",
          position: { x: 0, y: 0 },
          parentId: null,
          body: "# Заголовок\n\n- [x] сделано",
        },
      ],
      edges: [],
    };
    seedAndSelect("root", graph);
    render(<EditorPanel />);
    expect(screen.getByRole("heading", { name: "Заголовок" })).toBeInTheDocument();
    // The GFM task-list item renders as a checkbox — proof remark-gfm is active.
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("switches to edit mode on click and shows the raw markdown", async () => {
    const user = userEvent.setup();
    const graph: Graph = {
      nodes: [
        { id: "root", text: "Корень", position: { x: 0, y: 0 }, parentId: null, body: "# Привет" },
      ],
      edges: [],
    };
    seedAndSelect("root", graph);
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: /Тело узла/ }));
    expect(screen.getByLabelText("Тело узла (markdown)")).toHaveValue("# Привет");
  });

  it("opens the editor when Space is pressed on the focused body", async () => {
    const user = userEvent.setup();
    const graph: Graph = {
      nodes: [
        { id: "root", text: "Корень", position: { x: 0, y: 0 }, parentId: null, body: "# Текст" },
      ],
      edges: [],
    };
    seedAndSelect("root", graph);
    render(<EditorPanel />);
    const body = screen.getByRole("button", { name: /Тело узла/ });
    act(() => body.focus());
    await user.keyboard("[Space]");
    expect(screen.getByLabelText("Тело узла (markdown)")).toBeInTheDocument();
  });

  it("opens the editor when Enter is pressed on the focused body", async () => {
    const user = userEvent.setup();
    const graph: Graph = {
      nodes: [
        { id: "root", text: "Корень", position: { x: 0, y: 0 }, parentId: null, body: "# Текст" },
      ],
      edges: [],
    };
    seedAndSelect("root", graph);
    render(<EditorPanel />);
    const body = screen.getByRole("button", { name: /Тело узла/ });
    act(() => body.focus());
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Тело узла (markdown)")).toBeInTheDocument();
  });

  it("ignores other keys on the focused body, staying in view mode", async () => {
    const user = userEvent.setup();
    const graph: Graph = {
      nodes: [
        { id: "root", text: "Корень", position: { x: 0, y: 0 }, parentId: null, body: "# Текст" },
      ],
      edges: [],
    };
    seedAndSelect("root", graph);
    render(<EditorPanel />);
    const body = screen.getByRole("button", { name: /Тело узла/ });
    act(() => body.focus());
    await user.keyboard("a");
    expect(screen.queryByLabelText("Тело узла (markdown)")).not.toBeInTheDocument();
  });

  it("shows a clickable placeholder for an empty body and opens the editor", async () => {
    const user = userEvent.setup();
    seedAndSelect("root");
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: "Добавить заметку…" }));
    expect(screen.getByLabelText("Тело узла (markdown)")).toHaveValue("");
  });
});

describe("EditorPanel — body autosave", () => {
  it("commits the body on blur", async () => {
    const user = userEvent.setup();
    seedAndSelect("root");
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: "Добавить заметку…" }));
    await user.type(screen.getByLabelText("Тело узла (markdown)"), "заметка");
    await user.tab();
    expect(mindMapStore.getState().graph.nodes.find((n) => n.id === "root")?.body).toBe("заметка");
  });

  it("commits the body after a second of no typing", async () => {
    // Real timers here on purpose: faking them deadlocks user-event and the
    // singleton store's IDB autosave. The component's own 1s timer is short enough
    // to wait out, and waitFor polls until it fires.
    const user = userEvent.setup();
    seedAndSelect("root");
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: "Добавить заметку…" }));
    await user.type(screen.getByLabelText("Тело узла (markdown)"), "по таймеру");
    await waitFor(
      () =>
        expect(mindMapStore.getState().graph.nodes.find((n) => n.id === "root")?.body).toBe(
          "по таймеру",
        ),
      { timeout: 2000 },
    );
  });

  it("commits the body when the selected node changes", async () => {
    const user = userEvent.setup();
    seedAndSelect("child");
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: "Добавить заметку…" }));
    await user.type(screen.getByLabelText("Тело узла (markdown)"), "черновик");
    // Switch selection without blurring — the editor unmounts and must commit.
    act(() => mindMapStore.getState().selectNode("root"));
    expect(mindMapStore.getState().graph.nodes.find((n) => n.id === "child")?.body).toBe(
      "черновик",
    );
  });

  it("does not re-commit an unchanged body (idempotent)", async () => {
    const user = userEvent.setup();
    const graph: Graph = {
      nodes: [
        { id: "root", text: "Корень", position: { x: 0, y: 0 }, parentId: null, body: "тело" },
      ],
      edges: [],
    };
    seedAndSelect("root", graph);
    render(<EditorPanel />);
    await user.click(screen.getByRole("button", { name: /Тело узла/ }));
    // Enter edit mode and blur without changing anything — no new history step.
    await user.tab();
    expect(mindMapStore.getState().past).toHaveLength(0);
  });
});

describe("EditorPanel — placeholder name", () => {
  it("falls back to a placeholder for an empty parent name", async () => {
    const user = userEvent.setup();
    const graph: Graph = {
      nodes: [
        { id: "root", text: "", position: { x: 0, y: 0 }, parentId: null },
        { id: "child", text: "Ребёнок", position: { x: 0, y: 0 }, parentId: "root" },
      ],
      edges: [{ id: "e", source: "root", target: "child" }],
    };
    seedAndSelect("child", graph);
    render(<EditorPanel />);
    // The empty-named parent shows the placeholder, and the row is still a working
    // link to that parent.
    await user.click(screen.getByRole("button", { name: "Без названия" }));
    expect(mindMapStore.getState().selectedNodeId).toBe("root");
  });
});
