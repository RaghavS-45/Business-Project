import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";

// ─── Browser API Polyfills for jsdom ──────────────────────
// Radix ScrollArea uses ResizeObserver which jsdom doesn't provide
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    private callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Radix components use pointer events not available in jsdom
if (typeof Element.prototype.hasPointerCapture === "undefined") {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}

// scrollIntoView is not implemented in jsdom
if (typeof Element.prototype.scrollIntoView === "undefined") {
  Element.prototype.scrollIntoView = () => {};
}

// ─── MSW Server ───────────────────────────────────────────
export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
  // Reset Zustand stores by clearing localStorage
  localStorage.clear();
});
afterAll(() => server.close());
