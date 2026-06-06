import { describe, expect, it } from "vitest";
import { parseNote, serializeNote } from "./note";

describe("serializeNote", () => {
  it("writes an id frontmatter followed by the body", () => {
    expect(serializeNote("n1", "Hello\nworld")).toBe("---\nid: n1\n---\nHello\nworld");
  });
});

describe("parseNote", () => {
  it("round-trips a serialized note", () => {
    const text = serializeNote("n1", "Body text");
    expect(parseNote(text)).toEqual({ id: "n1", body: "Body text" });
  });

  it("reads the id and the body after the closing fence", () => {
    expect(parseNote("---\nid: abc\n---\nthe body")).toEqual({ id: "abc", body: "the body" });
  });

  it("treats text without frontmatter as a bodyless-id note", () => {
    expect(parseNote("just markdown")).toEqual({ id: null, body: "just markdown" });
  });

  it("returns an empty body when nothing follows the frontmatter", () => {
    expect(parseNote("---\nid: x\n---")).toEqual({ id: "x", body: "" });
  });

  it("yields a null id when the frontmatter has no id field", () => {
    expect(parseNote("---\ntitle: foo\n---\nbody")).toEqual({ id: null, body: "body" });
  });

  it("yields a null id when the id is not a string", () => {
    expect(parseNote("---\nid: 42\n---\nbody")).toEqual({ id: null, body: "body" });
  });

  it("yields a null id when the id is an empty string", () => {
    expect(parseNote('---\nid: ""\n---\nbody')).toEqual({ id: null, body: "body" });
  });

  it("degrades to a null id on malformed frontmatter yaml", () => {
    expect(parseNote("---\nid: : :\n---\nbody")).toEqual({ id: null, body: "body" });
  });

  it("yields a null id when frontmatter parses to a non-object", () => {
    expect(parseNote("---\nplain scalar\n---\nbody")).toEqual({ id: null, body: "body" });
  });
});
