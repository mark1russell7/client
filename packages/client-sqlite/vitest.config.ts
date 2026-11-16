import { defineConfig } from "vitest/config";

// The include and the environment stay the defaults of vitest
export default defineConfig({
  test: {
    server: {
      deps: {
        // Vitest processes @mark1russell7/sqlite, so a vi.mock("node:sqlite") of a test also applies to its imports
        inline: ["@mark1russell7/sqlite"],
      },
    },
  },
});
