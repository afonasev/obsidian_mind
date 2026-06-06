import type { Graph, MindEdge, MindNode, NodeId } from "../types";
import { assignUniqueNames, DEFAULT_NOTE_NAME, DEFAULT_ROOT_NAME } from "./file-name";
import { parseNodes, parseRoots, parseSpaces, serializeNodes, serializeRoots } from "./mind-format";
import type { NodeRecord, RawRoot, RawSpace, RootMeta, SpaceMeta } from "./model";
import { parseNote, serializeNote } from "./note";

/**
 * Merge the recorded space order/ids (`spaces.yaml`) with the actual top-level
 * folders (durable truth of existence): listed-and-present spaces keep their order
 * and id, extra folders are appended lexicographically with fresh ids.
 */
export function mergeSpaces(spacesYaml: string | null, folders: readonly string[]): SpaceMeta[] {
  // First occurrence of a name wins, so a duplicate entry in a hand-edited
  // spaces.yaml cannot displace the original id.
  const idByName = new Map<string, string>();
  for (const space of parseSpaces(spacesYaml)) {
    if (!idByName.has(space.name)) {
      idByName.set(space.name, space.id);
    }
  }
  const present = new Set(folders);
  const used = new Set<string>();
  const result: SpaceMeta[] = [];
  for (const [name, id] of idByName) {
    if (present.has(name)) {
      used.add(name);
      result.push({ id, name });
    }
  }
  for (const name of [...folders].sort((a, b) => a.localeCompare(b))) {
    if (!used.has(name)) {
      result.push({ id: crypto.randomUUID(), name });
    }
  }
  return result;
}

/**
 * Pure mapping between a space's on-disk files and the domain graph. Reading is
 * soft (defaults per element); writing produces the full desired file set, which a
 * diff turns into the minimal writes/deletes. No filesystem here — adapters do IO.
 */

// Default canvas spread for nodes the reader has to synthesize (a root recovered
// from a folder, or a note adopted with no verstka). Real positions come from
// `root.yaml`; these only place nodes that have none yet.
const SYNTH_X = 240;
const SYNTH_Y_STEP = 100;

export interface ReadSpaceResult {
  readonly graph: Graph;
  readonly collapsed: ReadonlySet<NodeId>;
  /** Roots in panel order (space.yaml order, then extra folders). */
  readonly roots: readonly RootMeta[];
}

/** Build the `MindEdge` list implied by `parentId` (edges are never serialized). */
function edgesFromNodes(nodes: readonly MindNode[]): MindEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  const edges: MindEdge[] = [];
  for (const node of nodes) {
    // Skip edges to a missing parent so a dangling reference cannot break layout.
    if (node.parentId !== null && ids.has(node.parentId)) {
      edges.push({ id: `${node.parentId}->${node.id}`, source: node.parentId, target: node.id });
    }
  }
  return edges;
}

/**
 * Assemble a space's graph from its (possibly corrupt) folder contents. The root
 * folders are durable truth of existence; `root.yaml`/notes are recovered per the
 * degradation table in design Решение 5.
 */
export function readSpace(raw: RawSpace): ReadSpaceResult {
  const metaByFolder = new Map(parseRoots(raw.spaceYaml).map((r) => [r.name, r]));
  // Root order: space.yaml order first (for folders that still exist), then any
  // extra folders lexicographically — the folders are the source of truth.
  const present = new Set(raw.roots.map((r) => r.folder));
  const ordered: RawRoot[] = [];
  for (const [folder] of metaByFolder) {
    const root = raw.roots.find((r) => r.folder === folder);
    if (root !== undefined) {
      ordered.push(root);
    }
  }
  for (const root of [...raw.roots].sort((a, b) => a.folder.localeCompare(b.folder))) {
    if (!metaByFolder.has(root.folder) && present.has(root.folder)) {
      ordered.push(root);
    }
  }

  const nodes: MindNode[] = [];
  const collapsed = new Set<NodeId>();
  const roots: RootMeta[] = [];
  for (const root of ordered) {
    // A folder with neither root.yaml nor notes carries no data — skip it so a
    // leftover empty directory (e.g. after deleting a root) never resurrects as a
    // phantom empty root on the next read.
    if (root.rootYaml === null && root.notes.length === 0) {
      continue;
    }
    const stableId = metaByFolder.get(root.folder)?.id ?? null;
    const read = readRoot(root, stableId);
    nodes.push(...read.nodes);
    for (const id of read.collapsed) {
      collapsed.add(id);
    }
    roots.push({ id: read.rootId, name: root.folder });
  }
  return { graph: { nodes, edges: edgesFromNodes(nodes) }, collapsed, roots };
}

interface ReadRootResult {
  readonly rootId: NodeId;
  readonly nodes: readonly MindNode[];
  readonly collapsed: readonly NodeId[];
}

/** Assemble one root folder into nodes, linking bodies by id (Решение 4). */
function readRoot(root: RawRoot, stableId: NodeId | null): ReadRootResult {
  const records = parseNodes(root.rootYaml);
  const rootRecord = records.find((r) => r.parentId === null);
  if (rootRecord === undefined) {
    // No usable root.yaml: recover a flat tree — a synthesized root plus every
    // note as its direct child (degradation table: "Отсутствует root.yaml").
    return recoverFlat(root, stableId);
  }
  const parsedNotes = root.notes.map((n) => ({ file: n.file, ...parseNote(n.text) }));
  const consumed = new Set<string>();
  const nodes: MindNode[] = [];
  const collapsed: NodeId[] = [];
  for (const record of records) {
    const body = linkBody(record, parsedNotes, consumed);
    nodes.push(toNode(record, body));
    if (record.collapsed === true) {
      collapsed.push(record.id);
    }
  }
  // Notes with no matching record are adopted as children of the root (first-read
  // adoption; reconciliation of external edits is vault-open-refresh's job).
  adoptOrphans(parsedNotes, consumed, rootRecord.id, nodes);
  return { rootId: rootRecord.id, nodes, collapsed };
}

type ParsedNoteAt = { readonly file: string; readonly id: string | null; readonly body: string };

/** Resolve a record's body: by frontmatter id first, else by file name (Решение 4). */
function linkBody(
  record: NodeRecord,
  notes: readonly ParsedNoteAt[],
  consumed: Set<string>,
): string | undefined {
  const byId = notes.find((n) => n.id === record.id);
  if (byId !== undefined) {
    consumed.add(byId.file);
    return byId.body;
  }
  if (record.file !== undefined) {
    const byName = notes.find((n) => n.file === record.file);
    // Fall back to the file name only when the note carries no id of its own; a
    // note with a different id belongs to another node, so we leave this bodyless.
    if (byName !== undefined && byName.id === null) {
      consumed.add(byName.file);
      return byName.body;
    }
  }
  return undefined;
}

function adoptOrphans(
  notes: readonly ParsedNoteAt[],
  consumed: Set<string>,
  rootId: NodeId,
  nodes: MindNode[],
): void {
  let index = nodes.length;
  for (const note of notes) {
    if (consumed.has(note.file)) {
      continue;
    }
    nodes.push({
      id: note.id ?? crypto.randomUUID(),
      text: stripMd(note.file),
      position: { x: SYNTH_X, y: index * SYNTH_Y_STEP },
      parentId: rootId,
      body: note.body,
    });
    index += 1;
  }
}

/** Recover a root with no readable `root.yaml`: synth root + flat note children. */
function recoverFlat(root: RawRoot, stableId: NodeId | null): ReadRootResult {
  const rootId = stableId ?? crypto.randomUUID();
  const nodes: MindNode[] = [
    { id: rootId, text: root.folder, position: { x: 0, y: 0 }, parentId: null },
  ];
  root.notes.forEach((raw, index) => {
    const parsed = parseNote(raw.text);
    nodes.push({
      id: parsed.id ?? crypto.randomUUID(),
      text: stripMd(raw.file),
      position: { x: SYNTH_X, y: index * SYNTH_Y_STEP },
      parentId: rootId,
      body: parsed.body,
    });
  });
  return { rootId, nodes, collapsed: [] };
}

function toNode(record: NodeRecord, body: string | undefined): MindNode {
  return {
    id: record.id,
    text: record.text,
    position: record.position,
    parentId: record.parentId,
    ...(record.style !== undefined ? { style: record.style } : {}),
    ...(body !== undefined ? { body } : {}),
  };
}

function stripMd(file: string): string {
  return file.replace(/\.md$/i, "");
}

// --- writing: desired files + diff ---

/** True for a node that owns a `.md` note (a non-empty body). */
function hasBody(node: MindNode): node is MindNode & { readonly body: string } {
  return node.body !== undefined && node.body !== "";
}

/** Map each node to the id of the root (parentId === null ancestor) it belongs to. */
function rootOf(graph: Graph): Map<NodeId, NodeId> {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const result = new Map<NodeId, NodeId>();
  for (const node of graph.nodes) {
    let current: MindNode | undefined = node;
    const seen = new Set<NodeId>();
    while (current !== undefined && current.parentId !== null && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentId);
    }
    result.set(node.id, current?.id ?? node.id);
  }
  return result;
}

/**
 * The full desired file set of a space: `space.yaml`, every root's `root.yaml`,
 * and a `.md` per node with a body. Paths are relative to the vault root; verstka
 * lives under `.mind/`, notes under the plain space/root folders.
 */
export function spaceDesiredFiles(
  space: SpaceMeta,
  graph: Graph,
  collapsed: ReadonlySet<NodeId>,
): Map<string, string> {
  const rootIdOf = rootOf(graph);
  const rootNodes = graph.nodes.filter((n) => n.parentId === null);
  const rootFolders = assignUniqueNames(
    rootNodes,
    (n) => n.text,
    (n) => n.id,
    DEFAULT_ROOT_NAME,
  );
  const files = new Map<string, string>();
  const mind = `.mind/${space.name}`;
  const roots: RootMeta[] = [];
  for (const rootNode of rootNodes) {
    // Cast: every rootNode id was just put into rootFolders, so the key is present.
    const folder = rootFolders.get(rootNode.id) as string;
    roots.push({ id: rootNode.id, name: folder });
    const members = graph.nodes.filter((n) => rootIdOf.get(n.id) === rootNode.id);
    const bodyNodes = members.filter(hasBody);
    const noteFiles = assignUniqueNames(
      bodyNodes,
      (n) => n.text,
      (n) => n.id,
      DEFAULT_NOTE_NAME,
    );
    for (const node of bodyNodes) {
      // Cast: noteFiles is keyed by bodyNodes' ids, so the key is present.
      const file = noteFiles.get(node.id) as string;
      files.set(`${space.name}/${folder}/${file}.md`, serializeNote(node.id, node.body));
    }
    const records: NodeRecord[] = members.map((node) => {
      const file = noteFiles.get(node.id);
      return toRecord(node, collapsed.has(node.id), file !== undefined ? `${file}.md` : undefined);
    });
    files.set(`${mind}/${folder}/root.yaml`, serializeNodes(records));
  }
  files.set(`${mind}/space.yaml`, serializeRoots(roots));
  return files;
}

function toRecord(node: MindNode, collapsed: boolean, file: string | undefined): NodeRecord {
  return {
    id: node.id,
    text: node.text,
    parentId: node.parentId,
    position: node.position,
    ...(node.style !== undefined ? { style: node.style } : {}),
    ...(collapsed ? { collapsed: true } : {}),
    ...(file !== undefined ? { file } : {}),
  };
}

export interface FileDiff {
  /** Paths to (over)write with new content. */
  readonly writes: readonly (readonly [string, string])[];
  /** Paths present before but no longer desired. */
  readonly deletes: readonly string[];
}

/** Minimal writes/deletes to turn `previous` files into `desired` ones. */
export function diffFiles(
  previous: ReadonlyMap<string, string>,
  desired: ReadonlyMap<string, string>,
): FileDiff {
  const writes: (readonly [string, string])[] = [];
  for (const [path, content] of desired) {
    if (previous.get(path) !== content) {
      writes.push([path, content]);
    }
  }
  const deletes: string[] = [];
  for (const path of previous.keys()) {
    if (!desired.has(path)) {
      deletes.push(path);
    }
  }
  return { writes, deletes };
}
