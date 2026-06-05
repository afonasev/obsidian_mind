import { useSyncExternalStore } from "react";
import { applyTheme, persistTheme, resolveInitialTheme, type Theme } from "./theme";

// Tiny store around the document's `data-theme` attribute. The attribute (set by
// the index.html inline script before paint) is the single source of truth; React
// subscribes to our notifier rather than mutating its own copy of the theme.
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  // Fall back to the resolved initial theme if the attribute is somehow unset
  // (e.g. the inline script did not run) — keeps the snapshot a valid Theme.
  const current = document.documentElement.dataset.theme;
  return current === "light" || current === "dark" ? current : resolveInitialTheme();
}

function setTheme(theme: Theme): void {
  persistTheme(theme);
  applyTheme(theme);
  for (const listener of listeners) {
    listener();
  }
}

export interface UseThemeResult {
  readonly theme: Theme;
  readonly toggle: () => void;
}

/** Current theme plus a `toggle` that persists the choice and re-renders subscribers. */
export function useTheme(): UseThemeResult {
  const theme = useSyncExternalStore(subscribe, getSnapshot);
  const toggle = (): void => {
    setTheme(theme === "dark" ? "light" : "dark");
  };
  return { theme, toggle };
}
