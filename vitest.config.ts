import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    pool: "threads",
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 1,
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "coverage",
      exclude: [
        "index.ts",
        "src/types/**",
        "dist/**",
        "**/*.d.ts",
        "vite.config.ts",
        "vitest.config.ts",
      ],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
    },
  },
});
