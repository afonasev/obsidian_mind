import { createStore, type StoreApi, useStore } from "zustand";
import * as graphOps from "../domain/graph";
import { LAYOUT_HSTEP, layout, sideOf } from "../domain/layout";
import type { Graph, NodeId, Position } from "../domain/types";
import type { DebouncedSaver } from "../persistence/debounced-saver";
import { loadGraph } from "../persistence/repository";

// Upper bound on the undo/redo depth. Snapshots are immutable graph references
// (no cloning), so the cost is one array slot per step — but we still cap it so
// a long session does not grow the stack without limit.
export const MAX_HISTORY = 100;

export interface MindMapState {
  readonly graph: Graph;
  readonly selectedNodeId: NodeId | null;
  readonly editingNodeId: NodeId | null;
  // Node currently highlighted as a re-parent drop target while another node is
  // dragged over it. Transient UI state — not part of the undo history.
  readonly dropTargetId: NodeId | null;
  // Undo/redo stacks of past/future graph snapshots. Kept in state (not closure)
  // so a future toolbar can derive `canUndo`/`canRedo`, and tests can assert them.
  readonly past: readonly Graph[];
  readonly future: readonly Graph[];
  loadFromStorage(): Promise<void>;
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
  readonly load?: () => Promise<Graph | null>;
}

const keepSelection = (graph: Graph, id: NodeId | null): NodeId | null =>
  id !== null && graph.nodes.some((node) => node.id === id) ? id : null;

export function createMindMapStore(options: CreateMindMapStoreOptions = {}): MindMapStore {
  const load = options.load ?? loadGraph;

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

  return createStore<MindMapState>((set, get) => {
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
      return { x: node.position.x + dx * LAYOUT_HSTEP, y: node.position.y };
    }

    return {
      graph: graphOps.createEmpty(),
      selectedNodeId: null,
      editingNodeId: null,
      dropTargetId: null,
      past: [],
      future: [],

      async loadFromStorage() {
        const loaded = await load();
        if (loaded === null) {
          return;
        }
        set({ graph: loaded });
      },

      addRoot(input) {
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
}

/**
 * Wires graph mutations to a debounced saver. Returns an unbind function.
 */
export function bindSaver(store: MindMapStore, saver: DebouncedSaver): () => void {
  let previousGraph = store.getState().graph;
  return store.subscribe((state) => {
    if (state.graph !== previousGraph) {
      previousGraph = state.graph;
      saver.schedule(state.graph);
    }
  });
}

export const mindMapStore = createMindMapStore();

export function useMindMapStore<T>(selector: (state: MindMapState) => T): T {
  return useStore(mindMapStore, selector);
}
