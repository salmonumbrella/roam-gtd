import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      all: true,
      exclude: ["src/__tests__/**", "src/types.ts", "src/types/**/*.d.ts"],
      include: ["src/**/*.{ts,tsx}"],
      provider: "v8",
      reporter: ["text"],
      thresholds: {
        branches: 80,
        functions: 85,
        lines: 82,
        statements: 82,
      },
    },
    environment: "node",
    globals: true,
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    pool: "forks",
  },
});
