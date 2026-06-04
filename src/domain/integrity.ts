import type { Graph } from "./types";

export function sanitize(graph: Graph): Graph {
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const validEdges = graph.edges.filter(
    (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target),
  );
  if (validEdges.length === graph.edges.length) {
    return graph;
  }
  return { nodes: graph.nodes, edges: validEdges };
}
