import { describe, expect, it } from "vitest";
import {
  createWorkspace,
  neighborOf,
  removeWorkspace,
  renameWorkspace,
  type Workspace,
} from "./workspaces";

function ws(id: string, name = id, createdAt = 0): Workspace {
  return { id, name, createdAt };
}

describe("createWorkspace", () => {
  it("appends the new workspace at the end (creation order)", () => {
    const list = [ws("a"), ws("b")];
    const next = createWorkspace(list, ws("c"));
    expect(next.map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the original list", () => {
    const list = [ws("a")];
    createWorkspace(list, ws("b"));
    expect(list.map((w) => w.id)).toEqual(["a"]);
  });
});

describe("renameWorkspace", () => {
  it("changes the name of the matching workspace", () => {
    const next = renameWorkspace([ws("a", "Old"), ws("b")], "a", "New");
    expect(next.find((w) => w.id === "a")?.name).toBe("New");
  });

  it("rejects an empty name, returning the same list reference", () => {
    const list = [ws("a", "Keep")];
    expect(renameWorkspace(list, "a", "")).toBe(list);
  });

  it("rejects a whitespace-only name", () => {
    const list = [ws("a", "Keep")];
    expect(renameWorkspace(list, "a", "   ")).toBe(list);
  });

  it("leaves other workspaces untouched", () => {
    const next = renameWorkspace([ws("a", "A"), ws("b", "B")], "a", "Z");
    expect(next.find((w) => w.id === "b")?.name).toBe("B");
  });
});

describe("removeWorkspace", () => {
  it("drops the matching workspace", () => {
    const next = removeWorkspace([ws("a"), ws("b")], "a");
    expect(next.map((w) => w.id)).toEqual(["b"]);
  });

  it("leaves the list unchanged for an unknown id", () => {
    const next = removeWorkspace([ws("a")], "ghost");
    expect(next.map((w) => w.id)).toEqual(["a"]);
  });
});

describe("neighborOf", () => {
  it("returns the next workspace when one follows", () => {
    expect(neighborOf([ws("a"), ws("b"), ws("c")], "b")?.id).toBe("c");
  });

  it("returns the previous workspace when the deleted one is last", () => {
    expect(neighborOf([ws("a"), ws("b")], "b")?.id).toBe("a");
  });

  it("returns null when the deleted workspace is the only entry", () => {
    expect(neighborOf([ws("a")], "a")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(neighborOf([ws("a")], "ghost")).toBeNull();
  });
});
