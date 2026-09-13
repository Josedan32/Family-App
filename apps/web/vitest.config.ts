import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    // Playwright owns e2e/ — its specs use Playwright's own `test` global,
    // which Vitest's collector chokes on if it tries to import them too.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
