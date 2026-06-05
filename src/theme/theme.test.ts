import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  persistTheme,
  readStoredTheme,
  resolveInitialTheme,
  THEME_STORAGE_KEY,
} from "./theme";

// jsdom has no matchMedia — stub it so the system-preference branch is testable.
function stubSystemPrefersDark(prefersDark: boolean): void {
  window.matchMedia = vi
    .fn()
    .mockReturnValue({ matches: prefersDark }) as unknown as typeof matchMedia;
}

describe("theme persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("readStoredTheme", () => {
    it("returns the stored value when it is a valid theme", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "dark");
      expect(readStoredTheme()).toBe("dark");
    });

    it("returns null when nothing is stored", () => {
      expect(readStoredTheme()).toBeNull();
    });

    it("returns null when the stored value is not a known theme", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "sepia");
      expect(readStoredTheme()).toBeNull();
    });
  });

  it("persistTheme writes the choice under the fixed key", () => {
    persistTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("applyTheme sets the data-theme attribute on the document root", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  describe("resolveInitialTheme", () => {
    it("prefers the stored choice over the system preference", () => {
      localStorage.setItem(THEME_STORAGE_KEY, "light");
      stubSystemPrefersDark(true);
      expect(resolveInitialTheme()).toBe("light");
    });

    it("falls back to the system dark preference when nothing is stored", () => {
      stubSystemPrefersDark(true);
      expect(resolveInitialTheme()).toBe("dark");
    });

    it("falls back to light when nothing is stored and the system prefers light", () => {
      stubSystemPrefersDark(false);
      expect(resolveInitialTheme()).toBe("light");
    });
  });
});
