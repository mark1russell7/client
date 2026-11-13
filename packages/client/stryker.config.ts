import type { Stryker } from "@stryker-mutator/core";

/**
 * This file holds the options of the mutation tests of the core rules (roadmap R32). The nightly
 * workflow starts them: `pnpm --filter @procedures/client exec stryker run stryker.config.ts`.
 * Stryker finds only JavaScript and JSON names by itself, so the command names this file.
 *
 * Stryker changes the code of the files of `mutate` one change at a time (a mutant), and runs the
 * tests that cover the change. A mutant that no test kills is a gap in the tests. The files are
 * the resolver of references, the capabilities, the expose rule and the middleware of
 * `resilience()`. The report is an artifact of the workflow. A score below the floor fails the run.
 * The first full report had 72.6 % (nightly run 38945671443). The tests of R32 raised it to
 * 79.8 % (nightly run 38955591268). The tests of O13 for the cache, the retry and the call policy
 * raised it to 88.2 % (nightly run 39076114467). The measured runs set the floor (O85): see
 * `thresholds.break` below.
 *
 * Stryker runs in place: it changes the files of the checkout and puts them back at the end. Its
 * sandbox copy rewrites `tsconfig.json` with the JavaScript API of TypeScript, and TypeScript 7
 * does not have that API. Run it only in CI, because a stopped run can leave a mutant in a file.
 *
 * The first parameter of `Stryker` gives the type. The package `@stryker-mutator/core` does not
 * export the type by name.
 */
const options: ConstructorParameters<typeof Stryker>[0] = {
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
  // The floor comes from measured runs, not from a number set by feel (roadmap O85). The rule of
  // the maintainer (2026-11-02, roadmap O88): the floor is the worst of the last 5 runs minus their
  // spread, rounded down to 0.1. The rule has no factor and no fixed margin.
  // The nightly runs on main (scheduled) and run 41366212710 (a full dispatch):
  //   40265089062 (2026-10-26) 88.07, 40444986317 (10-27) 88.36, 40626675823 (10-28) 88.36,
  //   40812134490 (10-29) failed, 40997362466 (10-30) 88.36, 41161112179 (10-31) 88.41,
  //   41266207445 (11-01) 88.15, 41366212710 (11-02) 88.41.
  // The last 5 runs (10-28 to 11-02): 88.36, 88.36, 88.41, 88.15, 88.41. The worst is 88.15, the
  // spread is 88.41 - 88.15 = 0.26, and 88.15 - 0.26 = 87.89, so 87.8. Before: 87 (O85), 88.
  thresholds: { high: 80, low: 60, break: 87.8 },
  timeoutMS: 30_000,
  concurrency: 4,
  tempDirName: ".stryker-tmp",
  inPlace: true,
};

export default options;
