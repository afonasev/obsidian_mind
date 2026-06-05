import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRecentColor,
  MAX_RECENT_COLORS,
  RECENT_COLORS_KEY,
  readRecentColors,
} from "./recent-colors";

describe("recent-colors", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("readRecentColors", () => {
    it("returns an empty list when nothing is stored", () => {
      expect(readRecentColors()).toEqual([]);
    });

    it("returns an empty list when the stored value is not valid JSON", () => {
      localStorage.setItem(RECENT_COLORS_KEY, "{not json");
      expect(readRecentColors()).toEqual([]);
    });

    it("returns an empty list when the stored JSON is not an array of strings", () => {
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify([1, "amber"]));
      expect(readRecentColors()).toEqual([]);
    });

    it("reads the stored list of preset keys and hex values", () => {
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(["amber", "#ff0000"]));
      expect(readRecentColors()).toEqual(["amber", "#ff0000"]);
    });

    it("slices an over-long stored list down to the maximum", () => {
      localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(["a", "b", "c", "d", "e", "f", "g"]));
      expect(readRecentColors()).toHaveLength(MAX_RECENT_COLORS);
    });
  });

  describe("applyRecentColor", () => {
    it("puts a newly applied color at the front", () => {
      applyRecentColor("amber");
      const list = applyRecentColor("#00ff00");
      expect(list).toEqual(["#00ff00", "amber"]);
    });

    it("moves an existing color to the front without duplicating it", () => {
      applyRecentColor("amber");
      applyRecentColor("blue");
      const list = applyRecentColor("amber");
      expect(list).toEqual(["amber", "blue"]);
    });

    it("never lets the list exceed the maximum length", () => {
      for (const color of ["a", "b", "c", "d", "e", "f"]) {
        applyRecentColor(color);
      }
      expect(applyRecentColor("g")).toHaveLength(MAX_RECENT_COLORS);
    });

    it("survives a restart: a fresh read returns the same order", () => {
      applyRecentColor("amber");
      applyRecentColor("blue");
      expect(readRecentColors()).toEqual(["blue", "amber"]);
    });
  });
});
