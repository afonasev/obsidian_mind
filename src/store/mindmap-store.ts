import { createStore, type StoreApi, useStore } from "zustand";
import * as graphOps from "../domain/graph";
import { appendChildY, LAYOUT_HSTEP, layout, sideOf } from "../domain/layout";
import type { Graph, NodeId, Position } from "../domain/types";
import type { Workspace } from "../domain/workspaces";
import * as workspaceOps from "../domain/workspaces";
import { createDebouncedSaver, type DebouncedSaver } from "../persistence/debounced-saver";
import * as repository from "../persistence/repository";

// Upper bound on the undo/redo depth. Snapshots are immutable graph references
// (no cloning), so the cost is one array slot per step — but we still cap it so
// a long session does not grow the stack without limit.
export const MAX_HISTORY = 100;

// Fallback name for a workspace created via «+» whose name is left empty.
export const DEFAULT_WORKSPACE_NAME = "Новое пространство";

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
  // Workspace registry. The visible graph/history always belongs to the active one.
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string | null;
  // Workspace whose name is being edited inline in the panel (create or rename).
  readonly editingWorkspaceId: string | null;
  readonly panelCollapsed: boolean;
  loadWorkspaces(): Promise<void>;
  createWorkspace(): Promise<void>;
  commitWorkspaceName(id: string, name: string): Promise<void>;
  cancelWorkspaceName(id: string): Promise<void>;
  startWorkspaceRename(id: string): void;
  deleteWorkspace(id: string): Promise<void>;
  selectWorkspace(id: string): Promise<void>;
  togglePanel(): Promise<void>;
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
  moveNode(nodeId: NodeId, position: Position): void;
  dropNode(nodeId: NodeId, position: Position): void;
  reparent(nodeId: NodeId, newParentId: NodeId): void;
  setDropTarget(nodeId: NodeId | null): void;
  selectNode(nodeId: NodeId | null): void;
  startEditing(nodeId: NodeId): void;
  stopEditing(): void;
  undo(): void;
  redo(): void;
}

export type MindMapStore = StoreApi<MindMapState>;

interface CreateMindMapStoreOptions {
  readonly persistence?: MindMapPersistence;
  readonly createSaver?: (save: (graph: Graph) => Promise<void>) => DebouncedSaver;
}

const keepSelection = (graph: Graph, id: NodeId | null): NodeId | null =>
  id !== null && graph.nodes.some((node) => node.id === id) ? id : null;

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
      }
    }

    /** Make `workspace` the active one, loading its graph and restoring its history. */
    async function enterWorkspace(workspaceId: string): Promise<void> {
      const loaded = await persistence.loadGraph(workspaceId);
      const restored = histories.get(workspaceId) ?? EMPTY_HISTORY;
      clearTransient();
      set({
        graph: loaded ?? graphOps.createEmpty(),
        activeWorkspaceId: workspaceId,
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

    return {
      graph: graphOps.createEmpty(),
      selectedNodeId: null,
      editingNodeId: null,
      dropTargetId: null,
      past: [],
      future: [],
      workspaces: [],
      activeWorkspaceId: null,
      editingWorkspaceId: null,
      panelCollapsed: false,

      async loadWorkspaces() {
        const [workspaces, storedActiveId, panelCollapsed] = await Promise.all([
          persistence.loadWorkspaces(),
          persistence.loadActiveWorkspaceId(),
          persistence.loadPanelCollapsed(),
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
        clearTransient();
        histories.clear();
        set({
          workspaces,
          activeWorkspaceId,
          panelCollapsed,
          graph,
          past: [],
          future: [],
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
        set({
          workspaces: workspaceOps.removeWorkspace(get().workspaces, id),
          editingWorkspaceId: get().editingWorkspaceId === id ? null : get().editingWorkspaceId,
        });
        await persistence.deleteWorkspace(id);
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
          graph: layout(result.graph),
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
          graph: layout(result.graph),
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
        const next = layout(graphOps.removeSubtree(prev, { nodeId }));
        coalesceKey = null;
        set({
          graph: next,
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
          graph: layout(result.graph),
          selectedNodeId: result.rootId,
          editingNodeId: null,
          ...historyAfterPush(prev),
        });
      },

      updateText(nodeId, text) {
        // Layout depends on each node's text-derived width, so a text change
        // must re-flow descendants to keep them from colliding with the grown node.
        const next = layout(graphOps.updateText(get().graph, { nodeId, text }));
        if (nodeId === pendingNodeId) {
          // Part of the pending create transaction — no separate history entry.
          set({ graph: next });
          return;
        }
        commit(next, `text:${nodeId}`);
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
        commit(layout(moved), `move:${nodeId}`);
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
        commit(layout(reparented), `move:${nodeId}`);
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
