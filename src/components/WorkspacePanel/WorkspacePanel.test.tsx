import "fake-indexeddb/auto";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DB_NAME } from "../../persistence/db";
import { mindMapStore } from "../../store/mindmap-store";
import { WorkspacePanel } from "./WorkspacePanel";

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
      workspaces: [],
      activeWorkspaceId: null,
      editingWorkspaceId: null,
      panelCollapsed: false,
      rootsByWorkspace: new Map(),
      collapsedWorkspaceRoots: new Set(),
      reveal: null,
    });
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

/** Seed `count` named workspaces directly in state, the first one active. */
function seedWorkspaces(names: readonly string[]): void {
  act(() => {
    mindMapStore.setState({
      workspaces: names.map((name, index) => ({ id: `w${index}`, name, createdAt: index })),
      activeWorkspaceId: names.length > 0 ? "w0" : null,
    });
  });
}

describe("WorkspacePanel — list", () => {
  it("renders all workspaces and marks the active one", () => {
    seedWorkspaces(["Работа", "Учёба"]);
    render(<WorkspacePanel />);
    expect(screen.getByRole("button", { name: "Работа" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Учёба" })).toBeInTheDocument();
    // The active workspace is exposed via aria-current.
    expect(screen.getByRole("button", { name: "Работа" })).toHaveAttribute("aria-current", "true");
  });

  it("renders an empty list with only the create button when there are no workspaces", () => {
    render(<WorkspacePanel />);
    expect(screen.getByLabelText("Создать пространство")).toBeInTheDocument();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });
});

describe("WorkspacePanel — collapse", () => {
  it("collapses and expands the panel through the store", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Свернуть панель пространств"));
    expect(mindMapStore.getState().panelCollapsed).toBe(true);
    // Collapsed: the full list and create button are hidden.
    expect(screen.queryByLabelText("Создать пространство")).toBeNull();

    await user.click(screen.getByLabelText("Развернуть панель пространств"));
    expect(mindMapStore.getState().panelCollapsed).toBe(false);
    expect(screen.getByRole("button", { name: "Работа" })).toBeInTheDocument();
    expect(screen.getByLabelText("Создать пространство")).toBeInTheDocument();
  });

  it("shows a square first-letter switcher per workspace when collapsed", async () => {
    seedWorkspaces(["Работа", "Учёба"]);
    act(() => {
      mindMapStore.setState({ panelCollapsed: true });
    });
    render(<WorkspacePanel />);

    const button = screen.getByRole("button", { name: "Работа" });
    expect(button).toHaveTextContent("Р");
    expect(button).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Учёба" })).toHaveTextContent("У");
  });

  it("keeps a leading emoji whole in the switcher (no broken surrogate)", () => {
    seedWorkspaces(["🚀 Запуск"]);
    act(() => {
      mindMapStore.setState({ panelCollapsed: true });
    });
    render(<WorkspacePanel />);
    expect(screen.getByRole("button", { name: "🚀 Запуск" })).toHaveTextContent("🚀");
  });

  it("falls back to «•» for an unnamed workspace switcher", () => {
    act(() => {
      mindMapStore.setState({
        workspaces: [{ id: "w0", name: "", createdAt: 0 }],
        activeWorkspaceId: "w0",
        panelCollapsed: true,
      });
    });
    render(<WorkspacePanel />);
    expect(screen.getByText("•")).toBeInTheDocument();
  });

  it("switches workspace from a collapsed square button", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа", "Учёба"]);
    act(() => {
      mindMapStore.setState({ panelCollapsed: true });
    });
    render(<WorkspacePanel />);

    await user.click(screen.getByRole("button", { name: "Учёба" }));
    await waitFor(() => {
      expect(mindMapStore.getState().activeWorkspaceId).toBe("w1");
    });
  });
});

describe("WorkspacePanel — create", () => {
  it("creates a workspace, activates it and opens inline name editing", async () => {
    const user = userEvent.setup();
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Создать пространство"));

    const input = await screen.findByLabelText("Имя пространства");
    expect(input).toHaveFocus();
    expect(mindMapStore.getState().workspaces).toHaveLength(1);
    expect(mindMapStore.getState().activeWorkspaceId).toBe(
      mindMapStore.getState().workspaces[0]?.id,
    );

    await user.type(input, "Проект{Enter}");
    await waitFor(() => {
      expect(mindMapStore.getState().workspaces[0]?.name).toBe("Проект");
    });
  });

  it("assigns the default name when the inline name is left empty", async () => {
    const user = userEvent.setup();
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Создать пространство"));
    const input = await screen.findByLabelText("Имя пространства");
    // Leave it empty and commit via Enter.
    await user.type(input, "{Enter}");

    await waitFor(() => {
      expect(mindMapStore.getState().workspaces[0]?.name).toBe("Новое пространство");
    });
  });
});

describe("WorkspacePanel — rename", () => {
  it("renames a workspace through the «⋮» menu", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Старое"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Меню пространства «Старое»"));
    await user.click(screen.getByRole("menuitem", { name: "Переименовать" }));

    const input = await screen.findByLabelText("Имя пространства");
    await user.clear(input);
    await user.type(input, "Новое{Enter}");

    await waitFor(() => {
      expect(mindMapStore.getState().workspaces[0]?.name).toBe("Новое");
    });
  });

  it("cancels the rename on Escape, keeping the previous name", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Имя"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Меню пространства «Имя»"));
    await user.click(screen.getByRole("menuitem", { name: "Переименовать" }));

    const input = await screen.findByLabelText("Имя пространства");
    await user.clear(input);
    await user.type(input, "Черновик{Escape}");

    await waitFor(() => {
      expect(mindMapStore.getState().editingWorkspaceId).toBeNull();
    });
    expect(mindMapStore.getState().workspaces[0]?.name).toBe("Имя");
  });

  it("rejects an empty rename, keeping the previous name", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Имя"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Меню пространства «Имя»"));
    await user.click(screen.getByRole("menuitem", { name: "Переименовать" }));

    const input = await screen.findByLabelText("Имя пространства");
    await user.clear(input);
    await user.type(input, "{Enter}");

    await waitFor(() => {
      expect(mindMapStore.getState().editingWorkspaceId).toBeNull();
    });
    expect(mindMapStore.getState().workspaces[0]?.name).toBe("Имя");
  });
});

describe("WorkspacePanel — delete", () => {
  it("asks for confirmation and deletes on confirm", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа", "Учёба"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Меню пространства «Работа»"));
    await user.click(screen.getByRole("menuitem", { name: "Удалить" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Удалить" }));

    await waitFor(() => {
      expect(mindMapStore.getState().workspaces.map((w) => w.id)).toEqual(["w1"]);
    });
  });

  it("closes the delete dialog on Escape without deleting", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Меню пространства «Работа»"));
    await user.click(screen.getByRole("menuitem", { name: "Удалить" }));
    await screen.findByRole("dialog");
    // A non-Escape key leaves the dialog open; Escape then closes it.
    await user.keyboard("a");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mindMapStore.getState().workspaces).toHaveLength(1);
  });

  it("keeps the workspace when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByLabelText("Меню пространства «Работа»"));
    await user.click(screen.getByRole("menuitem", { name: "Удалить" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mindMapStore.getState().workspaces).toHaveLength(1);
  });
});

describe("WorkspacePanel — select", () => {
  it("activates a workspace when its list entry is clicked", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа", "Учёба"]);
    render(<WorkspacePanel />);

    await user.click(screen.getByRole("button", { name: "Учёба" }));
    await waitFor(() => {
      expect(mindMapStore.getState().activeWorkspaceId).toBe("w1");
    });
  });
});

/** A root node of the active graph (parentId === null). */
function rootNode(id: string, text: string) {
  return { id, text, parentId: null, position: { x: 0, y: 0 } };
}

describe("WorkspacePanel — roots", () => {
  it("renders the active workspace's roots from the live graph", () => {
    seedWorkspaces(["Работа"]);
    act(() => {
      mindMapStore.setState({
        graph: { nodes: [rootNode("n1", "Идея"), rootNode("n2", "План")], edges: [] },
      });
    });
    render(<WorkspacePanel />);

    expect(screen.getByRole("button", { name: "Идея" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "План" })).toBeInTheDocument();
  });

  it("renders an inactive workspace's roots from the cache", () => {
    seedWorkspaces(["Работа", "Учёба"]);
    act(() => {
      mindMapStore.setState({
        rootsByWorkspace: new Map([["w1", [{ id: "r1", text: "Кэш-корень" }]]]),
      });
    });
    render(<WorkspacePanel />);

    expect(screen.getByRole("button", { name: "Кэш-корень" })).toBeInTheDocument();
  });

  it("shows the placeholder for a root with empty text", () => {
    seedWorkspaces(["Работа"]);
    act(() => {
      mindMapStore.setState({
        graph: { nodes: [rootNode("n1", "")], edges: [] },
      });
    });
    render(<WorkspacePanel />);

    expect(screen.getByRole("button", { name: "Без названия" })).toBeInTheDocument();
  });

  it("toggles the root list via the chevron", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа"]);
    act(() => {
      mindMapStore.setState({
        graph: { nodes: [rootNode("n1", "Идея")], edges: [] },
      });
    });
    render(<WorkspacePanel />);

    // Default is expanded: the root is visible.
    expect(screen.getByRole("button", { name: "Идея" })).toBeInTheDocument();

    await user.click(screen.getByLabelText("Свернуть корни пространства «Работа»"));
    await waitFor(() => {
      expect(mindMapStore.getState().collapsedWorkspaceRoots.has("w0")).toBe(true);
    });
    expect(screen.queryByRole("button", { name: "Идея" })).toBeNull();

    await user.click(screen.getByLabelText("Развернуть корни пространства «Работа»"));
    await waitFor(() => {
      expect(mindMapStore.getState().collapsedWorkspaceRoots.has("w0")).toBe(false);
    });
    expect(screen.getByRole("button", { name: "Идея" })).toBeInTheDocument();
  });

  it("hides a collapsed workspace's root list", () => {
    seedWorkspaces(["Работа"]);
    act(() => {
      mindMapStore.setState({
        graph: { nodes: [rootNode("n1", "Идея")], edges: [] },
        collapsedWorkspaceRoots: new Set(["w0"]),
      });
    });
    render(<WorkspacePanel />);

    expect(screen.queryByRole("button", { name: "Идея" })).toBeNull();
  });

  it("focuses a root on click", async () => {
    const user = userEvent.setup();
    seedWorkspaces(["Работа"]);
    act(() => {
      mindMapStore.setState({
        graph: { nodes: [rootNode("n1", "Идея")], edges: [] },
      });
    });
    render(<WorkspacePanel />);

    await user.click(screen.getByRole("button", { name: "Идея" }));
    await waitFor(() => {
      expect(mindMapStore.getState().selectedNodeId).toBe("n1");
    });
    expect(mindMapStore.getState().reveal?.nodeId).toBe("n1");
  });

  it("shows no roots when the panel is collapsed", () => {
    seedWorkspaces(["Работа"]);
    act(() => {
      mindMapStore.setState({
        graph: { nodes: [rootNode("n1", "Идея")], edges: [] },
        panelCollapsed: true,
      });
    });
    render(<WorkspacePanel />);

    expect(screen.queryByRole("button", { name: "Идея" })).toBeNull();
  });
});
