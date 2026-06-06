import {
  ControlButton,
  Controls,
  type NodeChange,
  type NodeMouseHandler,
  type NodeTypes,
  type OnNodesChange,
  ReactFlow,
  ReactFlowProvider,
  type Edge as RFEdge,
  useReactFlow,
  type XYPosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type JSX, type MouseEvent, useCallback, useEffect, useMemo, useState } from "react";
import { subtreeIds } from "../../domain/graph";
import { estimateNodeHeight, estimateNodeWidth, isFarFromParent } from "../../domain/layout";
import { findNeighbor, type NavigationDirection } from "../../domain/navigation";
import type { Graph, MindEdge, MindNode, NodeId, Position } from "../../domain/types";
import { mindMapStore, useMindMapStore } from "../../store/mindmap-store";
import { useTheme } from "../../theme/useTheme";
import { CloudNode, type CloudNodeType } from "../CloudNode/CloudNode";
import { FocusNav } from "../FocusNav/FocusNav";
import { HotkeysHelp } from "../HotkeysHelp/HotkeysHelp";
import styles from "./Canvas.module.css";

const NODE_TYPES: NodeTypes = { cloud: CloudNode };

export function Canvas(): JSX.Element {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}

function CanvasInner(): JSX.Element {
  const graph = useMindMapStore((state) => state.graph);
  const editingNodeId = useMindMapStore((state) => state.editingNodeId);
  const selectedNodeId = useMindMapStore((state) => state.selectedNodeId);
  // No active workspace ⇒ there is nowhere to put roots; show a hint instead.
  const hasActiveWorkspace = useMindMapStore((state) => state.activeWorkspaceId !== null);
  const reveal = useMindMapStore((state) => state.reveal);
  const collapsedNodeIds = useMindMapStore((state) => state.collapsedNodeIds);
  const detachCandidateId = useMindMapStore((state) => state.detachCandidateId);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { theme, toggle } = useTheme();
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const handleHelpToggle = useCallback(() => setIsHelpOpen((open) => !open), []);
  const handleHelpClose = useCallback(() => setIsHelpOpen(false), []);

  // Ids hidden by collapse: every collapsed node's subtree minus the node itself
  // (the collapsed node stays visible; only its descendants hide).
  const hidden = useMemo(() => {
    const set = new Set<NodeId>();
    for (const id of collapsedNodeIds) {
      for (const descendant of subtreeIds(graph, id)) {
        if (descendant !== id) {
          set.add(descendant);
        }
      }
    }
    return set;
  }, [graph, collapsedNodeIds]);

  const nodes = useMemo(
    () => toRFNodes(graph, selectedNodeId, hidden),
    [graph, selectedNodeId, hidden],
  );
  const edges = useMemo(
    () => toRFEdges(graph, hidden, detachCandidateId),
    [graph, hidden, detachCandidateId],
  );

  const onNodesChange = useCallback<OnNodesChange<CloudNodeType>>(applyNodesChange, []);
  const onNodeClick = useCallback<NodeMouseHandler<CloudNodeType>>(handleNodeClick, []);
  const onNodeDoubleClick = useCallback<NodeMouseHandler<CloudNodeType>>(handleNodeDoubleClick, []);
  const onNodeDrag = useCallback<NodeMouseHandler<CloudNodeType>>(handleNodeDrag, []);
  const onNodeDragStop = useCallback<NodeMouseHandler<CloudNodeType>>(handleNodeDragStop, []);
  const onPaneClick = useCallback(handlePaneClick, []);

  const onPaneDoubleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      handlePaneDoubleClick(event, screenToFlowPosition);
    },
    [screenToFlowPosition],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleCanvasKeyDown);
    return () => {
      window.removeEventListener("keydown", handleCanvasKeyDown);
    };
  }, []);

  // Re-center the graph when the window is resized. React Flow keeps the viewport
  // transform on resize, so without this the content drifts toward a corner; a
  // fitView call recentres (and refits) it to the middle of the new viewport.
  useEffect(() => {
    function handleResize(): void {
      void fitView();
    }
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [fitView]);

  // Centre the viewport on a node when the panel requests a reveal. The effect
  // depends on the whole `reveal` object, not just its nodeId: `seq` increments on
  // every revealNode call, so re-revealing the same node still re-runs this.
  useEffect(() => {
    if (reveal === null) {
      return;
    }
    void fitView({ nodes: [{ id: reveal.nodeId }], maxZoom: 1, duration: 300 });
  }, [reveal, fitView]);

  return (
    <div className={styles.canvas} data-testid="canvas" data-editing={editingNodeId ?? ""}>
      <ReactFlow<CloudNodeType>
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        onDoubleClick={onPaneDoubleClick}
        fitView
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        colorMode={theme}
        deleteKeyCode={null}
        zoomOnDoubleClick={false}
        // Arrow keys drive our own selection navigation, not React Flow's built-in
        // node-moving; nodesFocusable=false stops React Flow from stealing DOM focus
        // from a freshly-created node's editor input (which would blur-commit and
        // delete the empty node before the user can type).
        disableKeyboardA11y
        nodesFocusable={false}
      >
        <Controls orientation="horizontal">
          <ControlButton onClick={toggle} title="Переключить тему" aria-label="Переключить тему">
            {theme === "dark" ? "☀️" : "🌙"}
          </ControlButton>
          <ControlButton
            onClick={handleHelpToggle}
            title="Горячие клавиши"
            aria-label="Горячие клавиши"
            aria-haspopup="dialog"
            aria-expanded={isHelpOpen}
          >
            ?
          </ControlButton>
        </Controls>
      </ReactFlow>
      <FocusNav />
      {hasActiveWorkspace ? null : (
        <div className={styles.emptyHint} role="note">
          Создайте пространство, чтобы начать работу
        </div>
      )}
      <HotkeysHelp isOpen={isHelpOpen} onClose={handleHelpClose} />
    </div>
  );
}

/**
 * Apply React Flow node changes back to the store. In-flight drag updates
 * (`dragging: true`) are persisted raw via moveNode so the node tracks the cursor
 * smoothly. The drop (`dragging: false`) goes through dropNode, which also re-flows
 * the tree (tidy-tree) so the branch aligns to its — possibly new — side.
 */
export function applyNodesChange(changes: readonly NodeChange<CloudNodeType>[]): void {
  for (const change of changes) {
    // Only in-flight drag positions (dragging:true) stream into the store for a
    // smooth follow; the drop is finalised by handleNodeDragStop (which also
    // re-parents onto a hovered node when there is one).
    if (change.type === "position" && change.position !== undefined && change.dragging) {
      mindMapStore.getState().moveNode(change.id, change.position);
    }
  }
}

/**
 * The node whose box contains the dragged node's centre, skipping the dragged
 * node and its own subtree (you cannot re-parent a node under itself). Sizes are
 * estimated the same way the layout estimates them. Returns null when the centre
 * is over empty canvas.
 */
export function findDropTarget(
  graph: Graph,
  draggedId: NodeId,
  draggedPosition: Position,
): NodeId | null {
  const dragged = graph.nodes.find((n) => n.id === draggedId);
  if (dragged === undefined) {
    return null;
  }
  // Hit-test against each node's real footprint — width AND height scale with the
  // name font, so a large node must use its estimated size, not a fixed row height,
  // or its drop area would shrink to a thin strip and reject drops.
  const draggedWidth = estimateNodeWidth(
    dragged.text,
    dragged.parentId === null,
    dragged.style?.fontScale,
  );
  const draggedHeight = estimateNodeHeight(
    dragged.text,
    dragged.parentId === null,
    dragged.style?.fontScale,
  );
  const cx = draggedPosition.x + draggedWidth / 2;
  const cy = draggedPosition.y + draggedHeight / 2;
  const blocked = subtreeIds(graph, draggedId);
  for (const node of graph.nodes) {
    if (blocked.has(node.id)) {
      continue;
    }
    const isRoot = node.parentId === null;
    const width = estimateNodeWidth(node.text, isRoot, node.style?.fontScale);
    const height = estimateNodeHeight(node.text, isRoot, node.style?.fontScale);
    if (
      cx >= node.position.x &&
      cx <= node.position.x + width &&
      cy >= node.position.y &&
      cy <= node.position.y + height
    ) {
      return node.id;
    }
  }
  return null;
}

/**
 * Whether dropping `nodeId` at `position` would detach it into a new root: it must
 * have a parent (roots cannot detach) and be dragged past the "far" threshold. The
 * dragged position overrides the node's stored one — the graph may not have caught
 * up to the in-flight drag yet.
 */
export function isDetachCandidate(graph: Graph, nodeId: NodeId, position: Position): boolean {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (node === undefined || node.parentId === null) {
    return false;
  }
  const parent = graph.nodes.find((n) => n.id === node.parentId);
  if (parent === undefined) {
    return false;
  }
  return isFarFromParent({ ...node, position }, parent);
}

export function handleNodeDrag(_event: unknown, node: CloudNodeType): void {
  const state = mindMapStore.getState();
  const graph = state.graph;
  const target = findDropTarget(graph, node.id, node.position);
  state.setDropTarget(target);
  // With no re-parent target, flag a detach candidate once the drag passes the
  // threshold so the parent edge can render as "tearing"; clear it otherwise.
  state.setDetachCandidate(
    target === null && isDetachCandidate(graph, node.id, node.position) ? node.id : null,
  );
}

export function handleNodeDragStop(_event: unknown, node: CloudNodeType): void {
  const state = mindMapStore.getState();
  const target = state.dropTargetId;
  if (target !== null) {
    state.reparent(node.id, target);
  } else if (isDetachCandidate(state.graph, node.id, node.position)) {
    // No target + non-root dragged far → detach into a new root.
    state.detach(node.id, node.position);
  } else {
    state.dropNode(node.id, node.position);
  }
  state.setDropTarget(null);
  state.setDetachCandidate(null);
}

export function handleNodeClick(_event: unknown, node: CloudNodeType): void {
  mindMapStore.getState().selectNode(node.id);
}

export function handleNodeDoubleClick(
  event: { stopPropagation(): void },
  node: CloudNodeType,
): void {
  // React Flow re-emits the DOM dblclick on the node — stop it so the wrapper's
  // pane-double-click handler does not also fire and create a root.
  event.stopPropagation();
  mindMapStore.getState().startEditing(node.id);
}

export function handlePaneClick(): void {
  // Clicking empty space keeps the current selection — it only changes when a node
  // is created or another node is clicked. Editing still ends (commits) on a pane click.
  if (mindMapStore.getState().editingNodeId !== null) {
    mindMapStore.getState().stopEditing();
  }
}

export function handlePaneDoubleClick(
  event: MouseEvent<HTMLDivElement>,
  screenToFlowPosition: (point: { x: number; y: number }) => XYPosition,
): void {
  const target = event.target as HTMLElement;
  // Only react when the user double-clicked on the empty pane, not on a node.
  if (!target.classList.contains("react-flow__pane")) {
    return;
  }
  const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
  mindMapStore.getState().addRoot({ position });
}

export function handleCanvasKeyDown(event: KeyboardEvent): void {
  // Any focused editable field (node label / title input / markdown body) keeps
  // Enter / Backspace / arrows for itself. React's synthetic stopPropagation does
  // not block native window listeners, so we opt out at the source. The body editor
  // is a <textarea> that does not set editingNodeId, so the editingNodeId guard
  // below is not enough — match the element type too.
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return;
  }
  const state = mindMapStore.getState();
  if (state.editingNodeId !== null) {
    return;
  }
  // Undo / redo work regardless of selection. While editing a node the early
  // returns above let Cmd+Z fall through to the input's native undo instead.
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();
    if (key === "z") {
      event.preventDefault();
      if (event.shiftKey) {
        state.redo();
      } else {
        state.undo();
      }
      return;
    }
    if (key === "y") {
      event.preventDefault();
      state.redo();
      return;
    }
    // Cut / copy / paste a whole subtree. Only act on a selected node; with no
    // selection, fall through so the browser's native clipboard still works.
    if (key === "x" || key === "c" || key === "v") {
      const target = state.selectedNodeId;
      if (target === null) {
        return;
      }
      event.preventDefault();
      if (key === "x") {
        state.cutNode(target);
      } else if (key === "c") {
        state.copyNode(target);
      } else {
        state.pasteInto(target);
      }
      return;
    }
  }
  // Alt+←/→ or Cmd/Ctrl+←/→ walk the focus history (Назад/Вперёд). Checked before
  // the plain-arrow spatial navigation below so the modifier diverts only these two
  // combos; the Cmd/Ctrl block above ignores arrows and falls through to here.
  if (
    (event.altKey || event.metaKey || event.ctrlKey) &&
    (event.key === "ArrowLeft" || event.key === "ArrowRight")
  ) {
    event.preventDefault();
    if (event.key === "ArrowLeft") {
      void state.goBack();
    } else {
      void state.goForward();
    }
    return;
  }
  const arrow = arrowDirection(event.key);
  if (arrow !== null) {
    event.preventDefault();
    navigate(state, arrow);
    return;
  }
  const id = state.selectedNodeId;
  if (id === null) {
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    event.preventDefault();
    state.removeSubtree(id);
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (event.metaKey || event.ctrlKey) {
      state.addChildOf(id);
    } else {
      state.addSiblingOf(id);
    }
  } else if (event.key === "F2") {
    event.preventDefault();
    state.startEditing(id);
  } else if (event.key === "Escape") {
    state.selectNode(null);
  }
}

function arrowDirection(key: string): NavigationDirection | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

function navigate(
  state: ReturnType<typeof mindMapStore.getState>,
  direction: NavigationDirection,
): void {
  const fromId = state.selectedNodeId;
  if (fromId === null) {
    // No current selection — anchor on the first root if there is one.
    const firstRoot = state.graph.nodes.find((node) => node.parentId === null);
    if (firstRoot !== undefined) {
      state.selectNode(firstRoot.id);
    }
    return;
  }
  const nextId = findNeighbor(state.graph, fromId, direction, state.collapsedNodeIds);
  if (nextId !== null) {
    state.selectNode(nextId);
  }
}

// Rough single-line node height. Only used as the pre-measure size hint below;
// React Flow re-measures the real height after the first render.
const NODE_INITIAL_HEIGHT = 44;

export function toRFNodes(
  graph: Graph,
  selectedNodeId: NodeId | null,
  hidden: ReadonlySet<NodeId>,
): CloudNodeType[] {
  return graph.nodes.flatMap((node: MindNode): CloudNodeType[] => {
    if (hidden.has(node.id)) {
      return [];
    }
    const isRoot = node.parentId === null;
    return [
      {
        id: node.id,
        type: "cloud",
        position: { x: node.position.x, y: node.position.y },
        data: { text: node.text, hasBody: (node.body ?? "").trim() !== "" },
        selected: node.id === selectedNodeId,
        // Render the node visible from frame one. Without an initial size React Flow
        // keeps a fresh node `visibility:hidden` until it measures it, and focusing a
        // hidden <input> drops focus to <body> — swallowing the first keystrokes when
        // the user starts typing immediately. Measured size still replaces these.
        initialWidth: estimateNodeWidth(node.text, isRoot),
        initialHeight: NODE_INITIAL_HEIGHT,
      },
    ];
  });
}

export function toRFEdges(
  graph: Graph,
  hidden: ReadonlySet<NodeId>,
  detachCandidateId: NodeId | null,
): RFEdge[] {
  const positions = new Map(graph.nodes.map((node) => [node.id, node.position]));
  return graph.edges.flatMap((edge: MindEdge): RFEdge[] => {
    // Drop edges into hidden descendants of a collapsed node.
    if (hidden.has(edge.source) || hidden.has(edge.target)) {
      return [];
    }
    const src = positions.get(edge.source);
    const tgt = positions.get(edge.target);
    // sanitize() filters dangling edges at load, but rendering should still cope
    // with a transient inconsistency mid-mutation by dropping the edge.
    if (src === undefined || tgt === undefined) {
      return [];
    }
    const childIsRight = tgt.x >= src.x;
    return [
      {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: childIsRight ? "source-right" : "source-left",
        targetHandle: childIsRight ? "target-left" : "target-right",
        // The edge into a node that has crossed the detach threshold renders
        // "tearing" (dashed/faded) — a cue that releasing now will detach it.
        ...(edge.target === detachCandidateId ? { className: styles.tearing } : {}),
      },
    ];
  });
}
