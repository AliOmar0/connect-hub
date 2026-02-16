import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        "vitest.setup.ts",
        "**/*.config.*",
        "**/types/**",
        "**/*.d.ts",
        "src/test-utils/**",
        "src/components/ui/**",
        "**/*.test.{ts,tsx}",
      ],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 45,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
