export type NodeId = string;
export type EdgeId = string;

export interface Position {
  readonly x: number;
  readonly y: number;
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
