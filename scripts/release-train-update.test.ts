// The steps of scripts/release-train-update.ts, with a false runner: the generator runs only after a
// failed check, and each failure stops the script with the step that failed.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILD_PACKAGES, BUILD_TOOLS, CATALOGS, CHECK, GENERATE, commandLine, update, type Step } from "./release-train-update.ts";

/** This function gives a runner that fails the steps of `fails`. A check fails only at the runs of `checkFails`. */
function runner(fails: readonly Step[], checkFails: readonly boolean[] = []): (step: Step) => number {
  let checks = 0;
  return (step) => {
    if (step === CHECK) return checkFails[checks++] === true ? 1 : 0;
    return fails.includes(step) ? 1 : 0;
  };
}

const goodCatalog = (): string => "# Catalog\n";
const allSteps = [BUILD_TOOLS, CHECK, GENERATE, BUILD_PACKAGES, ...CATALOGS, CHECK].map((step) => step.label);

describe("update", () => {
  it("stops after the first check when the check passes", () => {
    assert.deepEqual(update(runner([]), goodCatalog), { ran: [BUILD_TOOLS.label, CHECK.label], generated: false });
  });

  it("generates, builds, writes the catalogs and checks again when the first check fails", () => {
    assert.deepEqual(update(runner([], [true, false]), goodCatalog), { ran: allSteps, generated: true });
  });

  it("stops with an error when the build of the tools fails", () => {
    const result = update(runner([BUILD_TOOLS]), goodCatalog);
    assert.deepEqual(result.ran, [BUILD_TOOLS.label]);
    assert.equal(result.error, `${BUILD_TOOLS.label} fails`);
  });

  it("stops at the step that fails after a failed check", () => {
    for (const step of [GENERATE, BUILD_PACKAGES, ...CATALOGS]) {
      const result = update(runner([step], [true]), goodCatalog);
      assert.equal(result.error, `${step.label} fails`);
      assert.equal(result.ran.at(-1), step.label);
      assert.equal(result.generated, true);
    }
  });

  it("stops when a catalog has a package that did not load", () => {
    const result = update(runner([], [true, false]), (file) => (file.endsWith("PACKAGES.md") ? "| x | (failed to load: no dist) |" : "# Catalog\n"));
    assert.equal(result.error, "packages/documentation/PACKAGES.md has a package that did not load");
    assert.equal(result.ran.at(-1), CATALOGS.at(-1)?.label);
  });

  it("stops with an error when the check fails again after the generator", () => {
    const result = update(runner([], [true, true]), goodCatalog);
    assert.deepEqual(result.ran, allSteps);
    assert.match(result.error ?? "", /fails after the generator/);
  });
});

describe("commandLine", () => {
  it("starts a node step with the node of the script", () => {
    assert.deepEqual(commandLine(CHECK, "/bin/node", undefined, "linux"), { file: "/bin/node", args: CHECK.args, shell: false });
  });

  it("starts a pnpm step with the pnpm that started the script", () => {
    const line = commandLine(BUILD_TOOLS, "/bin/node", "/pnpm/bin/pnpm.cjs", "win32");
    assert.deepEqual(line, { file: "/bin/node", args: ["/pnpm/bin/pnpm.cjs", ...BUILD_TOOLS.args], shell: false });
  });

  it("starts pnpm by name without npm_execpath, through a shell only on Windows", () => {
    assert.equal(commandLine(BUILD_TOOLS, "/bin/node", undefined, "linux").shell, false);
    assert.equal(commandLine(BUILD_TOOLS, "/bin/node", "/npm/bin/npm-cli.js", "win32").shell, true);
    assert.equal(commandLine(BUILD_TOOLS, "/bin/node", undefined, "win32").file, "pnpm");
  });
});
