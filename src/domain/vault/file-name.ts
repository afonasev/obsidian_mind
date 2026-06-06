/**
 * Derive human-readable, filesystem-safe folder/file names from node text. Names
 * are a convenience derivative — the durable node↔file link is the `id`, never the
 * name (design Решение 3/4), so a lossy sanitize plus an id-based suffix on
 * collision is enough.
 */

/** Fallback base name for a root folder whose root node has no usable text. */
export const DEFAULT_ROOT_NAME = "Без названия";
/** Fallback base name for a note whose node has no usable text. */
export const DEFAULT_NOTE_NAME = "Без названия";

// Characters illegal in file names on Windows/macOS, replaced with a space so the
// rest of the text survives. Control codes are not handled — node labels are typed text.
const ILLEGAL = /[\\/<>:"|?*]/g;

/**
 * Turn arbitrary node text into a single-segment base name: strip illegal
 * characters, collapse whitespace, and drop trailing dots/spaces (which some
 * filesystems silently trim). An empty result falls back to `fallback`.
 */
export function sanitizeName(text: string, fallback: string): string {
  const cleaned = text
    .replace(ILLEGAL, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Trailing dots/spaces are stripped by Windows; remove them up front so the
    // on-disk name matches what we record.
    .replace(/[. ]+$/, "");
  return cleaned === "" ? fallback : cleaned;
}

/** Short, stable disambiguator appended to a colliding name (first id segment). */
function suffixOf(id: string): string {
  return id.slice(0, 8);
}

/**
 * Assign a unique name to each item in order, deriving the base from its text and,
 * on collision with an already-taken name, appending a short id suffix. `.md`
 * extensions are not handled here — callers add them — so the same logic serves
 * both root folders and note files.
 */
export function assignUniqueNames<T>(
  items: readonly T[],
  getText: (item: T) => string,
  getId: (item: T) => string,
  fallback: string,
): Map<string, string> {
  const taken = new Set<string>();
  const result = new Map<string, string>();
  for (const item of items) {
    const base = sanitizeName(getText(item), fallback);
    let name = base;
    if (taken.has(name)) {
      name = `${base} (${suffixOf(getId(item))})`;
      // An id suffix can still clash (truncated ids, or a literal "(…)" in text);
      // append a counter until free so every sibling is guaranteed distinct.
      let n = 2;
      while (taken.has(name)) {
        name = `${base} (${suffixOf(getId(item))}-${n})`;
        n += 1;
      }
    }
    taken.add(name);
    result.set(getId(item), name);
  }
  return result;
}
