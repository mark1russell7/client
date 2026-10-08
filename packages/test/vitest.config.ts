import { defineConfig } from "vitest/config";
import { sharedConfig } from "./src/vitest.shared.js";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ["src/**/*.test.ts"],
  },
});
