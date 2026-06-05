// Реестр ключей заготовленных цветов (пресетов). Единый источник имён для сетки
// выбора, рендера заливки и токенов --node-fill-<key> в theme.css — при
// добавлении пресета правим и этот список, и оба места в theme.css (контракт).
// 17 ключей в порядке отображения сетки (6 колонок: сброс + 5 в первом ряду,
// затем два ряда по 6). Спектр + два нейтральных (brown, gray).
export const PRESET_KEYS = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "magenta",
  "pink",
  "brown",
  "gray",
] as const;

export type PresetKey = (typeof PRESET_KEYS)[number];

// Проверка членства: значение — ключ пресета? Кастомные цвета всегда начинаются
// с "#", пресеты — никогда, пересечений нет.
export function isPresetKey(value: string): value is PresetKey {
  return (PRESET_KEYS as readonly string[]).includes(value);
}
