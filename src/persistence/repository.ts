import { sanitize } from "../domain/integrity";
import type { Graph, MindEdge, MindNode } from "../domain/types";
import { openMindMapDb, RECORD_KEY, STORE_NAME, type StoredGraph } from "./db";

export async function loadGraph(): Promise<Graph | null> {
  const db = await openMindMapDb();
  try {
    const record = await db.get(STORE_NAME, RECORD_KEY);
    if (!record) {
      return null;
    }
    return sanitize(toGraph(record));
  } finally {
    db.close();
  }
}

export async function saveGraph(graph: Graph): Promise<void> {
  const db = await openMindMapDb();
  try {
    const record: StoredGraph = {
      version: 1,
      nodes: graph.nodes,
      edges: graph.edges,
      updatedAt: Date.now(),
    };
    await db.put(STORE_NAME, record, RECORD_KEY);
  } finally {
    db.close();
  }
}

function toGraph(record: StoredGraph): Graph {
  return {
    nodes: (record.nodes ?? []) as readonly MindNode[],
    edges: (record.edges ?? []) as readonly MindEdge[],
  };
}
