import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    css: false, // Skip CSS parsing — tests don't need it
    restoreMocks: true,
    // Longer timeout for MSW-based integration tests
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      include: [
        "src/pages/**",
        "src/stores/**",
        "src/hooks/**",
        "src/components/auth/**",
      ],
    },
  },
});
