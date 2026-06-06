import { parse as parseYaml } from "yaml";

/**
 * A `.md` note carries only an `id` in its frontmatter plus the markdown body
 * (design Решение 2): all verstka lives in `root.yaml`, keeping user notes clean
 * and Obsidian-native.
 */
export interface ParsedNote {
  /** Node id from frontmatter, or null when absent/unparseable. */
  readonly id: string | null;
  /** Markdown body after the frontmatter (the whole text when there is none). */
  readonly body: string;
}

// A leading YAML frontmatter block: `---` line, content, closing `---` line. The
// body is whatever follows the closing fence's newline.
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/;

/** Serialize a node body into a note: `id` frontmatter followed by the markdown. */
export function serializeNote(id: string, body: string): string {
  return `---\nid: ${id}\n---\n${body}`;
}

/**
 * Parse a note into its `id` and body. Tolerant by design (Решение 5): a missing
 * or malformed frontmatter never throws — the whole text becomes the body and the
 * caller falls back to linking the note by file name.
 */
export function parseNote(text: string): ParsedNote {
  const match = FRONTMATTER.exec(text);
  if (match === null) {
    return { id: null, body: text };
  }
  // Group 1 (frontmatter) is a mandatory capture, so on a successful match it is
  // always a string; the `?? ""` only satisfies noUncheckedIndexedAccess and is
  // unreachable at runtime. Group 2 (body) is genuinely optional.
  const body = match[2] ?? "";
  // Group 1 (frontmatter) is a mandatory capture, so on a match it is always a
  // string. `String()` keeps it a string for noUncheckedIndexedAccess without a
  // nullish branch that coverage could never reach.
  return { id: readId(String(match[1])), body };
}

/** Extract a string `id` from frontmatter YAML, or null on any irregularity. */
function readId(frontmatter: string): string | null {
  let data: unknown;
  try {
    data = parseYaml(frontmatter);
  } catch {
    // Corrupt frontmatter degrades to "no id" rather than failing the read.
    return null;
  }
  if (typeof data === "object" && data !== null && "id" in data) {
    const id = (data as { id: unknown }).id;
    return typeof id === "string" && id !== "" ? id : null;
  }
  return null;
}
