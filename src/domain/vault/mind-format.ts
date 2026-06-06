import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { NodeNameStyle } from "../types";
import type { NodeRecord, RootMeta, SpaceMeta } from "./model";

/**
 * Serialize/parse the three `.mind/` verstka documents to and from the domain
 * model. Parsing is soft (design Решение 5): any corruption degrades to defaults
 * per element instead of throwing, so a hand-broken file never crashes a read.
 */

// --- spaces.yaml: ordered list of spaces ---

export function serializeSpaces(spaces: readonly SpaceMeta[]): string {
  return stringifyYaml({ spaces: spaces.map((s) => ({ id: s.id, name: s.name })) });
}

export function parseSpaces(text: string | null): SpaceMeta[] {
  const list = readList(text, "spaces");
  const result: SpaceMeta[] = [];
  for (const item of list) {
    const id = readString(item, "id");
    const name = readString(item, "name");
    if (id !== null && name !== null) {
      result.push({ id, name });
    }
  }
  return result;
}

// --- space.yaml: ordered list of roots ---

export function serializeRoots(roots: readonly RootMeta[]): string {
  return stringifyYaml({ roots: roots.map((r) => ({ id: r.id, name: r.name })) });
}

export function parseRoots(text: string | null): RootMeta[] {
  const list = readList(text, "roots");
  const result: RootMeta[] = [];
  for (const item of list) {
    const id = readString(item, "id");
    const name = readString(item, "name");
    if (id !== null && name !== null) {
      result.push({ id, name });
    }
  }
  return result;
}

// --- root.yaml: all node records of one root ---

export function serializeNodes(nodes: readonly NodeRecord[]): string {
  return stringifyYaml({
    nodes: nodes.map((n) => ({
      id: n.id,
      text: n.text,
      parentId: n.parentId,
      x: n.position.x,
      y: n.position.y,
      ...(n.style !== undefined ? { style: n.style } : {}),
      ...(n.collapsed === true ? { collapsed: true } : {}),
      ...(n.file !== undefined ? { file: n.file } : {}),
    })),
  });
}

export function parseNodes(text: string | null): NodeRecord[] {
  const list = readList(text, "nodes");
  const result: NodeRecord[] = [];
  for (const item of list) {
    const record = readNode(item);
    if (record !== null) {
      result.push(record);
    }
  }
  return result;
}

/** Parse one node entry, returning null when it is not a record with a usable id. */
function readNode(item: unknown): NodeRecord | null {
  if (!isRecord(item)) {
    return null;
  }
  const id = readString(item, "id");
  if (id === null) {
    return null;
  }
  const style = readStyle(item.style);
  const file = readString(item, "file");
  return {
    id,
    text: readString(item, "text") ?? "",
    parentId: readString(item, "parentId"),
    position: { x: readNumber(item, "x") ?? 0, y: readNumber(item, "y") ?? 0 },
    ...(style !== undefined ? { style } : {}),
    ...(readBool(item, "collapsed") === true ? { collapsed: true } : {}),
    ...(file !== null ? { file } : {}),
  };
}

/** Parse the optional `style` object, dropping unrecognized/ill-typed fields. */
function readStyle(raw: unknown): NodeNameStyle | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }
  const style: { -readonly [K in keyof NodeNameStyle]?: NodeNameStyle[K] } = {};
  if (typeof raw.bold === "boolean") {
    style.bold = raw.bold;
  }
  if (typeof raw.italic === "boolean") {
    style.italic = raw.italic;
  }
  if (typeof raw.fontScale === "number" && Number.isFinite(raw.fontScale)) {
    style.fontScale = raw.fontScale;
  }
  if (typeof raw.color === "string") {
    style.color = raw.color;
  }
  // An empty object means "no usable style" — return undefined so the node stays
  // on defaults instead of carrying a meaningless `style: {}`.
  return Object.keys(style).length === 0 ? undefined : style;
}

// --- shared soft readers ---

/** Parse `text` as YAML and return `data[key]` as an array, or [] on any failure. */
function readList(text: string | null, key: string): unknown[] {
  if (text === null) {
    return [];
  }
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch {
    return [];
  }
  if (isRecord(data) && Array.isArray(data[key])) {
    return data[key];
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(item: unknown, key: string): string | null {
  if (isRecord(item)) {
    const value = item[key];
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }
  return null;
}

// Takes an already-narrowed record (only readNode calls these), so no isRecord guard.
function readNumber(item: Record<string, unknown>, key: string): number | null {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBool(item: Record<string, unknown>, key: string): boolean | null {
  const value = item[key];
  return typeof value === "boolean" ? value : null;
}
