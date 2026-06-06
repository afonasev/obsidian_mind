import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fsCreateDir,
  fsReadDir,
  fsReadText,
  fsRemove,
  fsRename,
  fsWriteText,
  isTauri,
  selectVaultDirectory,
  VaultFsError,
} from "./fs-bridge";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const openMock = vi.mocked(open);

/** Inject / clear the global Tauri marker that `isTauri()` probes. */
function setTauri(present: boolean): void {
  const w = window as unknown as Record<string, unknown>;
  if (present) {
    w.__TAURI_INTERNALS__ = {};
  } else {
    delete w.__TAURI_INTERNALS__;
  }
}

describe("isTauri", () => {
  afterEach(() => {
    setTauri(false);
  });

  it("returns false when the Tauri global is absent", () => {
    setTauri(false);
    expect(isTauri()).toBe(false);
  });

  it("returns true when the Tauri global is present", () => {
    setTauri(true);
    expect(isTauri()).toBe(true);
  });
});

describe("fs-bridge wrappers in Tauri", () => {
  beforeEach(() => {
    setTauri(true);
    invokeMock.mockReset();
  });

  afterEach(() => {
    setTauri(false);
  });

  it("maps fs_read_dir args and returns the entry tree", async () => {
    const tree = [{ name: "a.md", relPath: "a.md", isDir: false }];
    invokeMock.mockResolvedValueOnce(tree);
    const result = await fsReadDir("/vault", "sub");
    expect(invokeMock).toHaveBeenCalledWith("fs_read_dir", {
      vaultRoot: "/vault",
      relPath: "sub",
    });
    expect(result).toEqual(tree);
  });

  it("passes vaultRoot/relPath to fs_read_text and returns the contents", async () => {
    invokeMock.mockResolvedValueOnce("hello");
    const result = await fsReadText("/vault", "note.md");
    expect(invokeMock).toHaveBeenCalledWith("fs_read_text", {
      vaultRoot: "/vault",
      relPath: "note.md",
    });
    expect(result).toBe("hello");
  });

  it("passes contents to fs_write_text", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await fsWriteText("/vault", "note.md", "body");
    expect(invokeMock).toHaveBeenCalledWith("fs_write_text", {
      vaultRoot: "/vault",
      relPath: "note.md",
      contents: "body",
    });
  });

  it("invokes fs_create_dir", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await fsCreateDir("/vault", "dir");
    expect(invokeMock).toHaveBeenCalledWith("fs_create_dir", {
      vaultRoot: "/vault",
      relPath: "dir",
    });
  });

  it("invokes fs_remove", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await fsRemove("/vault", "dir");
    expect(invokeMock).toHaveBeenCalledWith("fs_remove", {
      vaultRoot: "/vault",
      relPath: "dir",
    });
  });

  it("maps from/to paths for fs_rename", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    await fsRename("/vault", "old", "new");
    expect(invokeMock).toHaveBeenCalledWith("fs_rename", {
      vaultRoot: "/vault",
      fromRel: "old",
      toRel: "new",
    });
  });

  it("surfaces a serialized Rust AppError as a typed VaultFsError", async () => {
    invokeMock.mockRejectedValueOnce({ kind: "PathEscape" });
    const error = await fsReadText("/vault", "../secret").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultFsError);
    expect(error).toMatchObject({ source: "fs", kind: "PathEscape" });
  });

  it("falls back to a null kind when the rejection is not a known AppError shape", async () => {
    invokeMock.mockRejectedValueOnce("boom");
    const error = await fsReadText("/vault", "x").catch((e: unknown) => e);
    expect(error).toMatchObject({ source: "fs", kind: null });
  });

  it("falls back to a null kind when the rejection has an unknown kind", async () => {
    invokeMock.mockRejectedValueOnce({ kind: "Mystery" });
    const error = await fsReadText("/vault", "x").catch((e: unknown) => e);
    expect(error).toMatchObject({ source: "fs", kind: null });
  });
});

describe("fs-bridge degradation without Tauri", () => {
  beforeEach(() => {
    setTauri(false);
    invokeMock.mockReset();
  });

  it("rejects with the noFilesystem signal and never calls invoke", async () => {
    const error = await fsReadDir("/vault", "").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(VaultFsError);
    expect(error).toMatchObject({ source: "noFilesystem", kind: null });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("selectVaultDirectory", () => {
  beforeEach(() => {
    openMock.mockReset();
  });

  afterEach(() => {
    setTauri(false);
  });

  it("returns the absolute path chosen in the picker", async () => {
    setTauri(true);
    openMock.mockResolvedValueOnce("/chosen/vault");
    expect(await selectVaultDirectory()).toBe("/chosen/vault");
    expect(openMock).toHaveBeenCalledWith({ directory: true, multiple: false });
  });

  it("returns null when the user cancels the picker", async () => {
    setTauri(true);
    openMock.mockResolvedValueOnce(null);
    expect(await selectVaultDirectory()).toBeNull();
  });

  it("returns null without opening a picker outside Tauri", async () => {
    setTauri(false);
    expect(await selectVaultDirectory()).toBeNull();
    expect(openMock).not.toHaveBeenCalled();
  });
});
