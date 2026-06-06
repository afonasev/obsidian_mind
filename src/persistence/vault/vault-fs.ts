import {
  type FsEntry,
  fsCreateDir,
  fsReadDir,
  fsReadText,
  fsRemove,
  fsRename,
  fsWriteText,
  VaultFsError,
} from "../../vault/fs-bridge";

/**
 * Low-level filesystem surface of one open vault, mirroring the `vault-access`
 * commands but with the vault root already bound. `VaultStore` composes the pure
 * graph↔files mapping over this port; swapping the FS adapter for the in-memory
 * one gives the same behaviour without a real filesystem (design Решение 6).
 *
 * `readDir` is recursive and returns vault-root-relative paths, matching the Rust
 * `fs_read_dir`.
 */
export interface VaultFs {
  readDir(relPath: string): Promise<readonly FsEntry[]>;
  readText(relPath: string): Promise<string>;
  writeText(relPath: string, contents: string): Promise<void>;
  createDir(relPath: string): Promise<void>;
  remove(relPath: string): Promise<void>;
  rename(fromRel: string, toRel: string): Promise<void>;
}

/** FS adapter: bind a concrete vault root to the `vault-access` command bridge. */
export function createFsVaultFs(vaultRoot: string): VaultFs {
  return {
    readDir: (rel) => fsReadDir(vaultRoot, rel),
    readText: (rel) => fsReadText(vaultRoot, rel),
    writeText: (rel, contents) => fsWriteText(vaultRoot, rel, contents),
    createDir: (rel) => fsCreateDir(vaultRoot, rel),
    remove: (rel) => fsRemove(vaultRoot, rel),
    rename: (from, to) => fsRename(vaultRoot, from, to),
  };
}

const notFound = (): VaultFsError => new VaultFsError("fs", "NotFound", "path not found");

/** Last path segment (`a/b/c` → `c`), defined for any non-empty path. */
function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

interface FsState {
  readonly files: Map<string, string>;
  readonly dirs: Set<string>;
}

/**
 * Shared `VaultFs` core over an in-memory `{files, dirs}` state. `persist` is
 * called after every mutation, letting the localStorage adapter flush while the
 * pure in-memory adapter uses a no-op. Mirrors the FS adapter's semantics:
 * recursive `readDir`, parent-less `writeText`, recursive `remove`, `NotFound` on
 * misses.
 */
function makeCore(state: FsState, persist: () => void): VaultFs {
  const { files, dirs } = state;

  const norm = (rel: string): string => rel.replace(/^\/+|\/+$/g, "");

  function addParents(path: string): void {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      dirs.add(parts.slice(0, i).join("/"));
    }
  }

  // A path exists iff it is a known file or directory. Every file's container is
  // registered in `dirs` (addParents), so there is no "file under an unknown dir".
  const exists = (path: string): boolean => dirs.has(path) || files.has(path);

  return {
    readDir(rel) {
      const path = norm(rel);
      if (path !== "" && !exists(path)) {
        return Promise.reject(notFound());
      }
      const prefix = path === "" ? "" : `${path}/`;
      const out: FsEntry[] = [];
      const seen = new Set<string>();
      const consider = (p: string, isDir: boolean): void => {
        if (p !== "" && p.startsWith(prefix) && p !== path && !seen.has(p)) {
          seen.add(p);
          out.push({ name: baseName(p), relPath: p, isDir });
        }
      };
      for (const dir of dirs) {
        consider(dir, true);
      }
      for (const file of files.keys()) {
        consider(file, false);
      }
      return Promise.resolve(out);
    },

    readText(rel) {
      const content = files.get(norm(rel));
      return content === undefined ? Promise.reject(notFound()) : Promise.resolve(content);
    },

    writeText(rel, contents) {
      const path = norm(rel);
      files.set(path, contents);
      addParents(path);
      persist();
      return Promise.resolve();
    },

    createDir(rel) {
      addParents(`${norm(rel)}/_`);
      persist();
      return Promise.resolve();
    },

    remove(rel) {
      const path = norm(rel);
      if (!exists(path)) {
        return Promise.reject(notFound());
      }
      files.delete(path);
      dirs.delete(path);
      for (const file of [...files.keys()]) {
        if (file.startsWith(`${path}/`)) {
          files.delete(file);
        }
      }
      for (const dir of [...dirs]) {
        if (dir.startsWith(`${path}/`)) {
          dirs.delete(dir);
        }
      }
      persist();
      return Promise.resolve();
    },

    rename(fromRel, toRel) {
      const from = norm(fromRel);
      const to = norm(toRel);
      if (!exists(from)) {
        return Promise.reject(notFound());
      }
      const moveKey = (key: string): string =>
        key === from ? to : `${to}${key.slice(from.length)}`;
      for (const [key, content] of [...files.entries()]) {
        if (key === from || key.startsWith(`${from}/`)) {
          files.delete(key);
          files.set(moveKey(key), content);
        }
      }
      for (const dir of [...dirs]) {
        if (dir === from || dir.startsWith(`${from}/`)) {
          dirs.delete(dir);
          dirs.add(moveKey(dir));
        }
      }
      addParents(to);
      persist();
      return Promise.resolve();
    },
  };
}

function stateFromFiles(seed: Record<string, string>): FsState {
  const state: FsState = { files: new Map(), dirs: new Set() };
  for (const [path, content] of Object.entries(seed)) {
    const key = path.replace(/^\/+|\/+$/g, "");
    state.files.set(key, content);
    const parts = key.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      state.dirs.add(parts.slice(0, i).join("/"));
    }
  }
  return state;
}

/** In-memory adapter with a snapshot hook, for unit tests and the web build. */
export interface MemoryVaultFs extends VaultFs {
  /** Current path→content map (files only), for assertions/persistence. */
  snapshot(): Map<string, string>;
}

/** In-memory `VaultFs`: a path→content map plus explicit directories. */
export function createMemoryVaultFs(seed: Record<string, string> = {}): MemoryVaultFs {
  const state = stateFromFiles(seed);
  return { ...makeCore(state, () => {}), snapshot: () => new Map(state.files) };
}

/**
 * Web-build `VaultFs` persisted to `localStorage` (the web preview/e2e build has
 * no real filesystem, but content must survive a reload). The whole vault is one
 * JSON blob; files and directories are both kept so empty folders also persist.
 */
export function createLocalStorageVaultFs(storageKey: string): VaultFs {
  const state: FsState = { files: new Map(), dirs: new Set() };
  const raw = localStorage.getItem(storageKey);
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw) as { files?: [string, string][]; dirs?: string[] };
      for (const [k, v] of parsed.files ?? []) {
        state.files.set(k, v);
      }
      for (const d of parsed.dirs ?? []) {
        state.dirs.add(d);
      }
    } catch {
      // A corrupt blob starts from an empty vault rather than crashing the app.
    }
  }
  const persist = (): void => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ files: [...state.files], dirs: [...state.dirs] }),
    );
  };
  return makeCore(state, persist);
}
