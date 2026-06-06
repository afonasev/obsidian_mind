import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** One entry of a vault directory tree, as serialized by the Rust `fs_read_dir`. */
export interface FsEntry {
  readonly name: string;
  readonly relPath: string;
  readonly isDir: boolean;
}

/** Kinds of the Rust `AppError` enum, serialized as a discriminated `{ kind }` object. */
export type VaultFsErrorKind = "PathEscape" | "NotFound" | "Io" | "NotUtf8" | "InvalidVaultRoot";

/**
 * Typed error surfaced by a vault filesystem command. Either a confined-FS failure
 * mapped from the Rust `AppError` (`fs` source), or the web-degradation signal
 * (`noFilesystem`) raised when the app runs outside Tauri.
 */
export class VaultFsError extends Error {
  readonly source: "fs" | "noFilesystem";
  readonly kind: VaultFsErrorKind | null;

  constructor(source: "fs" | "noFilesystem", kind: VaultFsErrorKind | null, message: string) {
    super(message);
    this.name = "VaultFsError";
    this.source = source;
    this.kind = kind;
  }
}

/**
 * True when running inside a Tauri webview. Detected via the injected
 * `__TAURI_INTERNALS__` global so that importing this module never throws in a
 * plain browser (web build / Playwright), where that global is absent.
 */
export function isTauri(): boolean {
  // The app only ever runs in a browser/webview, so `window` is always present;
  // no SSR guard is needed (it would be an untestable, dead branch otherwise).
  const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  return internals !== undefined;
}

/** Shape of the serialized Rust `AppError` after it crosses the IPC boundary. */
function asVaultFsError(reason: unknown): VaultFsError {
  if (typeof reason === "object" && reason !== null && "kind" in reason) {
    const kind = (reason as { kind: unknown }).kind;
    if (isVaultFsErrorKind(kind)) {
      return new VaultFsError("fs", kind, `vault fs error: ${kind}`);
    }
  }
  return new VaultFsError("fs", null, "vault fs error: unknown");
}

function isVaultFsErrorKind(value: unknown): value is VaultFsErrorKind {
  return (
    value === "PathEscape" ||
    value === "NotFound" ||
    value === "Io" ||
    value === "NotUtf8" ||
    value === "InvalidVaultRoot"
  );
}

/**
 * Invoke a confined-FS command, mapping the Rust `Err` path to a typed `VaultFsError`.
 * Outside Tauri the command is never called: we reject with the `noFilesystem` signal
 * so callers stay in the "no vault" state instead of crashing the web build.
 */
async function invokeFs<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new VaultFsError("noFilesystem", null, "filesystem unavailable outside Tauri");
  }
  try {
    return await invoke<T>(cmd, args);
  } catch (reason) {
    throw asVaultFsError(reason);
  }
}

export function fsReadDir(vaultRoot: string, relPath: string): Promise<readonly FsEntry[]> {
  return invokeFs<readonly FsEntry[]>("fs_read_dir", { vaultRoot, relPath });
}

export function fsReadText(vaultRoot: string, relPath: string): Promise<string> {
  return invokeFs<string>("fs_read_text", { vaultRoot, relPath });
}

export function fsWriteText(vaultRoot: string, relPath: string, contents: string): Promise<void> {
  return invokeFs<void>("fs_write_text", { vaultRoot, relPath, contents });
}

export function fsCreateDir(vaultRoot: string, relPath: string): Promise<void> {
  return invokeFs<void>("fs_create_dir", { vaultRoot, relPath });
}

export function fsRemove(vaultRoot: string, relPath: string): Promise<void> {
  return invokeFs<void>("fs_remove", { vaultRoot, relPath });
}

export function fsRename(vaultRoot: string, fromRel: string, toRel: string): Promise<void> {
  return invokeFs<void>("fs_rename", { vaultRoot, fromRel, toRel });
}

/**
 * Open the system folder picker and return the chosen vault's absolute path, or
 * null when the user cancels. Outside Tauri there is no picker, so we return null
 * (the app stays in the "no vault" state) rather than throwing.
 */
export async function selectVaultDirectory(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}
