import { useEffect, useCallback } from "react";

interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Keyboard shortcuts hook for the POS terminal.
 * Registers global key handlers and cleans them up on unmount.
 * Only fires if the user is NOT focused on an input/textarea/select.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't fire shortcuts when typing in form fields
      const target = event.target as HTMLElement;
      const isEditable =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Allow F-keys and Escape even in inputs
      const isFunctionKey = event.key.startsWith("F") && event.key.length <= 3;
      const isEscape = event.key === "Escape";

      if (isEditable && !isFunctionKey && !isEscape) return;

      const handler = shortcuts[event.key];
      if (handler) {
        event.preventDefault();
        handler();
      }
    },
    [shortcuts, enabled]
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown, enabled]);
}
