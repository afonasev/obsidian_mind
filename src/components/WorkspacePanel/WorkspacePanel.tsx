import { type ChangeEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Graph } from "../../domain/types";
import type { PanelRoot, Workspace } from "../../domain/workspaces";
import {
  MAX_PANEL_WIDTH,
  MIN_PANEL_WIDTH,
  mindMapStore,
  useMindMapStore,
} from "../../store/mindmap-store";
import { ResizeHandle } from "../ResizeHandle/ResizeHandle";
import styles from "./WorkspacePanel.module.css";

// Shown for a root whose text is empty (e.g. a freshly created, unnamed root) so
// the list entry is not blank and clickable «into nothing».
const ROOT_PLACEHOLDER = "Без названия";

/** The graph's root nodes (parentId === null) as panel entries, in graph order. */
function rootsFromGraph(graph: Graph): readonly PanelRoot[] {
  return graph.nodes
    .filter((node) => node.parentId === null)
    .map((node) => ({ id: node.id, text: node.text }));
}

// Segment by grapheme cluster, not UTF-16 code unit, so a leading emoji (a
// surrogate pair, possibly with ZWJ/variation selectors) is taken whole instead
// of split into a broken half.
const GRAPHEME_SEGMENTER = new Intl.Segmenter();

/** First visible grapheme for the collapsed square button; «•» when the name is empty. */
function firstLetter(name: string): string {
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(name.trim()), (entry) => entry.segment);
  return (graphemes[0] ?? "•").toUpperCase();
}

export function WorkspacePanel(): JSX.Element {
  const collapsed = useMindMapStore((state) => state.panelCollapsed);
  // Without an open vault the panel shows no spaces (the canvas shows the open
  // invitation) and the refresh action is hidden.
  const hasVault = useMindMapStore((state) => state.hasVault);
  const workspaces = useMindMapStore((state) => state.workspaces);
  const activeWorkspaceId = useMindMapStore((state) => state.activeWorkspaceId);
  const editingWorkspaceId = useMindMapStore((state) => state.editingWorkspaceId);
  // Live graph of the active workspace — its roots are derived here so panel
  // updates immediately on create/rename/delete of a root.
  const graph = useMindMapStore((state) => state.graph);
  const rootsByWorkspace = useMindMapStore((state) => state.rootsByWorkspace);
  const collapsedWorkspaceRoots = useMindMapStore((state) => state.collapsedWorkspaceRoots);
  const width = useMindMapStore((state) => state.panelWidth);

  // Which item's «⋮» menu is open, and which workspace is pending delete-confirm.
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Panel width at the moment a resize drag begins.
  const dragStartWidth = useRef(0);

  function handleToggle(): void {
    void mindMapStore.getState().togglePanel();
  }

  function handleRefresh(): void {
    void mindMapStore.getState().refreshFromDisk();
  }

  if (collapsed) {
    return (
      <div className={`${styles.panel} ${styles.collapsed}`}>
        <button
          type="button"
          className={styles.toggle}
          onClick={handleToggle}
          aria-expanded={false}
          aria-label="Развернуть панель пространств"
        >
          »
        </button>
        <ul className={styles.collapsedList}>
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <button
                type="button"
                className={`${styles.squareButton} ${
                  workspace.id === activeWorkspaceId ? styles.squareActive : ""
                }`}
                onClick={() => void mindMapStore.getState().selectWorkspace(workspace.id)}
                aria-current={workspace.id === activeWorkspaceId}
                aria-label={workspace.name}
                title={workspace.name}
              >
                {firstLetter(workspace.name)}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const pendingDelete = workspaces.find((workspace) => workspace.id === pendingDeleteId) ?? null;

  function handleCreate(): void {
    setMenuOpenId(null);
    void mindMapStore.getState().createWorkspace();
  }

  return (
    <div className={styles.panel} style={{ width }}>
      <div className={styles.header}>
        <span className={styles.title}>Пространства</span>
        <div className={styles.headerActions}>
          {hasVault ? (
            <button
              type="button"
              className={styles.refresh}
              onClick={handleRefresh}
              aria-label="Перечитать с диска"
              title="Перечитать с диска"
            >
              ⟳
            </button>
          ) : null}
          <button
            type="button"
            className={styles.toggle}
            onClick={handleToggle}
            aria-expanded={true}
            aria-label="Свернуть панель пространств"
          >
            «
          </button>
        </div>
      </div>

      {hasVault ? (
        <>
          <ul className={styles.list}>
            {workspaces.map((workspace) => {
              const isActive = workspace.id === activeWorkspaceId;
              // Active workspace's roots come from the live graph; inactive ones are
              // read from the cache, which stays put while they are inactive.
              const roots = isActive
                ? rootsFromGraph(graph)
                : (rootsByWorkspace.get(workspace.id) ?? []);
              return (
                <WorkspaceItem
                  key={workspace.id}
                  workspace={workspace}
                  isActive={isActive}
                  isEditing={workspace.id === editingWorkspaceId}
                  isMenuOpen={workspace.id === menuOpenId}
                  roots={roots}
                  rootsCollapsed={collapsedWorkspaceRoots.has(workspace.id)}
                  onToggleMenu={() =>
                    setMenuOpenId((current) => (current === workspace.id ? null : workspace.id))
                  }
                  onRequestDelete={() => {
                    setMenuOpenId(null);
                    setPendingDeleteId(workspace.id);
                  }}
                />
              );
            })}
          </ul>

          <button
            type="button"
            className={styles.add}
            onClick={handleCreate}
            aria-label="Создать пространство"
          >
            +
          </button>

          {pendingDelete !== null ? (
            <ConfirmDeleteDialog
              workspace={pendingDelete}
              onConfirm={() => {
                const id = pendingDelete.id;
                setPendingDeleteId(null);
                void mindMapStore.getState().deleteWorkspace(id);
              }}
              onCancel={() => setPendingDeleteId(null)}
            />
          ) : null}
        </>
      ) : null}

      <ResizeHandle
        edge="right"
        ariaLabel="Изменить ширину панели пространств"
        value={width}
        min={MIN_PANEL_WIDTH}
        max={MAX_PANEL_WIDTH}
        onResizeStart={() => {
          dragStartWidth.current = mindMapStore.getState().panelWidth;
        }}
        onResize={(deltaX) =>
          mindMapStore.getState().setPanelWidth(dragStartWidth.current + deltaX, false)
        }
        onResizeEnd={() =>
          mindMapStore.getState().setPanelWidth(mindMapStore.getState().panelWidth, true)
        }
      />
    </div>
  );
}

interface WorkspaceItemProps {
  readonly workspace: Workspace;
  readonly isActive: boolean;
  readonly isEditing: boolean;
  readonly isMenuOpen: boolean;
  readonly roots: readonly PanelRoot[];
  readonly rootsCollapsed: boolean;
  readonly onToggleMenu: () => void;
  readonly onRequestDelete: () => void;
}

function WorkspaceItem({
  workspace,
  isActive,
  isEditing,
  isMenuOpen,
  roots,
  rootsCollapsed,
  onToggleMenu,
  onRequestDelete,
}: WorkspaceItemProps): JSX.Element {
  function handleSelect(): void {
    void mindMapStore.getState().selectWorkspace(workspace.id);
  }

  function handleRename(): void {
    onToggleMenu();
    mindMapStore.getState().startWorkspaceRename(workspace.id);
  }

  function handleToggleRoots(): void {
    void mindMapStore.getState().toggleWorkspaceRoots(workspace.id);
  }

  return (
    <li className={styles.item}>
      <div className={`${styles.row} ${isActive ? styles.active : ""}`}>
        <button
          type="button"
          className={styles.chevron}
          onClick={handleToggleRoots}
          aria-expanded={!rootsCollapsed}
          aria-label={
            rootsCollapsed
              ? `Развернуть корни пространства «${workspace.name}»`
              : `Свернуть корни пространства «${workspace.name}»`
          }
        >
          {rootsCollapsed ? "›" : "⌄"}
        </button>
        {isEditing ? (
          <WorkspaceNameInput workspaceId={workspace.id} initialName={workspace.name} />
        ) : (
          <button
            type="button"
            className={styles.select}
            onClick={handleSelect}
            aria-current={isActive}
          >
            {workspace.name}
          </button>
        )}
        <button
          type="button"
          className={styles.menuButton}
          onClick={onToggleMenu}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={`Меню пространства «${workspace.name}»`}
        >
          ⋮
        </button>
        {isMenuOpen ? (
          <div className={styles.menu} role="menu">
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={handleRename}
            >
              Переименовать
            </button>
            <button
              type="button"
              className={styles.menuItem}
              role="menuitem"
              onClick={onRequestDelete}
            >
              Удалить
            </button>
          </div>
        ) : null}
      </div>
      {rootsCollapsed ? null : (
        <ul className={styles.roots}>
          {roots.map((root) => (
            <li key={root.id}>
              <button
                type="button"
                className={styles.root}
                onClick={() => void mindMapStore.getState().focusRoot(workspace.id, root.id)}
              >
                {root.text.trim() === "" ? ROOT_PLACEHOLDER : root.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function WorkspaceNameInput({
  workspaceId,
  initialName,
}: {
  readonly workspaceId: string;
  readonly initialName: string;
}): JSX.Element {
  const [text, setText] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Enter / Escape both finish by blurring, so onBlur is the single commit point —
  // this ref tells it whether the edit was cancelled (Escape) or confirmed.
  const cancelled = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function onChange(event: ChangeEvent<HTMLInputElement>): void {
    setText(event.target.value);
  }

  function onBlur(): void {
    if (cancelled.current) {
      void mindMapStore.getState().cancelWorkspaceName(workspaceId);
    } else {
      void mindMapStore.getState().commitWorkspaceName(workspaceId, text);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      inputRef.current?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelled.current = true;
      inputRef.current?.blur();
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
      onBlur={onBlur}
      aria-label="Имя пространства"
    />
  );
}

function ConfirmDeleteDialog({
  workspace,
  onConfirm,
  onCancel,
}: {
  readonly workspace: Workspace;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  return (
    <div className={styles.backdrop}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`Удалить пространство «${workspace.name}»?`}
        onKeyDown={onKeyDown}
      >
        <p className={styles.dialogText}>
          Удалить пространство «{workspace.name}» вместе со всеми узлами? Действие необратимо.
        </p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            Отмена
          </button>
          {/* biome-ignore lint/a11y/noAutofocus: focus the destructive action's dialog so Escape/Enter work immediately without leaking keys to the canvas. */}
          <button type="button" className={styles.confirm} onClick={onConfirm} autoFocus>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}
