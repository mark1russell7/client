/**
 * Mutation tests of the core rules (roadmap R32). The nightly workflow starts them:
 * `pnpm --filter @procedures/client exec stryker run`.
 *
 * Stryker changes the code of the files of `mutate` one change at a time (a mutant), and runs the
 * tests that cover the change. A mutant that no test kills is a gap in the tests. The files are
 * the resolver of references, the capabilities, the expose rule and the middleware of
 * `resilience()`. The report is an artifact of the workflow. A score below the floor fails the run.
 * The floor only goes up. The first full report had 72.6 % (nightly run 38945671443). The tests
 * of R32 raised it to 79.8 % (nightly run 38955591268), and the floor is 79.
 *
 * Stryker runs in place: it changes the files of the checkout and puts them back at the end. Its
 * sandbox copy rewrites `tsconfig.json` with the JavaScript API of TypeScript, and TypeScript 7
 * does not have that API. Run it only in CI, because a stopped run can leave a mutant in a file.
 *
 * @type {import("@stryker-mutator/api/core").PartialStrykerOptions}
 */
export default {
  testRunner: "vitest",
  plugins: ["@stryker-mutator/vitest-runner"],
  vitest: { configFile: "vitest.config.ts" },
  mutate: [
    "src/procedures/ref.ts",
    "src/procedures/capability.ts",
    "src/procedures/policy.ts",
    "src/client/middleware/retry.ts",
    "src/client/middleware/timeout.ts",
    "src/client/middleware/circuit-breaker.ts",
    "src/client/middleware/cache.ts",
    "src/client/middleware/rate-limit.ts",
    "src/client/middleware/items.ts",
    "src/client/deadline.ts",
  ],
  coverageAnalysis: "perTest",
  ignoreStatic: true,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  thresholds: { high: 80, low: 60, break: 79 },
  timeoutMS: 30_000,
  concurrency: 4,
  tempDirName: ".stryker-tmp",
  inPlace: true,
};
