/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors tsconfig.json's "@/*" path mapping - Vite/Vitest doesn't read tsconfig paths on its
  // own. Needed as of issue #5's route-level tests (src/app/health/**), which import route.ts
  // files that use the same "@/..." imports as the rest of src/app/**.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // e2e/** and e2e-production/** hold Playwright specs (issues #6 and #10) - a different test
    // runner/config (playwright.config.ts / playwright.config.production.ts), never Vitest's own
    // default include glob.
    exclude: [...configDefaults.exclude, "e2e/**", "e2e-production/**"],
  },
});
