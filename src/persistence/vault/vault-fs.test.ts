import { invoke } from "@tauri-apps/api/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultFsError } from "../../vault/fs-bridge";
import { createFsVaultFs, createLocalStorageVaultFs, createMemoryVaultFs } from "./vault-fs";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const invokeMock = vi.mocked(invoke);

function setTauri(present: boolean): void {
  const w = window as unknown as Record<string, unknown>;
  if (present) {
    w.__TAURI_INTERNALS__ = {};
  } else {
    delete w.__TAURI_INTERNALS__;
  }
}

describe("createFsVaultFs", () => {
  beforeEach(() => {
    setTauri(true);
    invokeMock.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => setTauri(false));

  it("binds the vault root to each vault-access command", async () => {
    const fs = createFsVaultFs("/vault");
    await fs.readDir("sub");
    await fs.readText("a.md");
    await fs.writeText("a.md", "x");
    await fs.createDir("dir");
    await fs.remove("dir");
    await fs.rename("old", "new");
    expect(invokeMock.mock.calls).toEqual([
      ["fs_read_dir", { vaultRoot: "/vault", relPath: "sub" }],
      ["fs_read_text", { vaultRoot: "/vault", relPath: "a.md" }],
      ["fs_write_text", { vaultRoot: "/vault", relPath: "a.md", contents: "x" }],
      ["fs_create_dir", { vaultRoot: "/vault", relPath: "dir" }],
      ["fs_remove", { vaultRoot: "/vault", relPath: "dir" }],
      ["fs_rename", { vaultRoot: "/vault", fromRel: "old", toRel: "new" }],
    ]);
  });
});

// The memory adapter mirrors the FS adapter's documented semantics (recursive
// readDir, parent-less writeText, recursive remove, NotFound on misses), so the
// VaultStore contract tests can run against it in place of a real filesystem.
describe("createMemoryVaultFs", () => {
  it("reads back written text and seeds initial files", async () => {
    const fs = createMemoryVaultFs({ "seed.md": "hi" });
    await fs.writeText("a/b.md", "body");
    expect(await fs.readText("seed.md")).toBe("hi");
    expect(await fs.readText("a/b.md")).toBe("body");
    expect(fs.snapshot().get("a/b.md")).toBe("body");
  });

  it("rejects readText of a missing file with NotFound", async () => {
    const fs = createMemoryVaultFs();
    const error = await fs.readText("nope.md").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultFsError);
    expect(error).toMatchObject({ kind: "NotFound" });
  });

  it("lists the whole subtree with root-relative paths", async () => {
    const fs = createMemoryVaultFs({ "A/B/c.md": "x" });
    expect(await fs.readDir("")).toEqual(
      expect.arrayContaining([
        { name: "A", relPath: "A", isDir: true },
        { name: "B", relPath: "A/B", isDir: true },
        { name: "c.md", relPath: "A/B/c.md", isDir: false },
      ]),
    );
    expect(await fs.readDir("A/B")).toEqual([{ name: "c.md", relPath: "A/B/c.md", isDir: false }]);
  });

  it("rejects readDir of a missing directory with NotFound", async () => {
    const fs = createMemoryVaultFs();
    const error = await fs.readDir("ghost").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "NotFound" });
  });

  it("makes an explicitly created empty directory visible", async () => {
    const fs = createMemoryVaultFs();
    await fs.createDir("Space");
    expect(await fs.readDir("")).toEqual([{ name: "Space", relPath: "Space", isDir: true }]);
  });

  it("removes a single file", async () => {
    const fs = createMemoryVaultFs({ "a.md": "x" });
    await fs.remove("a.md");
    expect(fs.snapshot().has("a.md")).toBe(false);
  });

  it("removes a directory and everything under it", async () => {
    const fs = createMemoryVaultFs({ "A/x.md": "1", "A/B/y.md": "2", "C/z.md": "3" });
    await fs.remove("A");
    expect([...fs.snapshot().keys()]).toEqual(["C/z.md"]);
    expect(await fs.readDir("")).not.toContainEqual({ name: "A", relPath: "A", isDir: true });
  });

  it("rejects remove of a missing path with NotFound", async () => {
    const fs = createMemoryVaultFs();
    const error = await fs.remove("gone").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "NotFound" });
  });

  it("renames a single file", async () => {
    const fs = createMemoryVaultFs({ "a.md": "x" });
    await fs.rename("a.md", "b.md");
    expect(fs.snapshot().get("b.md")).toBe("x");
    expect(fs.snapshot().has("a.md")).toBe(false);
  });

  it("renames a directory subtree", async () => {
    const fs = createMemoryVaultFs({ "A/x.md": "1", "A/B/y.md": "2" });
    await fs.rename("A", "Z");
    expect([...fs.snapshot().keys()].sort()).toEqual(["Z/B/y.md", "Z/x.md"]);
    expect(await fs.readDir("Z")).toContainEqual({ name: "B", relPath: "Z/B", isDir: true });
  });

  it("rejects rename of a missing source with NotFound", async () => {
    const fs = createMemoryVaultFs();
    const error = await fs.rename("none", "x").catch((e: unknown) => e);
    expect(error).toMatchObject({ kind: "NotFound" });
  });
});

describe("createLocalStorageVaultFs", () => {
  const KEY = "test-vault";
  beforeEach(() => localStorage.removeItem(KEY));
  afterEach(() => localStorage.removeItem(KEY));

  it("persists files and empty directories across reloads", async () => {
    const first = createLocalStorageVaultFs(KEY);
    await first.writeText("Space/Root/n.md", "body");
    await first.createDir("Empty");
    // A fresh instance models a page reload reading the same storage key.
    const reloaded = createLocalStorageVaultFs(KEY);
    expect(await reloaded.readText("Space/Root/n.md")).toBe("body");
    expect(await reloaded.readDir("")).toContainEqual({
      name: "Empty",
      relPath: "Empty",
      isDir: true,
    });
  });

  it("starts from an empty vault when the stored blob is corrupt", async () => {
    localStorage.setItem(KEY, "{not json");
    const fs = createLocalStorageVaultFs(KEY);
    expect(await fs.readDir("")).toEqual([]);
  });

  it("tolerates a blob missing the files/dirs keys", async () => {
    localStorage.setItem(KEY, "{}");
    const fs = createLocalStorageVaultFs(KEY);
    expect(await fs.readDir("")).toEqual([]);
  });
});
