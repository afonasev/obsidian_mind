// The real singleton store persists collapse toggles immediately (saveCollapsedNodes
// is not debounced), so these tests need a working IndexedDB.
import "fake-indexeddb/auto";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import type { JSX, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FONT_SCALE_MAX, FONT_SCALE_MIN, LAYOUT_HSTEP, LAYOUT_VSTEP } from "../../domain/layout";
import { readRecentColors } from "../../node-color/recent-colors";
import { mindMapStore } from "../../store/mindmap-store";
import { Canvas } from "../Canvas/Canvas";
import { CHILD_OFFSET_X, CloudNode, type CloudNodeProps } from "./CloudNode";

function withProvider(children: ReactNode): JSX.Element {
  return <ReactFlowProvider>{children}</ReactFlowProvider>;
}

function resetStore(): void {
  act(() => {
    const ids = mindMapStore.getState().graph.nodes.map((node) => node.id);
    for (const id of ids) {
      mindMapStore.getState().removeSubtree(id);
    }
    mindMapStore.getState().selectNode(null);
    mindMapStore.getState().stopEditing();
    mindMapStore.getState().setDropTarget(null);
    // Node creation is guarded behind an active workspace — seed one for the tests.
    mindMapStore.setState({
      activeWorkspaceId: "ws",
      workspaces: [{ id: "ws", name: "W", createdAt: 0 }],
      editingWorkspaceId: null,
    });
  });
}

beforeEach(() => {
  resetStore();
});

afterEach(() => {
  resetStore();
});

function makeProps(input: {
  readonly id: string;
  readonly text: string;
  readonly hasBody?: boolean;
}): CloudNodeProps {
  return {
    id: input.id,
    type: "cloud",
    data: { text: input.text, hasBody: input.hasBody ?? false },
    selected: false,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    isConnectable: false,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  };
}

function seedRoot(text = "Идея", position = { x: 0, y: 0 }): string {
  let id = "";
  act(() => {
    id = mindMapStore.getState().addRoot({ position, text });
  });
  return id;
}

describe("CloudNode", () => {
  it("renders the node text", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));
    expect(screen.getByTestId("cloud-node-text")).toHaveTextContent("Идея");
  });

  it("renders a placeholder when the text is empty", () => {
    const id = seedRoot("");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "" })} />));
    expect(screen.getByTestId("cloud-node-text")).toHaveTextContent("Без названия");
  });

  it("shows the editor input when the node is in editing mode", () => {
    const id = seedRoot("Идея");
    // addRoot leaves the node in editing mode, so the input must appear immediately.
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));
    const input = screen.getByTestId("cloud-node-input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue("Идея");
  });

  it("inserts a newline on Enter and stays in edit mode", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Старый");
    render(withProvider(<CloudNode {...makeProps({ id, text: "Старый" })} />));

    const input = screen.getByTestId("cloud-node-input");
    await user.clear(input);
    await user.type(input, "Первая{Enter}Вторая");

    expect(mindMapStore.getState().graph.nodes[0]?.text).toBe("Первая\nВторая");
    expect(mindMapStore.getState().editingNodeId).toBe(id);
  });

  it("commits the edited text and exits edit mode on Escape", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));

    const input = screen.getByTestId("cloud-node-input");
    await user.clear(input);
    await user.type(input, "Новый{Escape}");

    expect(mindMapStore.getState().graph.nodes[0]?.text).toBe("Новый");
    expect(mindMapStore.getState().editingNodeId).toBeNull();
  });

  it("commits the node and starts a child in editing on Cmd+Enter", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));

    await user.type(screen.getByTestId("cloud-node-input"), "{Meta>}{Enter}{/Meta}");

    const state = mindMapStore.getState();
    expect(state.graph.nodes.find((n) => n.id === id)?.text).toBe("Идея");
    const child = state.graph.nodes.find((n) => n.parentId === id);
    expect(child).toBeDefined();
    expect(state.editingNodeId).toBe(child?.id);
  });

  it("discards an empty fresh node on Cmd+Enter without creating a child", async () => {
    const user = userEvent.setup();
    const id = seedRoot("");
    render(withProvider(<CloudNode {...makeProps({ id, text: "" })} />));

    await user.type(screen.getByTestId("cloud-node-input"), "{Control>}{Enter}{/Control}");

    expect(mindMapStore.getState().graph.nodes).toHaveLength(0);
  });

  it("commits the text on blur", async () => {
    const user = userEvent.setup();
    const id = seedRoot("");
    render(
      withProvider(
        <>
          <CloudNode {...makeProps({ id, text: "" })} />
          <button type="button" data-testid="outside">
            outside
          </button>
        </>,
      ),
    );
    const input = screen.getByTestId("cloud-node-input");
    await user.type(input, "Из блюра");
    await user.click(screen.getByTestId("outside"));

    expect(mindMapStore.getState().graph.nodes[0]?.text).toBe("Из блюра");
    expect(mindMapStore.getState().editingNodeId).toBeNull();
  });

  it("highlights the selected state", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().selectNode(id);
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));
    expect(screen.getByTestId(`cloud-node-${id}`).className).toMatch(/selected/);
  });

  it("highlights the drop-target state while dragged over", () => {
    const id = seedRoot("Цель");
    act(() => {
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().setDropTarget(id);
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Цель" })} />));
    expect(screen.getByTestId(`cloud-node-${id}`).className).toMatch(/dropTarget/);
  });

  it("adds a child to the right via the right + button using the parent's stored position", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Корень", { x: 50, y: 10 });
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Корень" })} />));

    await user.click(screen.getByTestId(`cloud-node-add-${id}-right`));

    const child = mindMapStore.getState().graph.nodes.find((node) => node.parentId === id);
    expect(child).toBeDefined();
    expect(child?.position).toEqual({ x: 50 + CHILD_OFFSET_X, y: 10 });
  });

  it("adds a child to the left via the left + button using a negative offset", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Корень", { x: 50, y: 10 });
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Корень" })} />));

    await user.click(screen.getByTestId(`cloud-node-add-${id}-left`));

    const child = mindMapStore.getState().graph.nodes.find((node) => node.parentId === id);
    expect(child).toBeDefined();
    expect(child?.position).toEqual({ x: 50 - CHILD_OFFSET_X, y: 10 });
  });

  it("auto-lays siblings out so they straddle the parent's y without overlapping", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Корень", { x: 50, y: 10 });
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Корень" })} />));

    await user.click(screen.getByTestId(`cloud-node-add-${id}-right`));
    await user.click(screen.getByTestId(`cloud-node-add-${id}-right`));
    await user.click(screen.getByTestId(`cloud-node-add-${id}-left`));

    const rightChildren = mindMapStore
      .getState()
      .graph.nodes.filter((node) => node.parentId === id && node.position.x > 50)
      .map((node) => node.position.y)
      .sort((a, b) => a - b);
    // Two leaves on the right ⇒ straddle parent.y by ±VSTEP/2.
    expect(rightChildren).toEqual([10 - LAYOUT_VSTEP / 2, 10 + LAYOUT_VSTEP / 2]);

    const leftChildren = mindMapStore
      .getState()
      .graph.nodes.filter((node) => node.parentId === id && node.position.x < 50);
    expect(leftChildren).toHaveLength(1);
    expect(leftChildren[0]?.position).toEqual({ x: 50 - LAYOUT_HSTEP, y: 10 });
  });

  it("hides the inward + button on a right-side non-root node (descendants extend outward only)", () => {
    let rootId = "";
    let childId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      childId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 10, y: 0 },
        text: "C",
      });
      mindMapStore.getState().stopEditing();
    });

    render(withProvider(<CloudNode {...makeProps({ id: childId, text: "C" })} />));
    expect(screen.getByTestId(`cloud-node-add-${childId}-right`)).toBeInTheDocument();
    expect(screen.queryByTestId(`cloud-node-add-${childId}-left`)).toBeNull();
  });

  it("hides the inward + button on a left-side non-root node", () => {
    let rootId = "";
    let childId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      childId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: -10, y: 0 },
        text: "L",
      });
      mindMapStore.getState().stopEditing();
    });

    render(withProvider(<CloudNode {...makeProps({ id: childId, text: "L" })} />));
    expect(screen.getByTestId(`cloud-node-add-${childId}-left`)).toBeInTheDocument();
    expect(screen.queryByTestId(`cloud-node-add-${childId}-right`)).toBeNull();
  });

  it("applies the root style to root nodes only", () => {
    let rootId = "";
    let childId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      childId = mindMapStore.getState().addChild({
        parentId: rootId,
        position: { x: 10, y: 0 },
        text: "C",
      });
      mindMapStore.getState().stopEditing();
    });

    const { unmount } = render(
      withProvider(<CloudNode {...makeProps({ id: rootId, text: "R" })} />),
    );
    expect(screen.getByTestId(`cloud-node-${rootId}`).className).toMatch(/root/);
    unmount();

    render(withProvider(<CloudNode {...makeProps({ id: childId, text: "C" })} />));
    expect(screen.getByTestId(`cloud-node-${childId}`).className).not.toMatch(/root/);
  });

  it("renders both + buttons on a root node", () => {
    const id = seedRoot("Корень");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Корень" })} />));
    expect(screen.getByTestId(`cloud-node-add-${id}-left`)).toBeInTheDocument();
    expect(screen.getByTestId(`cloud-node-add-${id}-right`)).toBeInTheDocument();
  });

  it("renders both + buttons when the node id is not in the store (defensive default)", () => {
    render(withProvider(<CloudNode {...makeProps({ id: "ghost", text: "" })} />));
    expect(screen.getByTestId("cloud-node-add-ghost-left")).toBeInTheDocument();
    expect(screen.getByTestId("cloud-node-add-ghost-right")).toBeInTheDocument();
  });

  it("discards a freshly created empty node when the user commits without typing", async () => {
    const user = userEvent.setup();
    const id = seedRoot(""); // creates an empty root in editing mode
    render(
      withProvider(
        <>
          <CloudNode {...makeProps({ id, text: "" })} />
          <button type="button" data-testid="outside">
            outside
          </button>
        </>,
      ),
    );
    expect(mindMapStore.getState().graph.nodes).toHaveLength(1);
    // Blur the input → commit. Initial was "", current is "" → node is removed.
    await user.click(screen.getByTestId("outside"));
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("discards a freshly created empty node when the user presses Escape", async () => {
    const user = userEvent.setup();
    const id = seedRoot("");
    render(withProvider(<CloudNode {...makeProps({ id, text: "" })} />));
    expect(mindMapStore.getState().graph.nodes).toHaveLength(1);
    await user.type(screen.getByTestId("cloud-node-input"), "{Escape}");
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("commit gracefully copes with the edited node disappearing from the store mid-edit", async () => {
    const user = userEvent.setup();
    // Render an EditView pointing at an id that is not in the store: this
    // simulates a race where the node was removed between paint and blur.
    act(() => {
      mindMapStore.getState().startEditing("ghost");
    });
    render(
      withProvider(
        <>
          <CloudNode {...makeProps({ id: "ghost", text: "" })} />
          <button type="button" data-testid="outside">
            outside
          </button>
        </>,
      ),
    );
    await user.click(screen.getByTestId("outside"));
    // No crash; nothing in the graph to remove either.
    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("keeps an existing node when its text is cleared and committed", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));
    const input = screen.getByTestId("cloud-node-input");
    await user.clear(input);
    await user.type(input, "{Escape}");
    // The user explicitly cleared a pre-existing node — keep it as an empty leaf,
    // do not auto-discard.
    expect(mindMapStore.getState().graph.nodes).toHaveLength(1);
    expect(mindMapStore.getState().graph.nodes[0]?.text).toBe("");
  });

  it("hides the collapse toggle on a node without children", () => {
    const id = seedRoot("Лист");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Лист" })} />));
    expect(screen.queryByTestId(`cloud-node-toggle-${id}`)).toBeNull();
  });

  it("shows the collapse toggle as an accessible button on a node with children", () => {
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().addChild({ parentId: rootId, position: { x: 10, y: 0 }, text: "C" });
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id: rootId, text: "R" })} />));
    expect(screen.getByRole("button", { name: "Свернуть ветвь" })).toBeInTheDocument();
  });

  it("places the collapse toggle on the outer (left) edge for a left-side node", () => {
    let leftChild = "";
    act(() => {
      const rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      // A child to the LEFT of the root inherits the left side; its own child gives
      // it the toggle, rendered on the left variant.
      leftChild = mindMapStore
        .getState()
        .addChild({ parentId: rootId, position: { x: -10, y: 0 }, text: "L" });
      mindMapStore
        .getState()
        .addChild({ parentId: leftChild, position: { x: -20, y: 0 }, text: "G" });
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id: leftChild, text: "L" })} />));
    expect(screen.getByRole("button", { name: "Свернуть ветвь" })).toBeInTheDocument();
  });

  it("toggles collapse state and flips the toggle label when clicked", async () => {
    const user = userEvent.setup();
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().addChild({ parentId: rootId, position: { x: 10, y: 0 }, text: "C" });
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id: rootId, text: "R" })} />));

    await user.click(screen.getByRole("button", { name: "Свернуть ветвь" }));

    expect(mindMapStore.getState().collapsedNodeIds.has(rootId)).toBe(true);
    // The label now offers the inverse action, reachable by the new accessible name.
    expect(screen.getByRole("button", { name: "Развернуть ветвь" })).toBeInTheDocument();
  });

  it("does not let a double-click on the toggle bubble (which would open the editor)", async () => {
    const user = userEvent.setup();
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().addChild({ parentId: rootId, position: { x: 10, y: 0 }, text: "C" });
      mindMapStore.getState().stopEditing();
    });
    // The wrapper stands in for React Flow's node element, whose onNodeDoubleClick
    // starts name editing — the toggle must stop the dblclick before it reaches it.
    const onWrapperDoubleClick = vi.fn();
    render(
      withProvider(
        // biome-ignore lint/a11y/noStaticElementInteractions: test stand-in for React Flow's node wrapper
        <div onDoubleClick={onWrapperDoubleClick}>
          <CloudNode {...makeProps({ id: rootId, text: "R" })} />
        </div>,
      ),
    );

    await user.dblClick(screen.getByRole("button", { name: "Свернуть ветвь" }));

    expect(onWrapperDoubleClick).not.toHaveBeenCalled();
  });

  it("applies the collapsed style to a collapsed node", () => {
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().addChild({ parentId: rootId, position: { x: 10, y: 0 }, text: "C" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().toggleCollapse(rootId);
    });
    render(withProvider(<CloudNode {...makeProps({ id: rootId, text: "R" })} />));
    expect(screen.getByTestId(`cloud-node-${rootId}`).className).toMatch(/collapsed/);
  });

  it("keeps both collapsed and selected styles on a selected collapsed node", () => {
    let rootId = "";
    act(() => {
      rootId = mindMapStore.getState().addRoot({ position: { x: 0, y: 0 }, text: "R" });
      mindMapStore.getState().addChild({ parentId: rootId, position: { x: 10, y: 0 }, text: "C" });
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().toggleCollapse(rootId);
      mindMapStore.getState().selectNode(rootId);
    });
    render(withProvider(<CloudNode {...makeProps({ id: rootId, text: "R" })} />));
    const className = screen.getByTestId(`cloud-node-${rootId}`).className;
    expect(className).toMatch(/collapsed/);
    expect(className).toMatch(/selected/);
  });

  it("marks a node with a body via the 📝 marker before the name", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея", hasBody: true })} />));
    expect(screen.getByLabelText("есть заметка")).toHaveTextContent("📝");
  });

  it("does not mark a node without a body", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея", hasBody: false })} />));
    expect(screen.queryByLabelText("есть заметка")).toBeNull();
  });

  it("does not crash when the + button is clicked for a node that vanished from the store", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Корень");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Корень" })} />));

    act(() => {
      mindMapStore.getState().removeSubtree(id);
    });
    await user.click(screen.getByTestId(`cloud-node-add-${id}-right`));

    expect(mindMapStore.getState().graph.nodes).toEqual([]);
  });

  it("renders the name bold and italic when the node carries that style", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().setNodeStyle(id, { bold: true, italic: true });
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));
    const name = screen.getByTestId("cloud-node-text");
    expect(name.className).toMatch(/bold/);
    expect(name.className).toMatch(/italic/);
  });

  it("renders the name with an enlarged inline font size for a positive font scale", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().setNodeStyle(id, { fontScale: 2 });
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));
    expect(screen.getByTestId("cloud-node-text").style.fontSize).toMatch(/em$/);
  });

  it("renders a node without a style at the base font with no bold/italic", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
    });
    render(withProvider(<CloudNode {...makeProps({ id, text: "Идея" })} />));
    const name = screen.getByTestId("cloud-node-text");
    expect(name.className).not.toMatch(/bold/);
    expect(name.className).not.toMatch(/italic/);
    // No inline font size at the base scale, so the node inherits its CSS size.
    expect(name.style.fontSize).toBe("");
  });
});

// The format toolbar lives in a React Flow NodeToolbar portal, which only renders
// when the node is registered in the flow's node lookup — so these mount the real
// <Canvas> (like Canvas.test) rather than a bare CloudNode.
describe("CloudNode format toolbar", () => {
  it("shows the toolbar while the name is being edited and hides it afterwards", () => {
    seedRoot("Идея"); // addRoot leaves the node in editing mode
    render(<Canvas />);
    expect(screen.getByRole("button", { name: "Жирный" })).toBeInTheDocument();

    act(() => {
      mindMapStore.getState().stopEditing();
    });
    expect(screen.queryByRole("button", { name: "Жирный" })).toBeNull();
  });

  it("changes the style without leaving edit mode when a button is clicked", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Жирный" }));

    expect(mindMapStore.getState().graph.nodes.find((n) => n.id === id)?.style?.bold).toBe(true);
    // onMouseDown+preventDefault keeps focus on the textarea, so editing continues.
    expect(mindMapStore.getState().editingNodeId).toBe(id);
  });

  it("reflects the current bold state as a pressed toggle", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().setNodeStyle(id, { bold: true });
    });
    render(<Canvas />);
    expect(screen.getByRole("button", { name: "Жирный" })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables the enlarge button at the maximum font scale", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().setNodeStyle(id, { fontScale: FONT_SCALE_MAX });
    });
    render(<Canvas />);
    expect(screen.getByRole("button", { name: "Больше шрифт" })).toBeDisabled();
  });

  it("disables the shrink button at the minimum font scale", () => {
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().setNodeStyle(id, { fontScale: FONT_SCALE_MIN });
    });
    render(<Canvas />);
    expect(screen.getByRole("button", { name: "Меньше шрифт" })).toBeDisabled();
  });
});

describe("CloudNode color picker", () => {
  beforeEach(() => {
    // The MRU lives in localStorage; clear it so recent-colour assertions are
    // deterministic per test. Reset the theme attribute too (see the theme test).
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  function colorOf(id: string): string | undefined {
    return mindMapStore.getState().graph.nodes.find((n) => n.id === id)?.style?.color;
  }

  it("shows a colour swatch that opens the popover without leaving edit mode", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея"); // addRoot leaves the node editing
    render(<Canvas />);
    const swatch = screen.getByRole("button", { name: "Цвет узла" });
    expect(screen.queryByTestId("color-popover")).toBeNull();

    await user.click(swatch);

    expect(screen.getByTestId("color-popover")).toBeInTheDocument();
    // onMouseDown+preventDefault keeps focus on the textarea, so editing continues.
    expect(mindMapStore.getState().editingNodeId).toBe(id);
  });

  it("paints the fill with a preset and records it in recent colours", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Цвет узла" }));
    await user.click(screen.getByRole("button", { name: "Цвет blue" }));

    expect(colorOf(id)).toBe("blue");
    expect(readRecentColors()[0]).toBe("blue");
    // Selecting a colour closes the popover but stays in edit mode.
    expect(screen.queryByTestId("color-popover")).toBeNull();
    expect(mindMapStore.getState().editingNodeId).toBe(id);
  });

  it("paints a custom #rrggbb chosen via the native colour input", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Цвет узла" }));
    const colorInput = screen.getByLabelText("Свой цвет");
    // mousedown keeps textarea focus (and off the canvas pan) while the OS picker opens.
    fireEvent.mouseDown(colorInput);
    expect(mindMapStore.getState().editingNodeId).toBe(id);
    // The OS picker is native; emulate a confirmed choice via a change event.
    fireEvent.change(colorInput, { target: { value: "#ff0000" } });

    expect(colorOf(id)).toBe("#ff0000");
    expect(readRecentColors()[0]).toBe("#ff0000");
    // A custom colour renders literally — not as a theme token.
    const node = screen.getByTestId(`cloud-node-${id}`);
    expect(node.getAttribute("style") ?? "").not.toContain("--node-fill-");
  });

  it("resets the colour back to the default surface", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    act(() => {
      // Commit the fresh node and re-enter editing so reset acts on a settled
      // (non-pending) node — its own undo step, not part of the create transaction.
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().setNodeStyle(id, { color: "blue" });
      mindMapStore.getState().startEditing(id);
    });
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Цвет узла" }));
    await user.click(screen.getByRole("button", { name: "Сбросить цвет" }));

    expect(colorOf(id)).toBeUndefined();
    expect(screen.queryByTestId("color-popover")).toBeNull();
  });

  it("resets the inherited colour of a still-pending fresh node", async () => {
    const user = userEvent.setup();
    const parentId = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().stopEditing();
      mindMapStore.getState().setNodeStyle(parentId, { color: "blue" });
      // The new child inherits blue and stays a pending, editing node — reset on it
      // is part of its create transaction, not a separate undo step.
      mindMapStore.getState().addChildOf(parentId);
    });
    const childId = mindMapStore.getState().editingNodeId ?? "";
    expect(colorOf(childId)).toBe("blue");
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Цвет узла" }));
    await user.click(screen.getByRole("button", { name: "Сбросить цвет" }));

    expect(colorOf(childId)).toBeUndefined();
  });

  it("offers a previously used colour and reapplies it", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Цвет узла" }));
    await user.click(screen.getByRole("button", { name: "Цвет green" }));
    // Reopen — green now appears in the recent row.
    await user.click(screen.getByRole("button", { name: "Цвет узла" }));
    await user.click(screen.getByRole("button", { name: "Недавний цвет green" }));

    expect(colorOf(id)).toBe("green");
  });

  it("marks the node's current preset as pressed in the popover", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    act(() => {
      mindMapStore.getState().setNodeStyle(id, { color: "amber" });
    });
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Цвет узла" }));

    expect(screen.getByRole("button", { name: "Цвет amber" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("renders a preset as a theme-aware token whose data survives a theme switch", async () => {
    const user = userEvent.setup();
    const id = seedRoot("Идея");
    render(<Canvas />);

    await user.click(screen.getByRole("button", { name: "Цвет узла" }));
    await user.click(screen.getByRole("button", { name: "Цвет teal" }));

    const node = screen.getByTestId(`cloud-node-${id}`);
    // A preset stays a token reference — the same string in both themes, so CSS
    // repaints it on theme switch without touching the node's stored colour.
    expect(node.getAttribute("style") ?? "").toContain("--node-fill-teal");
    act(() => {
      document.documentElement.dataset.theme = "dark";
    });
    expect(colorOf(id)).toBe("teal");
    expect(node.getAttribute("style") ?? "").toContain("--node-fill-teal");
  });
});
