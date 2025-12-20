import { defineConfig } from "vitest/config";
import { sharedConfig } from "@mark1russell7/test/vitest.shared";

export default defineConfig({
  ...sharedConfig,
  test: {
    ...sharedConfig.test,
    include: ["src/**/*.test.ts"],
  },
});
