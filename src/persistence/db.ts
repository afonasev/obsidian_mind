import { type IDBPDatabase, openDB } from "idb";

export const DB_NAME = "mindmap";
export const DB_VERSION = 1;
export const STORE_NAME = "graph";
export const RECORD_KEY = "current";

export interface MindMapDb {
  graph: {
    key: typeof RECORD_KEY;
    value: StoredGraph;
  };
}

export interface StoredGraph {
  readonly version: 1;
  readonly nodes: unknown;
  readonly edges: unknown;
  readonly updatedAt: number;
}

export function openMindMapDb(): Promise<IDBPDatabase<MindMapDb>> {
  return openDB<MindMapDb>(DB_NAME, DB_VERSION, {
    upgrade(database) {
      // `upgrade` only fires when the requested version is higher than the
      // current one; for a fresh DB the store cannot already exist.
      database.createObjectStore(STORE_NAME);
    },
  });
}
