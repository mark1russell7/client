/**
 * The theme of the site: light, dark, or the system setting. One store, so the button of the
 * header and the command palette change the same theme.
 */

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const theme = localStorage.getItem("theme");
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system";
  }
}

let current: Theme = typeof window === "undefined" ? "system" : read();

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset["theme"];
  else root.dataset["theme"] = theme;
  try {
    if (theme === "system") localStorage.removeItem("theme");
    else localStorage.setItem("theme", theme);
  } catch {
    // The theme stays for this page only
  }
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  apply(theme);
  for (const listener of listeners) listener();
}

/** The next theme of the cycle: system, light, dark, system. */
export const NEXT_THEME: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

export const THEME_LABEL: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

export function cycleTheme(): Theme {
  const next = NEXT_THEME[current];
  setTheme(next);
  return next;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The theme, as React state. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "system");
}
