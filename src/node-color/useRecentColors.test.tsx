import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { RECENT_COLORS_KEY } from "./recent-colors";
import { useRecentColors } from "./useRecentColors";

describe("useRecentColors", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("exposes the current recent list", () => {
    const { result } = renderHook(() => useRecentColors());
    expect(result.current.recent).toEqual(expect.any(Array));
  });

  it("apply prepends the color, persists it and re-renders subscribers", () => {
    const { result } = renderHook(() => useRecentColors());

    act(() => {
      result.current.apply("amber");
    });

    expect(result.current.recent[0]).toBe("amber");
    expect(localStorage.getItem(RECENT_COLORS_KEY)).toContain("amber");
  });

  it("returns a referentially stable snapshot between notifications", () => {
    const { result, rerender } = renderHook(() => useRecentColors());

    act(() => {
      result.current.apply("blue");
    });
    const afterApply = result.current.recent;

    // A render without any apply must reuse the same array reference, otherwise
    // useSyncExternalStore would loop on a fresh value each call.
    rerender();
    expect(result.current.recent).toBe(afterApply);
  });
});
