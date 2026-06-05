import { createStore, type StoreApi, useStore } from "zustand";
import * as graphOps from "../domain/graph";
import { appendChildY, LAYOUT_HSTEP, layout, sideOf } from "../domain/layout";
import type { NavEntry } from "../domain/nav-history";
import * as navHistory from "../domain/nav-history";
import type { Graph, NodeId, NodeNameStyle, Position } from "../domain/types";
import type { PanelRoot, Workspace } from "../domain/workspaces";
import * as workspaceOps from "../domain/workspaces";
import { createDebouncedSaver, type DebouncedSaver } from "../persistence/debounced-saver";
import * as repository from "../persistence/repository";

// Upper bound on the undo/redo depth. Snapshots are immutable graph references
// (no cloning), so the cost is one array slot per step — but we still cap it so
// a long session does not grow the stack without limit.
export const MAX_HISTORY = 100;

// Fallback name for a workspace created via «+» whose name is left empty.
export const DEFAULT_WORKSPACE_NAME = "Новое пространство";

// Default and bounds (px) for the resizable side panels. Widths persist per the
// editorPanelWidth/panelWidth meta keys; the bounds clamp user drags.
export const DEFAULT_PANEL_WIDTH = 240;
export const MIN_PANEL_WIDTH = 160;
export const MAX_PANEL_WIDTH = 480;
export const DEFAULT_EDITOR_WIDTH = 320;
export const MIN_EDITOR_WIDTH = 220;
export const MAX_EDITOR_WIDTH = 680;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

interface History {
  readonly past: readonly Graph[];
  readonly future: readonly Graph[];
}

/** Everything the store reads/writes through the persistence layer. */
export interface MindMapPersistence {
  loadGraph(workspaceId: string): Promise<Graph | null>;
  saveGraph(workspaceId: string, graph: Graph): Promise<void>;
  loadWorkspaces(): Promise<readonly Workspace[]>;
  saveWorkspace(workspace: Workspace): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  loadActiveWorkspaceId(): Promise<string | null>;
  saveActiveWorkspaceId(workspaceId: string | null): Promise<void>;
  loadPanelCollapsed(): Promise<boolean>;
  savePanelCollapsed(collapsed: boolean): Promise<void>;
  loadEditorCollapsed(): Promise<boolean>;
  saveEditorCollapsed(collapsed: boolean): Promise<void>;
  loadPanelWidth(): Promise<number | null>;
  savePanelWidth(width: number): Promise<void>;
  loadEditorWidth(): Promise<number | null>;
  saveEditorWidth(width: number): Promise<void>;
  loadAllRoots(): Promise<Map<string, readonly PanelRoot[]>>;
  loadCollapsedRoots(): Promise<readonly string[]>;
  saveCollapsedRoots(ids: readonly string[]): Promise<void>;
  // Per-workspace set of collapsed node ids (view state, outside the graph/undo).
  loadCollapsedNodes(workspaceId: string): Promise<readonly NodeId[]>;
  saveCollapsedNodes(workspaceId: string, ids: readonly NodeId[]): Promise<void>;
}

export interface MindMapState {
  readonly graph: Graph;
  readonly selectedNodeId: NodeId | null;
  readonly editingNodeId: NodeId | null;
  // Node currently highlighted as a re-parent drop target while another node is
  // dragged over it. Transient UI state — not part of the undo history.
  readonly dropTargetId: NodeId | null;
  // Undo/redo stacks of past/future graph snapshots for the ACTIVE workspace.
  // Inactive workspaces' histories live in a closure Map (see `histories`).
  readonly past: readonly Graph[];
  readonly future: readonly Graph[];
  // Focus history — a single timeline of visited (workspace, node) points across
  // ALL workspaces, orthogonal to undo/redo (which only revert graph changes).
  // Session-only, not persisted. `navCursor` is -1 when the history is empty.
  readonly navHistory: readonly NavEntry[];
  readonly navCursor: number;
  // Workspace registry. The visible graph/history always belongs to the active one.
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  // Workspace whose name is being edited inline in the panel (create or rename).
  readonly editingWorkspaceId: string | null;
  readonly panelCollapsed: boolean;
  // Collapsed state of the right-hand editor panel (default false = expanded).
  readonly editorCollapsed: boolean;
  // User-adjusted widths (px) of the left and right panels.
  readonly panelWidth: number;
  readonly editorWidth: number;
  // Cached roots of INACTIVE workspaces for the panel's second level. The active
  // workspace's roots are derived live from `graph` (see WorkspacePanel) and are
  // not read from here.
  readonly rootsByWorkspace: ReadonlyMap<string, readonly PanelRoot[]>;
  // Ids of workspaces whose root list is collapsed in the panel (absent = expanded).
  readonly collapsedWorkspaceRoots: ReadonlySet<string>;
  // Ids of collapsed nodes in the ACTIVE workspace (view state: outside the graph,
  // outside undo/redo, persisted per-workspace). Inactive workspaces' sets live in
  // `meta` until entered.
  readonly collapsedNodeIds: ReadonlySet<NodeId>;
  // Last "reveal this node" request from the panel. `seq` is a monotone counter so a
  // repeated click on the same node still re-triggers the canvas's centering effect.
  readonly reveal: { readonly nodeId: NodeId; readonly seq: number } | null;
  loadWorkspaces(): Promise<void>;
  createWorkspace(): Promise<void>;
  commitWorkspaceName(id: string, name: string): Promise<void>;
  cancelWorkspaceName(id: string): Promise<void>;
  startWorkspaceRename(id: string): void;
  deleteWorkspace(id: string): Promise<void>;
  selectWorkspace(id: string): Promise<void>;
  togglePanel(): Promise<void>;
  toggleEditor(): Promise<void>;
  // Resize a side panel. `commit` persists the (clamped) width; pass false during a
  // live drag and true once on release.
  setPanelWidth(width: number, commit: boolean): void;
  setEditorWidth(width: number, commit: boolean): void;
  toggleWorkspaceRoots(id: string): Promise<void>;
  toggleCollapse(nodeId: NodeId): void;
  revealNode(nodeId: NodeId): void;
  focusRoot(workspaceId: string, nodeId: NodeId): Promise<void>;
  flush(): Promise<void>;
  addRoot(input: { readonly position: Position; readonly text?: string }): NodeId;
  addChild(input: {
    readonly parentId: NodeId;
    readonly position: Position;
    readonly text?: string;
  }): NodeId;
  addChildOf(nodeId: NodeId): void;
  removeSubtree(nodeId: NodeId): void;
  copyNode(nodeId: NodeId): void;
  cutNode(nodeId: NodeId): void;
  pasteInto(parentId: NodeId): void;
  updateText(nodeId: NodeId, text: string): void;
  updateBody(nodeId: NodeId, body: string): void;
  setNodeStyle(nodeId: NodeId, patch: NodeNameStyle): void;
  moveNode(nodeId: NodeId, position: Position): void;
  dropNode(nodeId: NodeId, position: Position): void;
  reparent(nodeId: NodeId, newParentId: NodeId): void;
  setDropTarget(nodeId: NodeId | null): void;
  selectNode(nodeId: NodeId | null): void;
  startEditing(nodeId: NodeId): void;
  stopEditing(): void;
  undo(): void;
  redo(): void;
  goBack(): Promise<void>;
  goForward(): Promise<void>;
}

export type MindMapStore = StoreApi<MindMapState>;

interface CreateMindMapStoreOptions {
  readonly persistence?: MindMapPersistence;
  readonly createSaver?: (save: (graph: Graph) => Promise<void>) => DebouncedSaver;
}

const keepSelection = (graph: Graph, id: NodeId | null): NodeId | null =>
  id !== null && graph.nodes.some((node) => node.id === id) ? id : null;

/** The graph's root nodes as lightweight panel entries, in graph order. */
const rootsFromGraph = (graph: Graph): readonly PanelRoot[] =>
  graph.nodes
    .filter((node) => node.parentId === null)
    .map((node) => ({ id: node.id, text: node.text }));

const EMPTY_HISTORY: History = { past: [], future: [] };

export function createMindMapStore(options: CreateMindMapStoreOptions = {}): MindMapStore {
  const persistence: MindMapPersistence = options.persistence ?? repository;
  const createSaver = options.createSaver ?? createDebouncedSaver;

  // Transient bookkeeping kept out of zustand state: changing it must not trigger
  // re-renders, and it never needs to be read by the UI.
  // - coalesceKey groups a burst of same-kind mutations (a typing session, a
  //   single drag) into one undo step.
  // - pendingBaseline/pendingNodeId model a fresh node as a transaction: its
  //   creation + naming collapses into one undo step, and abandoning it empty
  //   leaves no trace in history at all.
  let coalesceKey: string | null = null;
  let pendingBaseline: Graph | null = null;
  let pendingNodeId: NodeId | null = null;
  // In-app clipboard for cut/copy/paste of whole subtrees (session-only).
  let clipboard: graphOps.Subtree | null = null;
  // True while a goBack/goForward transition is in flight. Kept out of zustand
  // (must not re-render): it mutes focus-history recording during the programmatic
  // selectNode of the transition, and makes a second arrow-press a no-op until the
  // first finishes (the cross-workspace graph load is async).
  let navigating = false;
  // Undo/redo histories of inactive workspaces, by id (session-only, not persisted).
  const histories = new Map<string, History>();

  // Assigned right after the store is created (the save closure needs the store
  // to read the live active workspace id). Action bodies run later, so the
  // forward reference is safe.
  let saver: DebouncedSaver;

  const store = createStore<MindMapState>((set, get) => {
    function historyAfterPush(prev: Graph): Pick<MindMapState, "past" | "future"> {
      const past = [...get().past, prev];
      // Drop the oldest entries past the cap; a new branch invalidates redo.
      return {
        past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past,
        future: [],
      };
    }

    /** Apply a graph mutation, recording history unless it coalesces with the previous step. */
    function commit(next: Graph, actionKey: string): void {
      const prev = get().graph;
      if (actionKey === coalesceKey) {
        set({ graph: next });
      } else {
        set({ graph: next, ...historyAfterPush(prev) });
      }
      coalesceKey = actionKey;
    }

    function clearTransient(): void {
      coalesceKey = null;
      pendingBaseline = null;
      pendingNodeId = null;
    }

    // Layout that honours the active workspace's collapsed set, so every mutation
    // re-flows the visible tree as if collapsed nodes were leaves. Used in place of
    // the bare layout() everywhere in the store (design Решение 3).
    function relayout(graph: Graph): Graph {
      return layout(graph, get().collapsedNodeIds);
    }

    /** Persist the collapsed set for the active workspace; a no-op with none active. */
    function persistCollapsed(ids: ReadonlySet<NodeId>): void {
      const workspaceId = get().activeWorkspaceId;
      if (workspaceId !== null) {
        void persistence.saveCollapsedNodes(workspaceId, [...ids]);
      }
    }

    /**
     * Expand every collapsed ancestor of `nodeId` so it becomes visible (used by
     * reveal). Re-flows and persists only when something actually changed.
     */
    function expandAncestors(nodeId: NodeId): void {
      const state = get();
      const byId = new Map(state.graph.nodes.map((node) => [node.id, node]));
      const next = new Set(state.collapsedNodeIds);
      let changed = false;
      let current = byId.get(nodeId)?.parentId ?? null;
      while (current !== null) {
        if (next.delete(current)) {
          changed = true;
        }
        current = byId.get(current)?.parentId ?? null;
      }
      if (changed) {
        set({ collapsedNodeIds: next, graph: layout(state.graph, next) });
        persistCollapsed(next);
      }
    }

    /**
     * Flush the pending graph write and stash the active workspace's history before
     * the active workspace changes. Flushing matters because the debounced save
     * resolves the target workspace id at write time — a leftover pending write
     * would otherwise land under the new active id.
     */
    async function leaveActiveWorkspace(): Promise<void> {
      await saver.flush();
      const current = get().activeWorkspaceId;
      if (current !== null) {
        histories.set(current, { past: get().past, future: get().future });
        // Cache the leaving workspace's roots: once it is inactive the panel reads
        // them from here instead of the (now-replaced) live graph.
        set({
          rootsByWorkspace: new Map(get().rootsByWorkspace).set(
            current,
            rootsFromGraph(get().graph),
          ),
        });
      }
    }

    /** Make `workspace` the active one, loading its graph and restoring its history. */
    async function enterWorkspace(workspaceId: string): Promise<void> {
      const loaded = await persistence.loadGraph(workspaceId);
      const collapsed = await persistence.loadCollapsedNodes(workspaceId);
      const restored = histories.get(workspaceId) ?? EMPTY_HISTORY;
      clearTransient();
      set({
        graph: loaded ?? graphOps.createEmpty(),
        activeWorkspaceId: workspaceId,
        collapsedNodeIds: new Set(collapsed),
        past: restored.past,
        future: restored.future,
        selectedNodeId: null,
        editingNodeId: null,
        editingWorkspaceId: null,
      });
      await persistence.saveActiveWorkspaceId(workspaceId);
    }

    /**
     * Side-hint position for a new child of `parentId`: a root branches right by
     * default, a non-root continues its inherited side. Only the x sign matters —
     * the layout pass snaps the child to its real slot. Returns null if unknown.
     */
    function childHintPosition(graph: Graph, parentId: NodeId): Position | null {
      const node = graph.nodes.find((n) => n.id === parentId);
      if (node === undefined) {
        return null;
      }
      const dx = node.parentId === null ? 1 : sideOf(graph, parentId) === "left" ? -1 : 1;
      // y below the parent's existing children so the layout appends it last.
      return { x: node.position.x + dx * LAYOUT_HSTEP, y: appendChildY(graph, parentId) };
    }

    /**
     * Focus the entry: switch workspace (loading its graph) if needed, then select
     * the node. Returns false for a broken entry — its workspace was deleted or its
     * node no longer exists — so the caller can step over it in the same direction.
     */
    async function focusNavEntry(entry: NavEntry): Promise<boolean> {
      if (!get().workspaces.some((w) => w.id === entry.workspaceId)) {
        return false;
      }
      if (entry.workspaceId !== get().activeWorkspaceId) {
        // selectWorkspace flushes the current graph and loads the target's; the
        // node-existence check below runs against the freshly loaded graph.
        await get().selectWorkspace(entry.workspaceId);
      }
      if (!get().graph.nodes.some((n) => n.id === entry.nodeId)) {
        return false;
      }
      get().selectNode(entry.nodeId);
      return true;
    }

    /** Shared body of goBack/goForward. See design §3–§5 for the cursor rules. */
    async function navigateHistory(direction: "back" | "forward"): Promise<void> {
      // A second press before the first transition's async graph load finishes is
      // dropped — without this guard it would read a stale cursor and double-step.
      if (navigating) {
        return;
      }
      const { navHistory: history, navCursor: cursor, activeWorkspaceId, selectedNodeId } = get();
      const cursorEntry = history[cursor];
      // When the visible (workspace, node) no longer equals the cursor entry — a
      // workspace switch or a deselect happened — the first step snaps back onto
      // the cursor instead of skipping past it (design §4).
      const matchesCursor =
        cursorEntry !== undefined &&
        cursorEntry.workspaceId === activeWorkspaceId &&
        cursorEntry.nodeId === selectedNodeId;
      const state = { history, cursor };
      const target =
        direction === "back"
          ? navHistory.back(state, matchesCursor)
          : navHistory.forward(state, matchesCursor);
      // Candidate (index, entry) pairs to try, ordered from `target` onward in the
      // travel direction. Broken entries are skipped; the first focusable one wins.
      // An out-of-range target (boundary) yields an empty list — a safe no-op.
      const indexed = [...history.entries()];
      const candidates =
        direction === "back" ? indexed.slice(0, target + 1).reverse() : indexed.slice(target);
      navigating = true;
      try {
        for (const [index, entry] of candidates) {
          if (await focusNavEntry(entry)) {
            set({ navCursor: index });
            return;
          }
        }
      } finally {
        navigating = false;
      }
    }

    return {
      graph: graphOps.createEmpty(),
      selectedNodeId: null,
      editingNodeId: null,
      dropTargetId: null,
      past: [],
      future: [],
      navHistory: [],
      navCursor: -1,
      workspaces: [],
      activeWorkspaceId: null,
      editingWorkspaceId: null,
      panelCollapsed: false,
      editorCollapsed: false,
      panelWidth: DEFAULT_PANEL_WIDTH,
      editorWidth: DEFAULT_EDITOR_WIDTH,
      rootsByWorkspace: new Map(),
      collapsedWorkspaceRoots: new Set(),
      collapsedNodeIds: new Set(),
      reveal: null,

      async loadWorkspaces() {
        const [
          workspaces,
          storedActiveId,
          panelCollapsed,
          editorCollapsed,
          storedPanelWidth,
          storedEditorWidth,
          rootsByWorkspace,
          collapsedRoots,
        ] = await Promise.all([
          persistence.loadWorkspaces(),
          persistence.loadActiveWorkspaceId(),
          persistence.loadPanelCollapsed(),
          persistence.loadEditorCollapsed(),
          persistence.loadPanelWidth(),
          persistence.loadEditorWidth(),
          persistence.loadAllRoots(),
          persistence.loadCollapsedRoots(),
        ]);
        // A stored active id that no longer exists (deleted) falls back to "none".
        const activeWorkspaceId =
          storedActiveId !== null && workspaces.some((w) => w.id === storedActiveId)
            ? storedActiveId
            : null;
        const graph =
          activeWorkspaceId !== null
            ? ((await persistence.loadGraph(activeWorkspaceId)) ?? graphOps.createEmpty())
            : graphOps.createEmpty();
        const collapsedNodes =
          activeWorkspaceId !== null ? await persistence.loadCollapsedNodes(activeWorkspaceId) : [];
        clearTransient();
        histories.clear();
        set({
          workspaces,
          activeWorkspaceId,
          panelCollapsed,
          editorCollapsed,
          panelWidth: storedPanelWidth ?? DEFAULT_PANEL_WIDTH,
          editorWidth: storedEditorWidth ?? DEFAULT_EDITOR_WIDTH,
          rootsByWorkspace,
          collapsedWorkspaceRoots: new Set(collapsedRoots),
          collapsedNodeIds: new Set(collapsedNodes),
          reveal: null,
          graph,
          past: [],
          future: [],
          navHistory: [],
          navCursor: -1,
          selectedNodeId: null,
          editingNodeId: null,
          editingWorkspaceId: null,
        });
      },

      async createWorkspace() {
        await leaveActiveWorkspace();
        const workspace: Workspace = {
          id: crypto.randomUUID(),
          name: "",
          createdAt: Date.now(),
        };
        clearTransient();
        set({
          workspaces: workspaceOps.createWorkspace(get().workspaces, workspace),
          activeWorkspaceId: workspace.id,
          editingWorkspaceId: workspace.id,
          graph: graphOps.createEmpty(),
          collapsedNodeIds: new Set(),
          past: [],
          future: [],
          selectedNodeId: null,
          editingNodeId: null,
        });
        await persistence.saveWorkspace(workspace);
        await persistence.saveActiveWorkspaceId(workspace.id);
      },

      async commitWorkspaceName(id, name) {
        const workspace = get().workspaces.find((w) => w.id === id);
        if (workspace === undefined) {
          set({ editingWorkspaceId: null });
          return;
        }
        // A freshly created workspace still carries an empty name; renaming an
        // existing one to empty is rejected, but a fresh one defaults instead.
        const isFresh = workspace.name === "";
        const finalName = name.trim() === "" ? (isFresh ? DEFAULT_WORKSPACE_NAME : null) : name;
        if (finalName === null) {
          set({ editingWorkspaceId: null });
          return;
        }
        const updated: Workspace = { ...workspace, name: finalName };
        set({
          workspaces: workspaceOps.renameWorkspace(get().workspaces, id, finalName),
          editingWorkspaceId: null,
        });
        await persistence.saveWorkspace(updated);
      },

      async cancelWorkspaceName(id) {
        const workspace = get().workspaces.find((w) => w.id === id);
        // Leaving a fresh (still nameless) workspace must not strand it without a
        // name — fall back to the default; an existing one just keeps its name.
        if (workspace !== undefined && workspace.name === "") {
          const updated: Workspace = { ...workspace, name: DEFAULT_WORKSPACE_NAME };
          set({
            workspaces: workspaceOps.renameWorkspace(get().workspaces, id, DEFAULT_WORKSPACE_NAME),
            editingWorkspaceId: null,
          });
          await persistence.saveWorkspace(updated);
          return;
        }
        set({ editingWorkspaceId: null });
      },

      startWorkspaceRename(id) {
        set({ editingWorkspaceId: id });
      },

      async deleteWorkspace(id) {
        // Flush first: a leftover pending write would otherwise resurrect the
        // graph we are about to delete (or land under the next active id).
        await saver.flush();
        const wasActive = get().activeWorkspaceId === id;
        const neighbor = wasActive ? workspaceOps.neighborOf(get().workspaces, id) : null;
        histories.delete(id);
        // Purge the deleted workspace's focus points so navigation never lands on
        // a vanished workspace; the cursor is moved onto a surviving entry.
        const pruned = navHistory.pruneWorkspace(
          { history: get().navHistory, cursor: get().navCursor },
          id,
        );
        const nextRoots = new Map(get().rootsByWorkspace);
        nextRoots.delete(id);
        const nextCollapsed = new Set(get().collapsedWorkspaceRoots);
        const wasCollapsed = nextCollapsed.delete(id);
        set({
          workspaces: workspaceOps.removeWorkspace(get().workspaces, id),
          editingWorkspaceId: get().editingWorkspaceId === id ? null : get().editingWorkspaceId,
          navHistory: pruned.history,
          navCursor: pruned.cursor,
          rootsByWorkspace: nextRoots,
          collapsedWorkspaceRoots: nextCollapsed,
        });
        await persistence.deleteWorkspace(id);
        // Drop the collapsed flag from storage too, so a recreated id is not stale.
        if (wasCollapsed) {
          await persistence.saveCollapsedRoots([...nextCollapsed]);
        }
        if (!wasActive) {
          return;
        }
        if (neighbor !== null) {
          await enterWorkspace(neighbor.id);
          return;
        }
        // Deleted the last (or only) workspace — drop into the empty state.
        clearTransient();
        set({
          graph: graphOps.createEmpty(),
          activeWorkspaceId: null,
          collapsedNodeIds: new Set(),
          past: [],
          future: [],
          selectedNodeId: null,
          editingNodeId: null,
        });
        await persistence.saveActiveWorkspaceId(null);
      },

      async selectWorkspace(id) {
        if (id === get().activeWorkspaceId) {
          return;
        }
        await leaveActiveWorkspace();
        await enterWorkspace(id);
      },

      async togglePanel() {
        const next = !get().panelCollapsed;
        set({ panelCollapsed: next });
        await persistence.savePanelCollapsed(next);
      },

      async toggleEditor() {
        const next = !get().editorCollapsed;
        set({ editorCollapsed: next });
        await persistence.saveEditorCollapsed(next);
      },

      setPanelWidth(width, commit) {
        const next = clamp(width, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
        set({ panelWidth: next });
        if (commit) {
          void persistence.savePanelWidth(next);
        }
      },

      setEditorWidth(width, commit) {
        const next = clamp(width, MIN_EDITOR_WIDTH, MAX_EDITOR_WIDTH);
        set({ editorWidth: next });
        if (commit) {
          void persistence.saveEditorWidth(next);
        }
      },

      async toggleWorkspaceRoots(id) {
        const next = new Set(get().collapsedWorkspaceRoots);
        if (!next.delete(id)) {
          next.add(id);
        }
        set({ collapsedWorkspaceRoots: next });
        await persistence.saveCollapsedRoots([...next]);
      },

      toggleCollapse(nodeId) {
        const state = get();
        // No-op for a node without children — there is nothing to hide.
        if (!state.graph.nodes.some((node) => node.parentId === nodeId)) {
          return;
        }
        const next = new Set(state.collapsedNodeIds);
        const collapsing = !next.delete(nodeId);
        if (collapsing) {
          next.add(nodeId);
        }
        // Collapsing a node that hides the current selection moves the selection up
        // to the (still visible) collapsed node, so nothing stays selected off-screen.
        let selectedNodeId = state.selectedNodeId;
        if (collapsing && selectedNodeId !== null) {
          const hidden = graphOps.subtreeIds(state.graph, nodeId);
          hidden.delete(nodeId);
          if (hidden.has(selectedNodeId)) {
            selectedNodeId = nodeId;
          }
        }
        // Re-flow with the new set but outside undo: only positions change, and the
        // graph-reference change still triggers the debounced graph autosave.
        set({ collapsedNodeIds: next, graph: layout(state.graph, next), selectedNodeId });
        persistCollapsed(next);
      },

      revealNode(nodeId) {
        // Expand any collapsed ancestor first so the reveal target is actually visible.
        expandAncestors(nodeId);
        const seq = (get().reveal?.seq ?? 0) + 1;
        set({ reveal: { nodeId, seq } });
      },

      async focusRoot(workspaceId, nodeId) {
        // Switch to the root's workspace first (loads its graph) so the subsequent
        // select + reveal act on the graph that actually contains the node.
        if (workspaceId !== get().activeWorkspaceId) {
          await get().selectWorkspace(workspaceId);
        }
        get().selectNode(nodeId);
        get().revealNode(nodeId);
      },

      async flush() {
        await saver.flush();
      },

      addRoot(input) {
        // Roots belong to a workspace; with none active, creation is disabled.
        if (get().activeWorkspaceId === null) {
          return "";
        }
        const prev = get().graph;
        const result = graphOps.addRoot(prev, input);
        // Defer history: the fresh node is a pending transaction committed on
        // stopEditing (named) or discarded on removeSubtree (left empty).
        pendingBaseline = prev;
        pendingNodeId = result.nodeId;
        coalesceKey = null;
        set({
          graph: relayout(result.graph),
          selectedNodeId: result.nodeId,
          editingNodeId: result.nodeId,
        });
        return result.nodeId;
      },

      addChild(input) {
        if (get().activeWorkspaceId === null) {
          return "";
        }
        const prev = get().graph;
        const result = graphOps.addChild(prev, input);
        pendingBaseline = prev;
        pendingNodeId = result.nodeId;
        coalesceKey = null;
        set({
          graph: relayout(result.graph),
          selectedNodeId: result.nodeId,
          editingNodeId: result.nodeId,
        });
        return result.nodeId;
      },

      addChildOf(nodeId) {
        // Create a child of `nodeId` on the correct side and start editing it.
        const position = childHintPosition(get().graph, nodeId);
        if (position === null) {
          return;
        }
        // Auto-expand a collapsed parent first: a child added under a still-collapsed
        // node would be hidden the moment it is created.
        if (get().collapsedNodeIds.has(nodeId)) {
          const next = new Set(get().collapsedNodeIds);
          next.delete(nodeId);
          set({ collapsedNodeIds: next });
          persistCollapsed(next);
        }
        get().addChild({ parentId: nodeId, position });
      },

      removeSubtree(nodeId) {
        const state = get();
        if (nodeId === pendingNodeId && pendingBaseline !== null) {
          // Abandoning a freshly created node: revert to the pre-create graph and
          // leave no history entry — from the user's view nothing ever happened.
          const baseline = pendingBaseline;
          clearTransient();
          set({ graph: baseline, selectedNodeId: null, editingNodeId: null });
          return;
        }
        const prev = state.graph;
        const next = relayout(graphOps.removeSubtree(prev, { nodeId }));
        coalesceKey = null;
        // Drop any removed id from the collapsed set so it does not linger as garbage.
        const removed = graphOps.subtreeIds(prev, nodeId);
        let collapsedNodeIds = state.collapsedNodeIds;
        if ([...removed].some((id) => collapsedNodeIds.has(id))) {
          const pruned = new Set(collapsedNodeIds);
          for (const id of removed) {
            pruned.delete(id);
          }
          collapsedNodeIds = pruned;
          persistCollapsed(pruned);
        }
        set({
          graph: next,
          collapsedNodeIds,
          selectedNodeId: keepSelection(next, state.selectedNodeId),
          editingNodeId: keepSelection(next, state.editingNodeId),
          ...historyAfterPush(prev),
        });
      },

      copyNode(nodeId) {
        // Snapshot the subtree into the in-app clipboard; no graph/history change.
        const clip = graphOps.extractSubtree(get().graph, nodeId);
        if (clip !== null) {
          clipboard = clip;
        }
      },

      cutNode(nodeId) {
        const clip = graphOps.extractSubtree(get().graph, nodeId);
        if (clip === null) {
          return;
        }
        clipboard = clip;
        // Removal is the undoable step (history + layout + selection prune).
        get().removeSubtree(nodeId);
      },

      pasteInto(parentId) {
        if (clipboard === null) {
          return;
        }
        const prev = get().graph;
        const position = childHintPosition(prev, parentId);
        if (position === null) {
          return;
        }
        const result = graphOps.pasteSubtree(prev, clipboard, parentId, position);
        clearTransient();
        set({
          graph: relayout(result.graph),
          selectedNodeId: result.rootId,
          editingNodeId: null,
          ...historyAfterPush(prev),
        });
      },

      updateText(nodeId, text) {
        // Layout depends on each node's text-derived width, so a text change
        // must re-flow descendants to keep them from colliding with the grown node.
        const next = relayout(graphOps.updateText(get().graph, { nodeId, text }));
        if (nodeId === pendingNodeId) {
          // Part of the pending create transaction — no separate history entry.
          set({ graph: next });
          return;
        }
        commit(next, `text:${nodeId}`);
      },

      updateBody(nodeId, body) {
        // No layout: the body never renders on the canvas, so the tree does not
        // re-flow. Coalesce a typing burst on one node into a single undo step,
        // separate from name edits (`text:`) and moves (`move:`).
        commit(graphOps.updateBody(get().graph, { nodeId, body }), `body:${nodeId}`);
      },

      setNodeStyle(nodeId, patch) {
        // The name font size changes the node's width, so re-flow the tree (same
        // layout branch as updateText) to keep neighbours from overlapping.
        const next = relayout(graphOps.updateNodeStyle(get().graph, { nodeId, style: patch }));
        if (nodeId === pendingNodeId) {
          // Styling a still-pending fresh node is part of its create transaction —
          // no separate history entry (mirrors updateText).
          set({ graph: next });
          return;
        }
        commit(next, `style:${nodeId}`);
        // Each style change is its own undo step: clicks are discrete and rare, so
        // close the coalescing window (a following click must not merge into this).
        coalesceKey = null;
      },

      moveNode(nodeId, position) {
        const current = get().graph.nodes.find((node) => node.id === nodeId);
        if (
          current !== undefined &&
          current.position.x === position.x &&
          current.position.y === position.y
        ) {
          // React Flow emits no-op position changes (e.g. on select); ignore them
          // so they never land in the undo history.
          return;
        }
        commit(graphOps.moveNode(get().graph, { nodeId, position }), `move:${nodeId}`);
      },

      dropNode(nodeId, position) {
        // End of a drag: set the final position, then re-flow the whole tree so
        // the branch aligns — dragging a child across its root re-sides the entire
        // subtree (the layout picks each direct child's side from its x). Coalesces
        // with the drag's in-flight moveNode ticks into one undo step; then the
        // coalescing window closes so the next drag is recorded separately.
        const moved = graphOps.moveNode(get().graph, { nodeId, position });
        commit(relayout(moved), `move:${nodeId}`);
        coalesceKey = null;
      },

      reparent(nodeId, newParentId) {
        // Re-attach a node under a new parent (drag-onto-node). Coalesces with the
        // drag's in-flight moves so the whole gesture is a single undo step.
        const prev = get().graph;
        const position = childHintPosition(prev, newParentId);
        if (position === null) {
          return;
        }
        const reparented = graphOps.reparentSubtree(prev, { nodeId, newParentId, position });
        if (reparented === prev) {
          // Invalid (self / descendant / already-child / unknown) — no-op, no history.
          return;
        }
        commit(relayout(reparented), `move:${nodeId}`);
        set({ selectedNodeId: nodeId, editingNodeId: null });
        clearTransient();
      },

      setDropTarget(nodeId) {
        if (get().dropTargetId !== nodeId) {
          set({ dropTargetId: nodeId });
        }
      },

      selectNode(nodeId) {
        coalesceKey = null;
        const workspaceId = get().activeWorkspaceId;
        // Record a focus point only for a real selection (not a deselect) made by
        // the user — `navigating` mutes the programmatic select of a back/forward
        // transition so it does not loop the history back onto itself.
        if (nodeId !== null && !navigating && workspaceId !== null) {
          const next = navHistory.record(
            { history: get().navHistory, cursor: get().navCursor },
            { workspaceId, nodeId },
          );
          set({ selectedNodeId: nodeId, navHistory: next.history, navCursor: next.cursor });
          return;
        }
        set({ selectedNodeId: nodeId });
      },

      startEditing(nodeId) {
        // Editing an existing node is coalesced (not a pending creation).
        clearTransient();
        set({ editingNodeId: nodeId, selectedNodeId: nodeId });
      },

      stopEditing() {
        if (pendingNodeId !== null && pendingBaseline !== null) {
          // Commit the create transaction as a single undo step (pre-create graph).
          const baseline = pendingBaseline;
          clearTransient();
          set({ editingNodeId: null, ...historyAfterPush(baseline) });
          return;
        }
        coalesceKey = null;
        set({ editingNodeId: null });
      },

      undo() {
        const { past, future, graph } = get();
        const previous = past.at(-1);
        if (previous === undefined) {
          return;
        }
        clearTransient();
        set({
          graph: previous,
          past: past.slice(0, -1),
          future: [graph, ...future],
          editingNodeId: null,
          selectedNodeId: keepSelection(previous, get().selectedNodeId),
        });
      },

      redo() {
        const { past, future, graph } = get();
        const next = future.at(0);
        if (next === undefined) {
          return;
        }
        clearTransient();
        set({
          graph: next,
          past: [...past, graph],
          future: future.slice(1),
          editingNodeId: null,
          selectedNodeId: keepSelection(next, get().selectedNodeId),
        });
      },

      async goBack() {
        await navigateHistory("back");
      },

      async goForward() {
        await navigateHistory("forward");
      },
    };
  });

  // The save closure resolves the target workspace at write time. Combined with
  // the flush-before-switch in leaveActiveWorkspace/deleteWorkspace, the graph
  // always lands under the workspace that owned it.
  saver = createSaver((graph) => {
    const id = store.getState().activeWorkspaceId;
    return id === null ? Promise.resolve() : persistence.saveGraph(id, graph);
  });

  // Autosave: schedule a debounced write whenever the graph reference changes.
  // The subscription lives for the store's lifetime — the singleton persists for
  // the page, and test-created stores use a no-op saver, so there is nothing to
  // tear down.
  let previousGraph = store.getState().graph;
  store.subscribe((state) => {
    if (state.graph !== previousGraph) {
      previousGraph = state.graph;
      saver.schedule(state.graph);
    }
  });

  return store;
}

export const mindMapStore = createMindMapStore();

export function useMindMapStore<T>(selector: (state: MindMapState) => T): T {
  return useStore(mindMapStore, selector);
}
