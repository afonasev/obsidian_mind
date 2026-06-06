import { describe, expect, it } from "vitest";
import type { Graph, MindNode } from "../types";
import type { RawRoot, RawSpace } from "./model";
import { diffFiles, mergeSpaces, readSpace, spaceDesiredFiles } from "./space-mapping";

const space = { id: "s", name: "MySpace" };

/** Rebuild a `RawSpace` from a desired-files map, as a real adapter would read it. */
function assembleRaw(files: ReadonlyMap<string, string>, spaceName: string): RawSpace {
  const folders = new Set<string>();
  for (const path of files.keys()) {
    const m = path.match(new RegExp(`^\\.mind/${spaceName}/([^/]+)/root\\.yaml$`));
    if (m?.[1] !== undefined) {
      folders.add(m[1]);
    }
  }
  const roots: RawRoot[] = [...folders].map((folder) => ({
    folder,
    rootYaml: files.get(`.mind/${spaceName}/${folder}/root.yaml`) ?? null,
    notes: [...files.entries()]
      .filter(([p]) => p.startsWith(`${spaceName}/${folder}/`))
      .map(([p, text]) => ({ file: p.slice(`${spaceName}/${folder}/`.length), text })),
  }));
  return {
    folder: spaceName,
    spaceYaml: files.get(`.mind/${spaceName}/space.yaml`) ?? null,
    roots,
  };
}

describe("readSpace / spaceDesiredFiles round-trip", () => {
  const nodes: MindNode[] = [
    { id: "r1", text: "Tree A", parentId: null, position: { x: 0, y: 0 } },
    { id: "a", text: "Alpha", parentId: "r1", position: { x: 240, y: 0 }, body: "hello" },
    { id: "b", text: "Beta", parentId: "a", position: { x: 480, y: 0 } },
    { id: "r2", text: "Tree B", parentId: null, position: { x: 0, y: 400 } },
  ];
  const graph: Graph = {
    nodes,
    edges: [
      { id: "r1->a", source: "r1", target: "a" },
      { id: "a->b", source: "a", target: "b" },
    ],
  };
  const collapsed = new Set(["a"]);

  it("recovers the same graph, collapsed set and root order", () => {
    const files = spaceDesiredFiles(space, graph, collapsed);
    const result = readSpace(assembleRaw(files, space.name));
    expect(result.graph).toEqual(graph);
    expect([...result.collapsed]).toEqual(["a"]);
    expect(result.roots).toEqual([
      { id: "r1", name: "Tree A" },
      { id: "r2", name: "Tree B" },
    ]);
  });

  it("writes a note only for nodes with a body", () => {
    const files = spaceDesiredFiles(space, graph, collapsed);
    expect(files.has("MySpace/Tree A/Alpha.md")).toBe(true);
    expect([...files.keys()].filter((p) => p.endsWith(".md"))).toHaveLength(1);
  });

  it("omits the collapsed flag and style when the node has neither", () => {
    const files = spaceDesiredFiles(space, graph, new Set());
    expect(files.get(".mind/MySpace/Tree A/root.yaml")).not.toContain("collapsed");
  });

  it("serializes style onto its node record", () => {
    const styled: Graph = {
      nodes: [
        { id: "r1", text: "R", parentId: null, position: { x: 0, y: 0 }, style: { bold: true } },
      ],
      edges: [],
    };
    const files = spaceDesiredFiles(space, styled, new Set());
    const back = readSpace(assembleRaw(files, space.name));
    expect(back.graph.nodes[0]?.style).toEqual({ bold: true });
  });
});

describe("readSpace soft reading", () => {
  it("recovers a flat tree when root.yaml is missing (note kept by id)", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: "roots:\n  - id: keep\n    name: Tree",
      roots: [
        {
          folder: "Tree",
          rootYaml: null,
          notes: [{ file: "Note.md", text: "---\nid: child\n---\nbody" }],
        },
      ],
    };
    const result = readSpace(raw);
    expect(result.graph.nodes).toEqual([
      { id: "keep", text: "Tree", parentId: null, position: { x: 0, y: 0 } },
      { id: "child", text: "Note", parentId: "keep", position: { x: 240, y: 0 }, body: "body" },
    ]);
  });

  it("synthesizes a fresh root id when neither root.yaml nor space.yaml have one", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [{ folder: "Lonely", rootYaml: null, notes: [{ file: "n.md", text: "plain" }] }],
    };
    const result = readSpace(raw);
    const root = result.graph.nodes[0];
    expect(root).toMatchObject({ text: "Lonely", parentId: null });
    expect(root?.id).toMatch(/[0-9a-f-]{36}/);
    expect(result.graph.nodes[1]).toMatchObject({ parentId: root?.id, body: "plain" });
  });

  it("orders roots by space.yaml first, then extra folders lexicographically", () => {
    const root = (folder: string): RawRoot => ({
      folder,
      rootYaml: `nodes:\n  - id: ${folder}\n    parentId: null`,
      notes: [],
    });
    const raw: RawSpace = {
      folder: "S",
      // "Vanished" is listed in space.yaml but has no folder on disk — skipped.
      spaceYaml: "roots:\n  - id: V\n    name: Vanished\n  - id: B\n    name: Bravo",
      roots: [root("Charlie"), root("Bravo"), root("Alpha")],
    };
    expect(readSpace(raw).roots.map((r) => r.name)).toEqual(["Bravo", "Alpha", "Charlie"]);
  });

  it("links a body by id even when the recorded file name drifted", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [
        {
          folder: "T",
          rootYaml: "nodes:\n  - id: root\n    parentId: null\n    file: Old.md",
          notes: [{ file: "Renamed.md", text: "---\nid: root\n---\nkept" }],
        },
      ],
    };
    expect(readSpace(raw).graph.nodes[0]?.body).toBe("kept");
  });

  it("links a body by file name when the note carries no id", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [
        {
          folder: "T",
          rootYaml: "nodes:\n  - id: root\n    parentId: null\n    file: Note.md",
          notes: [{ file: "Note.md", text: "no frontmatter" }],
        },
      ],
    };
    expect(readSpace(raw).graph.nodes[0]?.body).toBe("no frontmatter");
  });

  it("leaves a node bodyless when the only candidate note has a foreign id", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [
        {
          folder: "T",
          rootYaml: "nodes:\n  - id: root\n    parentId: null\n    file: Note.md",
          notes: [{ file: "Note.md", text: "---\nid: someoneelse\n---\nx" }],
        },
      ],
    };
    const root = readSpace(raw).graph.nodes.find((n) => n.id === "root");
    expect(root?.body).toBeUndefined();
  });

  it("leaves a node bodyless when its record has no file", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [{ folder: "T", rootYaml: "nodes:\n  - id: root\n    parentId: null", notes: [] }],
    };
    expect(readSpace(raw).graph.nodes[0]?.body).toBeUndefined();
  });

  it("adopts an orphan note as a child of the root", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [
        {
          folder: "T",
          rootYaml: "nodes:\n  - id: root\n    text: Root\n    parentId: null",
          notes: [{ file: "Extra.md", text: "---\nid: extra\n---\nnew" }],
        },
      ],
    };
    expect(readSpace(raw).graph.nodes).toContainEqual({
      id: "extra",
      text: "Extra",
      parentId: "root",
      position: { x: 240, y: 100 },
      body: "new",
    });
  });

  it("adopts an orphan note without an id under a fresh node id", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [
        {
          folder: "T",
          rootYaml: "nodes:\n  - id: root\n    parentId: null",
          notes: [{ file: "Loose.md", text: "no id here" }],
        },
      ],
    };
    const adopted = readSpace(raw).graph.nodes.find((n) => n.text === "Loose");
    expect(adopted).toMatchObject({ parentId: "root", body: "no id here" });
    expect(adopted?.id).toMatch(/[0-9a-f-]{36}/);
  });

  it("skips the edge to a parent that does not exist", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [
        {
          folder: "T",
          rootYaml: "nodes:\n  - id: root\n    parentId: null\n  - id: orphan\n    parentId: ghost",
          notes: [],
        },
      ],
    };
    expect(readSpace(raw).graph.edges).toEqual([]);
  });
});

describe("spaceDesiredFiles edge cases", () => {
  it("drops nodes whose root cannot be resolved (dangling parent or cycle)", () => {
    const graph: Graph = {
      nodes: [
        { id: "x", text: "X", parentId: "y", position: { x: 0, y: 0 } },
        { id: "y", text: "Y", parentId: "x", position: { x: 0, y: 0 } },
        { id: "z", text: "Z", parentId: "ghost", position: { x: 0, y: 0 } },
      ],
      edges: [],
    };
    const files = spaceDesiredFiles(space, graph, new Set());
    expect(files.get(".mind/MySpace/space.yaml")).toBe("roots: []\n");
  });
});

describe("mergeSpaces", () => {
  it("keeps spaces.yaml order/ids for present folders and appends extras", () => {
    const yaml = "spaces:\n  - id: w\n    name: Work\n  - id: gone\n    name: Vanished";
    expect(mergeSpaces(yaml, ["Home", "Work", "Archive"])).toEqual([
      { id: "w", name: "Work" },
      { id: expect.stringMatching(/[0-9a-f-]{36}/), name: "Archive" },
      { id: expect.stringMatching(/[0-9a-f-]{36}/), name: "Home" },
    ]);
  });

  it("ignores a duplicate folder name listed twice in spaces.yaml", () => {
    const yaml = "spaces:\n  - id: a\n    name: Dup\n  - id: b\n    name: Dup";
    expect(mergeSpaces(yaml, ["Dup"])).toEqual([{ id: "a", name: "Dup" }]);
  });
});

describe("readSpace empty folders", () => {
  it("skips a root folder with no root.yaml and no notes", () => {
    const raw: RawSpace = {
      folder: "S",
      spaceYaml: null,
      roots: [{ folder: "Empty", rootYaml: null, notes: [] }],
    };
    expect(readSpace(raw).graph.nodes).toEqual([]);
    expect(readSpace(raw).roots).toEqual([]);
  });
});

describe("diffFiles", () => {
  it("writes new and changed paths and deletes removed ones", () => {
    const previous = new Map([
      ["keep", "same"],
      ["change", "old"],
      ["remove", "gone"],
    ]);
    const desired = new Map([
      ["keep", "same"],
      ["change", "new"],
      ["add", "fresh"],
    ]);
    const diff = diffFiles(previous, desired);
    expect(diff.writes).toEqual([
      ["change", "new"],
      ["add", "fresh"],
    ]);
    expect(diff.deletes).toEqual(["remove"]);
  });
});
