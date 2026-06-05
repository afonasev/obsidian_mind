// MRU-список последних использованных цветов узла (ключи пресетов и/или сырые
// #rrggbb). Хранится под отдельным ключом localStorage — это глобальная UI-
// преференция, общая для всех пространств, вне графа и вне undo/redo.

// Собственный ключ хранения, отличный от THEME_STORAGE_KEY.
export const RECENT_COLORS_KEY = "obsidian-mind-recent-colors";

export const MAX_RECENT_COLORS = 5;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Сохранённый список последних цветов, или [] если ничего/мусор. */
export function readRecentColors(): readonly string[] {
  const raw = localStorage.getItem(RECENT_COLORS_KEY);
  if (raw === null) {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Невалидный JSON в хранилище — трактуем как пустой список, не падаем.
    return [];
  }
  return isStringArray(parsed) ? parsed.slice(0, MAX_RECENT_COLORS) : [];
}

/**
 * Помещает цвет в начало MRU: убирает прежнее вхождение (dedup), unshift, срез
 * до MAX_RECENT_COLORS. Персистит и возвращает новый список.
 */
export function applyRecentColor(color: string): readonly string[] {
  const previous = readRecentColors();
  const next = [color, ...previous.filter((item) => item !== color)].slice(0, MAX_RECENT_COLORS);
  localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next));
  return next;
}
