import type { Graph } from "../domain/types";

export const DEFAULT_SAVE_DELAY_MS = 250;

export interface DebouncedSaver {
  schedule(graph: Graph): void;
  flush(): Promise<void>;
  dispose(): void;
}

interface DebouncedSaverOptions {
  readonly delayMs?: number;
  readonly onError?: (error: unknown) => void;
}

export function createDebouncedSaver(
  save: (graph: Graph) => Promise<void>,
  options: DebouncedSaverOptions = {},
): DebouncedSaver {
  const delayMs = options.delayMs ?? DEFAULT_SAVE_DELAY_MS;
  const onError = options.onError ?? defaultOnError;

  let pending: Graph | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Chain saves so callers can await all writes that have been issued so far.
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function enqueueSave(graph: Graph): void {
    chain = chain.then(() => save(graph)).catch(onError);
  }

  function schedule(graph: Graph): void {
    if (disposed) {
      return;
    }
    pending = graph;
    clearTimer();
    // The previous timer (if any) is cancelled, so this callback always runs
    // with `graph` as the latest snapshot.
    timer = setTimeout(() => {
      timer = null;
      pending = null;
      enqueueSave(graph);
    }, delayMs);
  }

  async function flush(): Promise<void> {
    clearTimer();
    if (pending !== null) {
      enqueueSave(pending);
      pending = null;
    }
    await chain;
  }

  function dispose(): void {
    disposed = true;
    clearTimer();
    pending = null;
  }

  return { schedule, flush, dispose };
}

function defaultOnError(error: unknown): void {
  // biome-ignore lint/suspicious/noConsole: persistence errors must surface in dev tools — a silent failure here would mask data loss
  console.error("[debounced-saver] save failed", error);
}

/**
 * Flush pending writes when the page is being torn down. Takes a `flush` callback
 * rather than a saver so the caller (the store, which owns the saver) can route it
 * through whatever pre-flush bookkeeping it needs.
 */
export function bindUnloadFlush(flush: () => void): () => void {
  const handler = (): void => {
    flush();
  };
  window.addEventListener("beforeunload", handler);
  window.addEventListener("pagehide", handler);
  return () => {
    window.removeEventListener("beforeunload", handler);
    window.removeEventListener("pagehide", handler);
  };
}
