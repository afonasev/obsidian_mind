import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEME_STORAGE_KEY } from "./theme";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads the current theme from the document's data-theme attribute", () => {
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("toggle flips the theme, sets data-theme and persists the choice", () => {
    document.documentElement.dataset.theme = "light";
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggle();
    });

    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("the persisted choice survives a restart (a fresh hook re-reads it)", () => {
    document.documentElement.dataset.theme = "light";
    const first = renderHook(() => useTheme());
    act(() => {
      first.result.current.toggle();
    });
    first.unmount();

    // Re-mounting reads the attribute the toggle left behind — the choice persists.
    const second = renderHook(() => useTheme());
    expect(second.result.current.theme).toBe("dark");
  });

  it("toggle from dark switches back to light", () => {
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggle();
    });

    expect(result.current.theme).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("falls back to the system preference when the attribute is unset", () => {
    // No data-theme attribute → getSnapshot resolves via prefers-color-scheme.
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof matchMedia;
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });
});
