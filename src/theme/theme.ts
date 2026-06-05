// Theme persistence and initial-theme resolution.
//
// NOTE: the same selection rule (stored ?? prefers-color-scheme) is duplicated by
// an inline <script> in index.html so the correct `data-theme` is set before the
// bundle loads (anti-flash). Keep both in sync: same storage key, same values.

export type Theme = "light" | "dark";

// Single fixed key for the user's theme choice in localStorage. Shared contract
// with the inline anti-flash script in index.html.
export const THEME_STORAGE_KEY = "obsidian-mind-theme";

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark";
}

/** The user's saved theme, or null if none/invalid was stored. */
export function readStoredTheme(): Theme | null {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  return isTheme(stored) ? stored : null;
}

/** Persist the user's theme choice. */
export function persistTheme(theme: Theme): void {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/** Write the active theme onto the document root so CSS variables react. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** The system's preferred theme via prefers-color-scheme (light when unknown). */
function systemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Initial theme: the stored choice if valid, otherwise the system preference. */
export function resolveInitialTheme(): Theme {
  return readStoredTheme() ?? systemTheme();
}
