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
      // Frontend (React) coverage only. The Node server and other services are
      // tested/reported separately by service (see work plan G36).
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "node_modules/",
        "vitest.setup.ts",
        "**/*.config.*",
        "**/types/**",
        "**/*.d.ts",
        "src/test-utils/**",
        "src/components/ui/**",
        "src/i18n/**",
        "src/main.tsx",
        "src/integrations/**",
        "**/*.test.{ts,tsx}",
        "server/**",
        "otp-service/**",
        "scripts/**",
      ],
      thresholds: {
        statements: 70,
        branches: 65,
        functions: 40,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@vapi-ai/web": path.resolve(
        __dirname,
        "./src/__mocks__/@vapi-ai/web.ts",
      ),
    },
  },
});
