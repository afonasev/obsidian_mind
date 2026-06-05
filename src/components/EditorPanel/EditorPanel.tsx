import {
  type ChangeEvent,
  type JSX,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NodeId } from "../../domain/types";
import {
  MAX_EDITOR_WIDTH,
  MIN_EDITOR_WIDTH,
  mindMapStore,
  useMindMapStore,
} from "../../store/mindmap-store";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import styles from "./EditorPanel.module.css";

// Shown for a node/parent whose name is empty, so the entry is never blank.
const NAME_PLACEHOLDER = "Без названия";
// Idle delay before an in-progress body edit is committed without a blur.
const BODY_COMMIT_DELAY_MS = 1000;

export function EditorPanel(): JSX.Element {
  const collapsed = useMindMapStore((state) => state.editorCollapsed);
  const width = useMindMapStore((state) => state.editorWidth);
  // Panel width at the moment a resize drag begins.
  const dragStartWidth = useRef(0);

  function handleToggle(): void {
    void mindMapStore.getState().toggleEditor();
  }

  if (collapsed) {
    return (
      <div className={`${styles.panel} ${styles.collapsed}`}>
        <button
          type="button"
          className={styles.toggle}
          onClick={handleToggle}
          aria-expanded={false}
          aria-label="Развернуть панель редактора"
        >
          «
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel} style={{ width }}>
      <ResizeHandle
        edge="left"
        ariaLabel="Изменить ширину панели редактора"
        value={width}
        min={MIN_EDITOR_WIDTH}
        max={MAX_EDITOR_WIDTH}
        onResizeStart={() => {
          dragStartWidth.current = mindMapStore.getState().editorWidth;
        }}
        // Dragging the left edge leftwards (negative deltaX) widens the panel.
        onResize={(deltaX) =>
          mindMapStore.getState().setEditorWidth(dragStartWidth.current - deltaX, false)
        }
        onResizeEnd={() =>
          mindMapStore.getState().setEditorWidth(mindMapStore.getState().editorWidth, true)
        }
      />
      <div className={styles.header}>
        <span className={styles.title}>Редактор</span>
        <button
          type="button"
          className={styles.toggle}
          onClick={handleToggle}
          aria-expanded={true}
          aria-label="Свернуть панель редактора"
        >
          »
        </button>
      </div>
      <EditorContent />
    </div>
  );
}

function EditorContent(): JSX.Element {
  const node = useMindMapStore((state) =>
    state.selectedNodeId === null
      ? null
      : (state.graph.nodes.find((n) => n.id === state.selectedNodeId) ?? null),
  );

  if (node === null) {
    return <p className={styles.empty}>Выберите узел</p>;
  }

  return (
    <div className={styles.content}>
      <ParentLink parentId={node.parentId} />
      {/* `text` flows down from here (re-selected on every store change), so an
          external inline rename re-renders this and updates the field. */}
      <TitleInput id={node.id} text={node.text} />
      {/* Remount on node change so the body buffer resets and the unmounting
          editor commits the previous node's unsaved edit (see BodyTextarea). */}
      <BodyEditor key={node.id} nodeId={node.id} />
    </div>
  );
}

function ParentLink({ parentId }: { readonly parentId: NodeId | null }): JSX.Element | null {
  const parentName = useMindMapStore((state) =>
    parentId === null ? null : (state.graph.nodes.find((n) => n.id === parentId)?.text ?? ""),
  );

  if (parentId === null || parentName === null) {
    return null;
  }

  function handleClick(): void {
    // parentId is narrowed to NodeId by the guard above.
    const id = parentId as NodeId;
    mindMapStore.getState().selectNode(id);
    mindMapStore.getState().revealNode(id);
  }

  return (
    <button type="button" className={styles.parent} onClick={handleClick}>
      {parentName.trim() === "" ? NAME_PLACEHOLDER : parentName}
    </button>
  );
}

function TitleInput({ id, text }: { readonly id: NodeId; readonly text: string }): JSX.Element {
  // Writes go straight through updateText so the canvas/left panel update in sync;
  // the displayed value is the prop, kept current by EditorContent's re-render.
  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    mindMapStore.getState().updateText(id, event.target.value);
  }

  return (
    <input
      type="text"
      className={styles.titleInput}
      value={text}
      onChange={onChange}
      placeholder={NAME_PLACEHOLDER}
      aria-label="Имя узла"
    />
  );
}

function BodyEditor({ nodeId }: { readonly nodeId: NodeId }): JSX.Element {
  const body = useMindMapStore(
    (state) => state.graph.nodes.find((n) => n.id === nodeId)?.body ?? "",
  );
  const [editing, setEditing] = useState(false);

  if (editing) {
    return <BodyTextarea nodeId={nodeId} initialBody={body} onDone={() => setEditing(false)} />;
  }

  if (body.trim() === "") {
    return (
      <button type="button" className={styles.bodyPlaceholder} onClick={() => setEditing(true)}>
        Добавить заметку…
      </button>
    );
  }

  function onActivate(): void {
    setEditing(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setEditing(true);
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a <button> may not contain block-level markdown (headings, lists); a div with role=button + key handler is the accessible substitute.
    <div
      className={styles.bodyView}
      role="button"
      tabIndex={0}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      aria-label="Тело узла, нажмите чтобы редактировать"
    >
      <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
    </div>
  );
}

function BodyTextarea({
  nodeId,
  initialBody,
  onDone,
}: {
  readonly nodeId: NodeId;
  readonly initialBody: string;
  readonly onDone: () => void;
}): JSX.Element {
  const [text, setText] = useState(initialBody);
  // Mirror of the buffer for the timer/unmount commits, which must read the latest
  // value without re-subscribing on every keystroke.
  const latest = useRef(initialBody);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const commit = useCallback(() => {
    const current = mindMapStore.getState().graph.nodes.find((n) => n.id === nodeId)?.body ?? "";
    // Idempotent: skip when the buffer already matches the stored body, so blur +
    // timer + unmount cannot stack duplicate undo steps.
    if (latest.current !== current) {
      mindMapStore.getState().updateBody(nodeId, latest.current);
    }
  }, [nodeId]);

  // Commit the pending buffer when the editor unmounts (the selected node changed),
  // and drop any in-flight idle timer.
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      commit();
    },
    [commit],
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function onChange(event: ChangeEvent<HTMLTextAreaElement>): void {
    latest.current = event.target.value;
    setText(event.target.value);
    // Restart the idle-commit timer on each keystroke; it fires a second after the
    // last change.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(commit, BODY_COMMIT_DELAY_MS);
  }

  function onBlur(): void {
    commit();
    onDone();
  }

  return (
    <textarea
      ref={textareaRef}
      className={styles.bodyTextarea}
      value={text}
      onChange={onChange}
      onBlur={onBlur}
      aria-label="Тело узла (markdown)"
    />
  );
}
