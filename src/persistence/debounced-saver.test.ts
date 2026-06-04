import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Graph } from "../domain/types";
import { bindUnloadFlush, createDebouncedSaver, DEFAULT_SAVE_DELAY_MS } from "./debounced-saver";

const emptyGraph: Graph = { nodes: [], edges: [] };

function makeGraph(id: string): Graph {
  return {
    nodes: [{ id, text: id, position: { x: 0, y: 0 }, parentId: null }],
    edges: [],
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createDebouncedSaver", () => {
  it("invokes save after the default delay", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save);
    saver.schedule(emptyGraph);

    await vi.advanceTimersByTimeAsync(DEFAULT_SAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(emptyGraph);
  });

  it("collapses rapid scheduling into a single save with the latest snapshot", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, { delayMs: 100 });

    saver.schedule(makeGraph("a"));
    await vi.advanceTimersByTimeAsync(50);
    saver.schedule(makeGraph("b"));
    await vi.advanceTimersByTimeAsync(50);
    saver.schedule(makeGraph("c"));
    await vi.advanceTimersByTimeAsync(100);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(makeGraph("c"));
  });

  it("uses an explicit delayMs when provided", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save, { delayMs: 10 });
    saver.schedule(emptyGraph);
    await vi.advanceTimersByTimeAsync(10);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush writes pending data and resolves once the save settles", async () => {
    let resolveSave: () => void = () => {};
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const saver = createDebouncedSaver(save, { delayMs: 1_000 });

    saver.schedule(makeGraph("pending"));
    const flushed = saver.flush();

    // Save is enqueued via the promise chain — let microtasks run so it fires.
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);

    resolveSave();
    await flushed;
  });

  it("flush resolves immediately when nothing is pending and nothing is in flight", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save);
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("flush awaits an in-flight save kicked off by an earlier scheduled tick", async () => {
    let resolveSave: () => void = () => {};
    const save = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const saver = createDebouncedSaver(save, { delayMs: 5 });

    saver.schedule(makeGraph("first"));
    await vi.advanceTimersByTimeAsync(5);
    expect(save).toHaveBeenCalledTimes(1);

    const flushPromise = saver.flush();
    let resolved = false;
    void flushPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);

    resolveSave();
    await flushPromise;
    expect(resolved).toBe(true);
  });

  it("forwards save errors to the configured onError handler", async () => {
    const failure = new Error("disk full");
    const save = vi.fn().mockRejectedValue(failure);
    const onError = vi.fn();
    const saver = createDebouncedSaver(save, { onError });

    saver.schedule(emptyGraph);
    await vi.advanceTimersByTimeAsync(DEFAULT_SAVE_DELAY_MS);
    await vi.runAllTimersAsync();

    expect(onError).toHaveBeenCalledWith(failure);
  });

  it("logs save errors to console.error by default when no onError is provided", async () => {
    const failure = new Error("disk full");
    const save = vi.fn().mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const saver = createDebouncedSaver(save);

    saver.schedule(emptyGraph);
    await vi.advanceTimersByTimeAsync(DEFAULT_SAVE_DELAY_MS);
    await vi.runAllTimersAsync();

    expect(consoleError).toHaveBeenCalledWith("[debounced-saver] save failed", failure);
  });

  it("dispose stops the scheduled timer and ignores subsequent schedule calls", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const saver = createDebouncedSaver(save);

    saver.schedule(emptyGraph);
    saver.dispose();
    await vi.advanceTimersByTimeAsync(DEFAULT_SAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();

    saver.schedule(emptyGraph);
    await vi.advanceTimersByTimeAsync(DEFAULT_SAVE_DELAY_MS * 2);
    expect(save).not.toHaveBeenCalled();
  });
});

describe("bindUnloadFlush", () => {
  it("flushes on beforeunload and pagehide, and the unbind removes both listeners", () => {
    const flush = vi.fn();
    const unbind = bindUnloadFlush(flush);

    window.dispatchEvent(new Event("beforeunload"));
    expect(flush).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(2);

    unbind();
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
