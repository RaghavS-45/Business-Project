import { useCallback, useSyncExternalStore } from "react";

/**
 * Light / dark theme, remembered per browser.
 *
 * index.html applies the saved theme before React loads (no flash);
 * this hook keeps the toggle and <html class="dark"> in sync afterwards.
 */
export type Theme = "light" | "dark";

const STORAGE_KEY = "theme";
const listeners = new Set<() => void>();

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // Skip colour transitions for the switch itself so the page doesn't fade
  root.classList.add("theme-switching");
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#0a0a0a" : "#ffffff");
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode — theme still applies for this visit */
  }
  requestAnimationFrame(() =>
    requestAnimationFrame(() => root.classList.remove("theme-switching"))
  );
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark" as Theme);
  const toggle = useCallback(
    () => applyTheme(readTheme() === "dark" ? "light" : "dark"),
    []
  );
  return { theme, setTheme: applyTheme, toggle };
}
