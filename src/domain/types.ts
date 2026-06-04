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
