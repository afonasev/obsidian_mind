import { describe, expect, it } from "vitest";
import { assignUniqueNames, DEFAULT_NOTE_NAME, DEFAULT_ROOT_NAME, sanitizeName } from "./file-name";

describe("sanitizeName", () => {
  it("keeps a plain name unchanged", () => {
    expect(sanitizeName("Идеи", DEFAULT_ROOT_NAME)).toBe("Идеи");
  });

  it("replaces illegal characters and collapses whitespace", () => {
    expect(sanitizeName('a/b:c?"<d>', DEFAULT_NOTE_NAME)).toBe("a b c d");
  });

  it("strips trailing dots and spaces", () => {
    expect(sanitizeName("note...  ", DEFAULT_NOTE_NAME)).toBe("note");
  });

  it("falls back when the cleaned name is empty", () => {
    expect(sanitizeName("///", DEFAULT_ROOT_NAME)).toBe(DEFAULT_ROOT_NAME);
    expect(sanitizeName("   ", DEFAULT_NOTE_NAME)).toBe(DEFAULT_NOTE_NAME);
  });
});

describe("assignUniqueNames", () => {
  const text = (x: { text: string }): string => x.text;
  const id = (x: { id: string }): string => x.id;

  it("returns the sanitized base name when there is no collision", () => {
    const names = assignUniqueNames([{ id: "1", text: "Alpha" }], text, id, DEFAULT_NOTE_NAME);
    expect(names.get("1")).toBe("Alpha");
  });

  it("suffixes a colliding name with the short id", () => {
    const names = assignUniqueNames(
      [
        { id: "aaaaaaaa-1", text: "Same" },
        { id: "bbbbbbbb-2", text: "Same" },
      ],
      text,
      id,
      DEFAULT_NOTE_NAME,
    );
    expect(names.get("aaaaaaaa-1")).toBe("Same");
    expect(names.get("bbbbbbbb-2")).toBe("Same (bbbbbbbb)");
  });

  it("adds a counter when even the id-suffixed name collides", () => {
    // The three ids share their first 8 chars, so the id suffix is identical and
    // the third item must fall through to the numeric counter.
    const names = assignUniqueNames(
      [
        { id: "aaaaaaaa1", text: "X" },
        { id: "aaaaaaaa2", text: "X" },
        { id: "aaaaaaaa3", text: "X" },
      ],
      text,
      id,
      DEFAULT_NOTE_NAME,
    );
    expect([...names.values()]).toEqual(["X", "X (aaaaaaaa)", "X (aaaaaaaa-2)"]);
  });
});
