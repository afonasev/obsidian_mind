import { describe, expect, it } from "vitest";
import { isPresetKey, PRESET_KEYS } from "./presets";

describe("isPresetKey", () => {
  it("возвращает true для каждого ключа реестра", () => {
    for (const key of PRESET_KEYS) {
      expect(isPresetKey(key)).toBe(true);
    }
  });

  it("возвращает false для сырого #rrggbb", () => {
    expect(isPresetKey("#ff8800")).toBe(false);
  });

  it("возвращает false для неизвестной строки", () => {
    expect(isPresetKey("chartreuse")).toBe(false);
  });
});
