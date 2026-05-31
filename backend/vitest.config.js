import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/__tests__/setup.js"],
    testTimeout: 60000, // Replica set + transactions can be slow
    hookTimeout: 60000,
    // Run test files sequentially to avoid port/DB conflicts
    fileParallelism: false,
    // Coverage configuration
    coverage: {
      provider: "v8",
      include: ["src/services/**", "src/middleware/**"],
      exclude: ["src/__tests__/**"],
    },
  },
});
