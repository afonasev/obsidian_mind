export type NodeId = string;
export type EdgeId = string;

export interface Position {
  readonly x: number;
  readonly y: number;
}

// Optional formatting applied to the whole node name. All fields optional; an
// absent field means "default" (no bold/italic, base font size). `fontScale` is a
// relative integer step (see FONT_SCALE_MIN/MAX in layout.ts), not pixels.
export interface NodeNameStyle {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly fontScale?: number;
}

export interface MindNode {
  readonly id: NodeId;
  readonly text: string;
  readonly position: Position;
  readonly parentId: NodeId | null;
  // Markdown body of the node. Absent on nodes saved before bodies existed — read
  // back as undefined (empty body), no migration. Lives only in the EditorPanel,
  // never on the canvas, so it does not affect layout.
  readonly body?: string;
  // Name styling. Absent on nodes saved before styling existed — read back as
  // undefined ("no formatting"), no migration (same pattern as `body`).
  readonly style?: NodeNameStyle;
}

export interface MindEdge {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
}

export interface Graph {
  readonly nodes: readonly MindNode[];
  readonly edges: readonly MindEdge[];
}
