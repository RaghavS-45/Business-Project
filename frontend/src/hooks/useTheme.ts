import { useCallback, useSyncExternalStore } from "react";

/**
 * Light / dark theme, remembered per browser.
 *
 * index.html applies the saved theme before React loads (no flash);
 * this hook keeps the toggle and <html class="dark"> in sync afterwards.
 */
export type Theme = "light" | "dark";
export type Palette = "peacock" | "lagoon" | "midnight";

export const PALETTES: Array<{ id: Palette; name: string; swatches: string[] }> = [
  { id: "peacock", name: "Peacock", swatches: ["oklch(0.36 0.1 215)", "oklch(0.55 0.13 195)", "oklch(0.78 0.16 70)"] },
  { id: "lagoon", name: "Lagoon", swatches: ["oklch(0.33 0.1 240)", "oklch(0.56 0.14 225)", "oklch(0.72 0.17 30)"] },
  { id: "midnight", name: "Midnight", swatches: ["oklch(0.25 0.018 250)", "oklch(0.5 0.13 145)", "oklch(0.89 0.21 128)"] },
];

const STORAGE_KEY = "theme";
const PALETTE_KEY = "palette";
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
    ?.setAttribute("content", theme === "dark" ? "#14211c" : "#f6f1e7");
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

function readPalette(): Palette {
  const p = document.documentElement.dataset.palette as Palette | undefined;
  return p && PALETTES.some((x) => x.id === p) ? p : "peacock";
}

function applyPalette(palette: Palette) {
  const root = document.documentElement;
  root.classList.add("theme-switching");
  root.dataset.palette = palette;
  try {
    localStorage.setItem(PALETTE_KEY, palette);
  } catch {
    /* private mode */
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
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);
  const palette = useSyncExternalStore(subscribe, readPalette, () => "peacock" as Palette);
  const toggle = useCallback(
    () => applyTheme(readTheme() === "dark" ? "light" : "dark"),
    []
  );
  return { theme, setTheme: applyTheme, toggle, palette, setPalette: applyPalette };
}
