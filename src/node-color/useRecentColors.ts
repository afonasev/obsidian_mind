import { useSyncExternalStore } from "react";
import { applyRecentColor, readRecentColors } from "./recent-colors";

// Крошечный стор над MRU-списком в localStorage (по образцу useTheme): источник
// правды — localStorage, React подписывается на наш notifier.
const listeners = new Set<() => void>();

// useSyncExternalStore зацикливается, если getSnapshot возвращает новый массив
// при каждом вызове, — кэшируем последний список и меняем ссылку только когда
// данные реально поменялись (через apply).
let cached: readonly string[] = readRecentColors();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly string[] {
  return cached;
}

function apply(color: string): void {
  cached = applyRecentColor(color);
  for (const listener of listeners) {
    listener();
  }
}

export interface UseRecentColorsResult {
  readonly recent: readonly string[];
  readonly apply: (color: string) => void;
}

/** Текущий MRU-список последних цветов плюс `apply`, перерисовывающий подписчиков. */
export function useRecentColors(): UseRecentColorsResult {
  const recent = useSyncExternalStore(subscribe, getSnapshot);
  return { recent, apply };
}
