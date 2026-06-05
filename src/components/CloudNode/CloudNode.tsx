import { Handle, type NodeProps, NodeToolbar, Position, type Node as RFNode } from "@xyflow/react";
import {
  type ChangeEvent,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  FONT_SCALE_BASE,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  fontScaleFactor,
  LAYOUT_HSTEP,
  sideOf,
} from "../../domain/layout";
import type { MindNode, NodeNameStyle } from "../../domain/types";
import { isPresetKey, PRESET_KEYS } from "../../node-color/presets";
import { useRecentColors } from "../../node-color/useRecentColors";
import { mindMapStore, useMindMapStore } from "../../store/mindmap-store";
import styles from "./CloudNode.module.css";

/**
 * Inline background for a node's fill colour. A preset key resolves to its
 * theme-aware token (`--node-fill-<key>`); a raw `#rrggbb` is used literally (same
 * in both themes). Undefined when the node has no colour, so the CSS default
 * surface shows through. Inline because the value is dynamic per node.
 */
function fillStyle(color: string | undefined): CSSProperties | undefined {
  if (color === undefined) {
    return undefined;
  }
  return { background: isPresetKey(color) ? `var(--node-fill-${color})` : color };
}

export const CHILD_OFFSET_X = LAYOUT_HSTEP;

export type ChildDirection = "left" | "right";

export interface CloudNodeData extends Record<string, unknown> {
  readonly text: string;
  // Whether the node has a non-empty markdown body; drives the inner "double border"
  // indicator. Carried as a flag (not the body itself) — the canvas never needs the text.
  readonly hasBody: boolean;
}

export type CloudNodeType = RFNode<CloudNodeData, "cloud">;

export type CloudNodeProps = NodeProps<CloudNodeType>;

export function CloudNode({ id, data }: CloudNodeProps): JSX.Element {
  const isEditing = useMindMapStore((state) => state.editingNodeId === id);
  const isSelected = useMindMapStore((state) => state.selectedNodeId === id);
  // Root nodes branch both ways; non-roots extend only outward (the inherited side).
  // Two primitive selectors keep referential equality stable so zustand does not loop.
  const isRoot = useMindMapStore((state) => {
    const node = state.graph.nodes.find((n) => n.id === id);
    return node === undefined || node.parentId === null;
  });
  const side = useMindMapStore((state) => sideOf(state.graph, id));
  // Dim/outline this node while another node is dragged over it as a re-parent target.
  const isDropTarget = useMindMapStore((state) => state.dropTargetId === id);
  // Primitive selectors keep zustand referential equality stable (no derived objects).
  const hasChildren = useMindMapStore((state) => state.graph.nodes.some((n) => n.parentId === id));
  const isCollapsed = useMindMapStore((state) => state.collapsedNodeIds.has(id));
  // Name styling — primitive selectors keep zustand referential equality stable
  // (returning the `style` object directly would create a new reference each render).
  const bold = useMindMapStore(
    (state) => state.graph.nodes.find((n) => n.id === id)?.style?.bold ?? false,
  );
  const italic = useMindMapStore(
    (state) => state.graph.nodes.find((n) => n.id === id)?.style?.italic ?? false,
  );
  const fontScale = useMindMapStore(
    (state) => state.graph.nodes.find((n) => n.id === id)?.style?.fontScale ?? FONT_SCALE_BASE,
  );
  // Fill colour — a primitive selector (string | undefined) keeps zustand
  // referential equality stable, like bold/italic/fontScale above.
  const color = useMindMapStore(
    (state) => state.graph.nodes.find((n) => n.id === id)?.style?.color,
  );
  const showLeft = isRoot || side === "left";
  const showRight = isRoot || side === "right";
  // A root collapses both sides with a single toggle; a non-root toggles on its outward side.
  const toggleSide: ChildDirection = isRoot || side === "right" ? "right" : "left";

  return (
    <div
      className={[
        styles.node,
        isRoot ? styles.root : "",
        isSelected ? styles.selected : "",
        isEditing ? styles.editing : "",
        isDropTarget ? styles.dropTarget : "",
        isCollapsed ? styles.collapsed : "",
        data.hasBody ? styles.hasBody : "",
      ]
        .filter(Boolean)
        .join(" ")}
      // User fill colour applies in both view and edit modes; absent → CSS default
      // surface. Inline so it wins over the themed background classes.
      style={fillStyle(color)}
      data-testid={`cloud-node-${id}`}
    >
      <Handle id="target-left" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="target-right" type="target" position={Position.Right} isConnectable={false} />
      <FormatToolbar
        id={id}
        isEditing={isEditing}
        bold={bold}
        italic={italic}
        fontScale={fontScale}
        color={color}
      />
      {isEditing ? (
        <EditView id={id} bold={bold} italic={italic} fontScale={fontScale} />
      ) : (
        <TextView text={data.text} bold={bold} italic={italic} fontScale={fontScale} />
      )}
      {showLeft ? <AddChildButton parentId={id} direction="left" /> : null}
      {showRight ? <AddChildButton parentId={id} direction="right" /> : null}
      {hasChildren ? (
        <CollapseToggle id={id} direction={toggleSide} isCollapsed={isCollapsed} />
      ) : null}
      <Handle id="source-left" type="source" position={Position.Left} isConnectable={false} />
      <Handle id="source-right" type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

interface NameStyleProps {
  readonly bold: boolean;
  readonly italic: boolean;
  readonly fontScale: number;
}

/** Bold/italic class string for a styled name (empty when neither is set). */
function nameClassName(bold: boolean, italic: boolean): string {
  return [bold ? styles.bold : "", italic ? styles.italic : ""].filter(Boolean).join(" ");
}

/**
 * Inline font size for a relative scale step. Inline (not a class) because the
 * value is dynamic and relative to the node's base size via `em`; undefined at the
 * base scale so root/non-root inherit their CSS font size untouched.
 */
function nameFontStyle(fontScale: number): CSSProperties | undefined {
  return fontScale === FONT_SCALE_BASE
    ? undefined
    : { fontSize: `${fontScaleFactor(fontScale)}em` };
}

function TextView({
  text,
  bold,
  italic,
  fontScale,
}: { readonly text: string } & NameStyleProps): JSX.Element {
  const className = [
    styles.text,
    nameClassName(bold, italic),
    text === "" ? styles.placeholder : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={className} style={nameFontStyle(fontScale)} data-testid="cloud-node-text">
      {text === "" ? "Без названия" : text}
    </span>
  );
}

function EditView({
  id,
  bold,
  italic,
  fontScale,
}: { readonly id: string } & NameStyleProps): JSX.Element {
  // Read the live text from the store so each keystroke flows through
  // `updateText` → layout → render, keeping descendants re-aligned in real time.
  const text = useMindMapStore(
    (state) => state.graph.nodes.find((node) => node.id === id)?.text ?? "",
  );
  // Capture the text at mount so a freshly created node can be discarded if left empty.
  const initialRef = useRef(text);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Autofocus when the input mounts so the user can type immediately. The node is
  // rendered visible from the first frame (see initialWidth/initialHeight in
  // Canvas.toRFNodes) — without that, React Flow renders a fresh node
  // `visibility:hidden` until it measures it, and focusing a hidden element
  // silently lands on <body>, swallowing the first keystrokes.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Grow the textarea to fit soft-wrapped lines. `rows` below counts hard newlines
  // only, so a single long line that wraps at the node's max-width would otherwise
  // be clipped to one row (overflow:hidden) and collapse the node to one line.
  // Measuring scrollHeight after each change lets the node grow like the view does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text and fontScale are intentional re-measure triggers — they change the rendered textarea size but the body reads it from the DOM, not from them directly.
  useEffect(() => {
    const el = inputRef.current;
    // The ref is always attached when this effect runs; the null guard is defensive.
    /* v8 ignore start */
    if (el === null) {
      return;
    }
    /* v8 ignore stop */
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, fontScale]);

  function commit(): void {
    // A fresh node (initialRef.current === "") that the user exits without
    // typing anything should not stay around as an unnamed leaf. Same for
    // a fresh node that was typed then cleared back to empty.
    const currentText = mindMapStore.getState().graph.nodes.find((n) => n.id === id)?.text ?? "";
    if (initialRef.current === "" && currentText === "") {
      mindMapStore.getState().removeSubtree(id);
      return;
    }
    mindMapStore.getState().stopEditing();
  }

  function commitAndAddChild(): void {
    // Cmd/Ctrl+Enter commits the current node, then branches a child off it and
    // edits that child — so a tree can be built without leaving the keyboard.
    commit();
    // commit() discards an empty fresh node; only branch off a node that survived.
    if (mindMapStore.getState().graph.nodes.some((n) => n.id === id)) {
      mindMapStore.getState().addChildOf(id);
    }
  }

  function onChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    mindMapStore.getState().updateText(id, event.target.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    // Stop React Flow from intercepting Delete/Enter while editing text.
    event.stopPropagation();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitAndAddChild();
    } else if (event.key === "Escape") {
      event.preventDefault();
      commit();
    }
    // A plain Enter falls through to the textarea's default — it inserts a newline
    // inside the label instead of committing.
  }

  const lines = text.split("\n");

  return (
    <textarea
      ref={inputRef}
      className={[styles.input, nameClassName(bold, italic)].filter(Boolean).join(" ")}
      style={nameFontStyle(fontScale)}
      value={text}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={commit}
      // Size the textarea to its content (longest line × line count) so toggling
      // edit mode does not jump the node from its fitted size to the HTML default.
      // CSS max-width: 100% still caps growth at the node's max-width.
      cols={Math.max(1, ...lines.map((line) => line.length))}
      rows={lines.length}
      data-testid="cloud-node-input"
      aria-label="Текст узла"
    />
  );
}

function FormatToolbar({
  id,
  isEditing,
  bold,
  italic,
  fontScale,
  color,
}: {
  readonly id: string;
  readonly isEditing: boolean;
  readonly color: string | undefined;
} & NameStyleProps): JSX.Element {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { recent, apply: pushRecent } = useRecentColors();

  // onMouseDown + preventDefault (not onClick): a plain click would move focus off
  // the textarea, firing its onBlur → commit and dropping out of name editing.
  // Preventing the default keeps focus where it is, so styling stays in edit mode.
  // stopPropagation keeps the mousedown from reaching React Flow's pan/zoom handler
  // (a toolbar click must not start a canvas drag).
  function apply(patch: NodeNameStyle): (event: MouseEvent<HTMLButtonElement>) => void {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();
      mindMapStore.getState().setNodeStyle(id, patch);
    };
  }

  // Same focus-keeping guard, then: paint the node, remember the colour in the MRU,
  // and close the popover (selection is a one-shot action).
  function chooseColor(value: string): (event: MouseEvent<HTMLElement>) => void {
    return (event) => {
      event.preventDefault();
      event.stopPropagation();
      mindMapStore.getState().setNodeStyle(id, { color: value });
      pushRecent(value);
      setPickerOpen(false);
    };
  }

  function resetColor(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    mindMapStore.getState().resetNodeColor(id);
    setPickerOpen(false);
  }

  // Native colour picker fires `change` on confirm; treat the chosen #rrggbb as a
  // custom colour. preventDefault on the input's mousedown (above) keeps textarea
  // focus while still letting the click open the OS picker.
  function handleCustom(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    mindMapStore.getState().setNodeStyle(id, { color: value });
    pushRecent(value);
    setPickerOpen(false);
  }

  function togglePicker(event: MouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    setPickerOpen((open) => !open);
  }

  return (
    <NodeToolbar
      nodeId={id}
      isVisible={isEditing}
      position={Position.Top}
      // `nopan` keeps React Flow's d3-zoom from treating a toolbar mousedown as a
      // canvas pan (its filter ignores nopan-wrapped targets).
      className={`${styles.toolbar} nopan`}
    >
      <button
        type="button"
        className={`${styles.toolbarButton} ${bold ? styles.toolbarActive : ""}`}
        aria-label="Жирный"
        aria-pressed={bold}
        onMouseDown={apply({ bold: !bold })}
      >
        B
      </button>
      <button
        type="button"
        className={`${styles.toolbarButton} ${italic ? styles.toolbarActive : ""}`}
        aria-label="Курсив"
        aria-pressed={italic}
        onMouseDown={apply({ italic: !italic })}
      >
        I
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Меньше шрифт"
        disabled={fontScale <= FONT_SCALE_MIN}
        onMouseDown={apply({ fontScale: fontScale - 1 })}
      >
        A−
      </button>
      <button
        type="button"
        className={styles.toolbarButton}
        aria-label="Больше шрифт"
        disabled={fontScale >= FONT_SCALE_MAX}
        onMouseDown={apply({ fontScale: fontScale + 1 })}
      >
        A+
      </button>
      <button
        type="button"
        className={`${styles.toolbarButton} ${styles.swatchButton}`}
        aria-label="Цвет узла"
        aria-haspopup="true"
        aria-expanded={pickerOpen}
        onMouseDown={togglePicker}
      >
        <span className={styles.swatchPreview} style={fillStyle(color)} />
      </button>
      {pickerOpen ? (
        <div className={styles.colorPopover} data-testid="color-popover">
          <div className={styles.presetGrid}>
            {/* Reset is the first cell of the 6-column grid (⊘ + 5 presets in row 1,
                then two rows of 6), so the palette reads as one aligned block. */}
            <button
              type="button"
              className={`${styles.presetSwatch} ${styles.resetSwatch}`}
              aria-label="Сбросить цвет"
              onMouseDown={resetColor}
            >
              ⊘
            </button>
            {PRESET_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={styles.presetSwatch}
                style={{ background: `var(--node-fill-${key})` }}
                aria-label={`Цвет ${key}`}
                aria-pressed={color === key}
                onMouseDown={chooseColor(key)}
              />
            ))}
          </div>
          <div className={styles.divider} />
          {/* Last row: up to 5 recent colours, then the native system picker as the
              trailing cell — same column metrics as the grid above for alignment. */}
          <div className={styles.recentRow}>
            {recent.map((value) => (
              <button
                key={value}
                type="button"
                className={styles.presetSwatch}
                style={fillStyle(value)}
                aria-label={`Недавний цвет ${value}`}
                onMouseDown={chooseColor(value)}
              />
            ))}
            <input
              type="color"
              className={styles.colorInput}
              aria-label="Свой цвет"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onChange={handleCustom}
            />
          </div>
        </div>
      ) : null}
    </NodeToolbar>
  );
}

function AddChildButton({
  parentId,
  direction,
}: {
  readonly parentId: string;
  readonly direction: ChildDirection;
}): JSX.Element {
  function onClick(event: MouseEvent<HTMLButtonElement>): void {
    // Prevent the click from bubbling to the node (and thus to React Flow's selection logic).
    event.stopPropagation();
    const graph = mindMapStore.getState().graph;
    const parent: MindNode | undefined = graph.nodes.find((node) => node.id === parentId);
    if (parent === undefined) {
      return;
    }
    // The sign of dx tells the layout pass which side this child belongs to; the
    // exact coordinates are overwritten by the tidy-tree layout in the store.
    const dx = direction === "right" ? CHILD_OFFSET_X : -CHILD_OFFSET_X;
    mindMapStore.getState().addChild({
      parentId,
      position: { x: parent.position.x + dx, y: parent.position.y },
    });
  }

  return (
    <button
      type="button"
      className={`${styles.addButton} ${direction === "right" ? styles.addButtonRight : styles.addButtonLeft}`}
      onClick={onClick}
      data-testid={`cloud-node-add-${parentId}-${direction}`}
      aria-label={
        direction === "right" ? "Добавить дочерний узел справа" : "Добавить дочерний узел слева"
      }
    >
      +
    </button>
  );
}

function CollapseToggle({
  id,
  direction,
  isCollapsed,
}: {
  readonly id: string;
  readonly direction: ChildDirection;
  readonly isCollapsed: boolean;
}): JSX.Element {
  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    // Prevent the click from bubbling to the node (and thus to React Flow's selection logic).
    event.stopPropagation();
    mindMapStore.getState().toggleCollapse(id);
  }

  function handleDoubleClick(event: MouseEvent<HTMLButtonElement>): void {
    // A fast collapse→expand reads as a double-click; without this it bubbles to
    // React Flow's onNodeDoubleClick and opens the node's name editor.
    event.stopPropagation();
  }

  return (
    <button
      type="button"
      className={`${styles.toggleButton} ${direction === "right" ? styles.toggleButtonRight : styles.toggleButtonLeft}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      data-testid={`cloud-node-toggle-${id}`}
      aria-label={isCollapsed ? "Развернуть ветвь" : "Свернуть ветвь"}
    >
      {isCollapsed ? "▸" : "▾"}
    </button>
  );
}
