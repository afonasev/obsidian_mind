import { type ChangeEvent, type JSX, type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { Workspace } from "../../domain/workspaces";
import { mindMapStore, useMindMapStore } from "../../store/mindmap-store";
import styles from "./WorkspacePanel.module.css";

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
  const workspaces = useMindMapStore((state) => state.workspaces);
  const activeWorkspaceId = useMindMapStore((state) => state.activeWorkspaceId);
  const editingWorkspaceId = useMindMapStore((state) => state.editingWorkspaceId);

  // Which item's «⋮» menu is open, and which workspace is pending delete-confirm.
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  function handleToggle(): void {
    void mindMapStore.getState().togglePanel();
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
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Пространства</span>
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

      <ul className={styles.list}>
        {workspaces.map((workspace) => (
          <WorkspaceItem
            key={workspace.id}
            workspace={workspace}
            isActive={workspace.id === activeWorkspaceId}
            isEditing={workspace.id === editingWorkspaceId}
            isMenuOpen={workspace.id === menuOpenId}
            onToggleMenu={() =>
              setMenuOpenId((current) => (current === workspace.id ? null : workspace.id))
            }
            onRequestDelete={() => {
              setMenuOpenId(null);
              setPendingDeleteId(workspace.id);
            }}
          />
        ))}
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
    </div>
  );
}

interface WorkspaceItemProps {
  readonly workspace: Workspace;
  readonly isActive: boolean;
  readonly isEditing: boolean;
  readonly isMenuOpen: boolean;
  readonly onToggleMenu: () => void;
  readonly onRequestDelete: () => void;
}

function WorkspaceItem({
  workspace,
  isActive,
  isEditing,
  isMenuOpen,
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

  return (
    <li className={`${styles.item} ${isActive ? styles.active : ""}`}>
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
          <button type="button" className={styles.menuItem} role="menuitem" onClick={handleRename}>
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
