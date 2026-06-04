import { Handle, type Node as RFNode, type NodeProps, Position } from "@xyflow/react";
import {
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
} from "react";
import { LAYOUT_HSTEP, sideOf } from "../../domain/layout";
import type { MindNode } from "../../domain/types";
import { mindMapStore, useMindMapStore } from "../../store/mindmap-store";
import styles from "./CloudNode.module.css";

export const CHILD_OFFSET_X = LAYOUT_HSTEP;

export type ChildDirection = "left" | "right";

export interface CloudNodeData extends Record<string, unknown> {
  readonly text: string;
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
  const showLeft = isRoot || side === "left";
  const showRight = isRoot || side === "right";

  return (
    <div
      className={[
        styles.node,
        isRoot ? styles.root : "",
        isSelected ? styles.selected : "",
        isEditing ? styles.editing : "",
        isDropTarget ? styles.dropTarget : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={`cloud-node-${id}`}
    >
      <Handle id="target-left" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="target-right" type="target" position={Position.Right} isConnectable={false} />
      {isEditing ? <EditView id={id} /> : <TextView text={data.text} />}
      {showLeft ? <AddChildButton parentId={id} direction="left" /> : null}
      {showRight ? <AddChildButton parentId={id} direction="right" /> : null}
      <Handle id="source-left" type="source" position={Position.Left} isConnectable={false} />
      <Handle id="source-right" type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function TextView({ text }: { readonly text: string }): JSX.Element {
  if (text === "") {
    return (
      <span className={`${styles.text} ${styles.placeholder}`} data-testid="cloud-node-text">
        Без названия
      </span>
    );
  }
  return (
    <span className={styles.text} data-testid="cloud-node-text">
      {text}
    </span>
  );
}

function EditView({ id }: { readonly id: string }): JSX.Element {
  // Read the live text from the store so each keystroke flows through
  // `updateText` → layout → render, keeping descendants re-aligned in real time.
  const text = useMindMapStore(
    (state) => state.graph.nodes.find((node) => node.id === id)?.text ?? "",
  );
  // Capture the text at mount so Escape can restore it.
  const initialRef = useRef(text);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Autofocus when the input mounts so the user can type immediately. The node is
  // rendered visible from the first frame (see initialWidth/initialHeight in
  // Canvas.toRFNodes) — without that, React Flow renders a fresh node
  // `visibility:hidden` until it measures it, and focusing a hidden element
  // silently lands on <body>, swallowing the first keystrokes.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

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

  function cancel(): void {
    // Escape on a fresh node also discards it, matching the commit behaviour.
    if (initialRef.current === "") {
      mindMapStore.getState().removeSubtree(id);
      return;
    }
    mindMapStore.getState().updateText(id, initialRef.current);
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

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    mindMapStore.getState().updateText(id, event.target.value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    // Stop React Flow from intercepting Delete/Enter while editing text.
    event.stopPropagation();
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commitAndAddChild();
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  return (
    <input
      ref={inputRef}
      type="text"
      className={styles.input}
      value={text}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={commit}
      // Match the input's width to the current text so toggling edit mode does
      // not jump the node from its fitted size to the HTML default (~20 chars).
      // CSS max-width: 100% on .input still caps growth at the node's max-width.
      size={Math.max(1, text.length)}
      data-testid="cloud-node-input"
      aria-label="Текст узла"
    />
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
