import { serializeSpaces } from "../../domain/vault/mind-format";
import type { RawRoot, SpaceMeta } from "../../domain/vault/model";
import {
  type FileDiff,
  mergeSpaces,
  type ReadSpaceResult,
  readSpace as readSpaceGraph,
} from "../../domain/vault/space-mapping";
import { type FsEntry, VaultFsError } from "../../vault/fs-bridge";
import type { VaultFs } from "./vault-fs";

/**
 * The vault content port: load spaces and a space's graph, apply a file diff, and
 * manage space folders. Composes the pure mapping (domain) over a `VaultFs`, so FS
 * and in-memory adapters share one implementation and behave identically.
 */
export interface VaultStore {
  loadSpaces(): Promise<SpaceMeta[]>;
  saveSpaces(spaces: readonly SpaceMeta[]): Promise<void>;
  readSpace(space: SpaceMeta): Promise<ReadSpaceResult>;
  applyDiff(diff: FileDiff): Promise<void>;
  createSpace(name: string): Promise<void>;
  renameSpace(from: string, to: string): Promise<void>;
  deleteSpace(name: string): Promise<void>;
}

const MIND = ".mind";

export function createVaultStore(fs: VaultFs): VaultStore {
  async function readTextOrNull(rel: string): Promise<string | null> {
    try {
      return await fs.readText(rel);
    } catch (error) {
      // A missing verstka file is normal (durable truth is the folders/notes);
      // only a real IO/escape error should propagate.
      if (error instanceof VaultFsError && error.kind === "NotFound") {
        return null;
      }
      throw error;
    }
  }

  /** Read a directory tree, treating a missing directory as empty. */
  async function readDirOrEmpty(rel: string): Promise<readonly FsEntry[]> {
    try {
      return await fs.readDir(rel);
    } catch (error) {
      if (error instanceof VaultFsError && error.kind === "NotFound") {
        return [];
      }
      throw error;
    }
  }

  /** Immediate subdirectory names of `prefix`'s tree (recursive entries filtered). */
  function immediateDirs(entries: readonly FsEntry[], prefix: string): string[] {
    return entries
      .filter((e) => e.isDir && !e.relPath.slice(prefix.length).includes("/"))
      .map((e) => e.name);
  }

  /** Run `op`, swallowing only a NotFound (the target was already gone). */
  async function ignoreMissing(op: () => Promise<void>): Promise<void> {
    try {
      await op();
    } catch (error) {
      if (!(error instanceof VaultFsError && error.kind === "NotFound")) {
        throw error;
      }
    }
  }

  return {
    async loadSpaces() {
      const yaml = await readTextOrNull(`${MIND}/spaces.yaml`);
      const entries = await fs.readDir("");
      const folders = entries
        .filter((e) => e.isDir && !e.relPath.includes("/") && !e.name.startsWith("."))
        .map((e) => e.name);
      return mergeSpaces(yaml, folders);
    },

    async saveSpaces(spaces) {
      await fs.createDir(MIND);
      await fs.writeText(`${MIND}/spaces.yaml`, serializeSpaces(spaces));
    },

    async readSpace(space) {
      const spaceYaml = await readTextOrNull(`${MIND}/${space.name}/space.yaml`);
      const plainPrefix = `${space.name}/`;
      const mindPrefix = `${MIND}/${space.name}/`;
      const plain = await readDirOrEmpty(space.name);
      const mind = await readDirOrEmpty(`${MIND}/${space.name}`);
      // Discover root folders from both the plain space folder (notes) and `.mind/`
      // (verstka): a root with only bodyless nodes has no plain folder at all.
      const folders = new Set([
        ...immediateDirs(plain, plainPrefix),
        ...immediateDirs(mind, mindPrefix),
      ]);
      const roots: RawRoot[] = [];
      for (const folder of folders) {
        const rootYaml = await readTextOrNull(`${MIND}/${space.name}/${folder}/root.yaml`);
        const notePrefix = `${space.name}/${folder}/`;
        const notes = await Promise.all(
          plain
            .filter(
              (e) =>
                !e.isDir &&
                e.relPath.startsWith(notePrefix) &&
                !e.relPath.slice(notePrefix.length).includes("/") &&
                e.name.endsWith(".md"),
            )
            .map(async (e) => ({ file: e.name, text: await fs.readText(e.relPath) })),
        );
        roots.push({ folder, rootYaml, notes });
      }
      return readSpaceGraph({ folder: space.name, spaceYaml, roots });
    },

    async applyDiff(diff) {
      for (const [path, content] of diff.writes) {
        const parent = path.slice(0, path.lastIndexOf("/"));
        await fs.createDir(parent);
        // Write to a temp file and rename into place so a crash mid-write never
        // leaves a half-written (corrupt) verstka file behind (design Решение 7).
        const tmp = `${path}.tmp`;
        await fs.writeText(tmp, content);
        await fs.rename(tmp, path);
      }
      for (const path of diff.deletes) {
        await ignoreMissing(() => fs.remove(path));
      }
    },

    createSpace(name) {
      return fs.createDir(name);
    },

    async renameSpace(from, to) {
      // Either folder may be absent: a bodyless space has no plain folder (only
      // `.mind/`), and a space with no saved layout has no `.mind/` folder yet.
      await ignoreMissing(() => fs.rename(from, to));
      await ignoreMissing(() => fs.rename(`${MIND}/${from}`, `${MIND}/${to}`));
    },

    async deleteSpace(name) {
      await ignoreMissing(() => fs.remove(name));
      await ignoreMissing(() => fs.remove(`${MIND}/${name}`));
    },
  };
}
