import type { NodeId, NodeNameStyle, Position } from "../types";

/**
 * Domain model of the vault file layout. These types describe what the `.mind/`
 * verstka files and `.md` notes mean as data — independent of how they are read
 * from or written to disk (that lives behind the `VaultStore` port). Mapping the
 * graph to/from this model is pure, so it is covered without a real filesystem.
 */

/** A space as recorded in `.mind/spaces.yaml`. List order is the panel order. */
export interface SpaceMeta {
  readonly id: string;
  /** Folder name of the space under the vault root. */
  readonly name: string;
}

/** A root as recorded in a space's `.mind/<Space>/space.yaml`. */
export interface RootMeta {
  /** Id of the root node (parentId === null) of this tree. */
  readonly id: NodeId;
  /** Folder name of the root under its space. */
  readonly name: string;
}

/**
 * One node record inside a root's `.mind/<Space>/<Root>/root.yaml`. Holds the
 * whole verstka of a node, including bodyless ones. `file` is the current `.md`
 * file name and is present only for nodes that have a body.
 */
export interface NodeRecord {
  readonly id: NodeId;
  readonly text: string;
  readonly parentId: NodeId | null;
  readonly position: Position;
  readonly style?: NodeNameStyle;
  /** Whether the node's children are collapsed (verstka view-state, absent = expanded). */
  readonly collapsed?: boolean;
  /** Name of the `.md` note carrying this node's body, when it has one. */
  readonly file?: string;
}

/** A `.md` note read from a root folder: its file name and full raw text. */
export interface RawNote {
  readonly file: string;
  readonly text: string;
}

/** Raw, possibly-corrupt contents of one root folder as read from disk. */
export interface RawRoot {
  /** Folder name of the root under its space. */
  readonly folder: string;
  /** Raw `root.yaml` text, or null when missing/unreadable. */
  readonly rootYaml: string | null;
  /** `.md` notes discovered in the folder. */
  readonly notes: readonly RawNote[];
}

/** Raw, possibly-corrupt contents of one space folder as read from disk. */
export interface RawSpace {
  /** Folder name of the space under the vault root. */
  readonly folder: string;
  /** Raw `space.yaml` text, or null when missing/unreadable. */
  readonly spaceYaml: string | null;
  /** Root subfolders discovered in the space. */
  readonly roots: readonly RawRoot[];
}
