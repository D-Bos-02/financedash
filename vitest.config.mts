import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["lib/**/*.test.ts"],
    // Tests cover pure functions only; this guard makes any accidental database use fail loudly.
    env: { DATABASE_URL: "file:/nonexistent/tests-must-not-touch-the-database.db" },
  },
});
