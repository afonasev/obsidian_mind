import { describe, expect, it } from "vitest";
import {
  parseNodes,
  parseRoots,
  parseSpaces,
  serializeNodes,
  serializeRoots,
  serializeSpaces,
} from "./mind-format";
import type { NodeRecord, RootMeta, SpaceMeta } from "./model";

describe("spaces.yaml", () => {
  const spaces: SpaceMeta[] = [
    { id: "s1", name: "Work" },
    { id: "s2", name: "Home" },
  ];

  it("round-trips an ordered space list", () => {
    expect(parseSpaces(serializeSpaces(spaces))).toEqual(spaces);
  });

  it("returns an empty list for missing text", () => {
    expect(parseSpaces(null)).toEqual([]);
  });

  it("returns an empty list on malformed yaml", () => {
    expect(parseSpaces("spaces: : :")).toEqual([]);
  });

  it("returns an empty list when the root is not a spaces record", () => {
    expect(parseSpaces("- a\n- b")).toEqual([]);
  });

  it("skips entries missing a field or that are not records", () => {
    expect(
      parseSpaces("spaces:\n  - scalar\n  - name: NoId\n  - id: x\n  - id: ok\n    name: Keep"),
    ).toEqual([{ id: "ok", name: "Keep" }]);
  });
});

describe("space.yaml", () => {
  const roots: RootMeta[] = [{ id: "r1", name: "Tree A" }];

  it("round-trips a root list", () => {
    expect(parseRoots(serializeRoots(roots))).toEqual(roots);
  });

  it("skips entries missing a field", () => {
    expect(parseRoots("roots:\n  - id: r1\n  - id: r2\n    name: Keep")).toEqual([
      { id: "r2", name: "Keep" },
    ]);
  });
});

describe("root.yaml", () => {
  const nodes: NodeRecord[] = [
    { id: "root", text: "Root", parentId: null, position: { x: 1, y: 2 } },
    {
      id: "child",
      text: "Child",
      parentId: "root",
      position: { x: 3, y: 4 },
      style: { bold: true, italic: false, fontScale: 1, color: "#abcabc" },
      collapsed: true,
      file: "Child.md",
    },
  ];

  it("round-trips node records including style, collapsed and file", () => {
    expect(parseNodes(serializeNodes(nodes))).toEqual(nodes);
  });

  it("omits absent optional fields from the output", () => {
    const text = serializeNodes([nodes[0] as NodeRecord]);
    expect(text).not.toContain("style");
    expect(text).not.toContain("collapsed");
    expect(text).not.toContain("file");
  });

  it("returns an empty list for missing text", () => {
    expect(parseNodes(null)).toEqual([]);
  });

  it("skips a record without an id and a non-record entry", () => {
    expect(parseNodes("nodes:\n  - text: NoId\n  - just-a-scalar")).toEqual([]);
  });

  it("defaults text, parentId and position when fields are absent", () => {
    expect(parseNodes("nodes:\n  - id: only")).toEqual([
      { id: "only", text: "", parentId: null, position: { x: 0, y: 0 } },
    ]);
  });

  it("drops ill-typed style fields and keeps the valid ones", () => {
    const text =
      "nodes:\n  - id: n\n    style:\n      bold: yes\n      italic: true\n      fontScale: NaN\n      color: 7";
    expect(parseNodes(text)).toEqual([
      { id: "n", text: "", parentId: null, position: { x: 0, y: 0 }, style: { italic: true } },
    ]);
  });

  it("drops a style that is not an object", () => {
    expect(parseNodes("nodes:\n  - id: n\n    style: red")).toEqual([
      { id: "n", text: "", parentId: null, position: { x: 0, y: 0 } },
    ]);
  });

  it("drops a style whose every field is invalid", () => {
    expect(parseNodes("nodes:\n  - id: n\n    style:\n      bold: 1")).toEqual([
      { id: "n", text: "", parentId: null, position: { x: 0, y: 0 } },
    ]);
  });

  it("ignores a non-boolean collapsed and non-finite coordinates", () => {
    expect(parseNodes("nodes:\n  - id: n\n    collapsed: nope\n    x: .inf\n    y: 5")).toEqual([
      { id: "n", text: "", parentId: null, position: { x: 0, y: 5 } },
    ]);
  });
});
