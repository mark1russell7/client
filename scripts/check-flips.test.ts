// The tests of scripts/check-flips.ts, with runs and logs in memory. The flips run in the workflow
// check-flips.yml. Start these tests with: node --test scripts/check-flips.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gzipSync } from "node:zlib";
import { MARGIN, budgetsOf, cannotFail, fillerOf, flipOf, jobOf, overBudget, scriptCannotFailAlone, sizesOf } from "./check-flips.ts";

const passed = { status: 0, log: "" };
const budgets = { page: 256 * 1024, script: 180 * 1024, worker: 128 * 1024 };

describe("flipOf", () => {
  it("holds when the clean copy passes and the fault fails with the message", () => {
    assert.equal(flipOf("x", passed, { status: 1, log: "the page loads 300 kB of gzip" }, /the page loads/).held, true);
  });
  it("does not hold when the clean copy fails", () => {
    const flip = flipOf("x", { status: 1, log: "" }, { status: 1, log: "the page loads" }, /the page loads/);
    assert.equal(flip.held, false);
    assert.match(flip.reason, /clean copy failed/);
  });
  it("does not hold when the fault does not fail the check", () => {
    const flip = flipOf("x", passed, passed, /the page loads/);
    assert.equal(flip.held, false);
    assert.match(flip.reason, /did not fail/);
  });
  it("does not hold when the check fails for another reason", () => {
    const flip = flipOf("x", passed, { status: 1, log: "a test timed out" }, /the page loads/);
    assert.equal(flip.held, false);
    assert.match(flip.reason, /no message/);
  });
  it("does not hold when the fault ends the check with no exit code", () => {
    assert.equal(flipOf("x", passed, { status: null, log: "" }, /the page loads/).held, false);
  });
});

describe("sizesOf", () => {
  it("reads a route with workers, and the route of the home page", () => {
    const log = [
      "  /: 100 bytes of gzip, 60 bytes of scripts, 0 bytes of workers (131072 under the budget: none)",
      "/lab/: 200 bytes of gzip, 90 bytes of scripts, 70 bytes of workers (131002 under the budget: /client/assets/a.js 50, /client/assets/b.js 20)",
    ].join("\n");
    assert.deepEqual(sizesOf(log), [
      { route: "", total: 100, script: 60, worker: 0, workers: [] },
      { route: "lab/", total: 200, script: 90, worker: 70, workers: ["/client/assets/a.js", "/client/assets/b.js"] },
    ]);
  });
  it("reads a worker over its budget", () => {
    assert.equal(sizesOf("/lab/: 1 bytes of gzip, 1 bytes of scripts, 9 bytes of workers (-5 under the budget: /a.js 9)")[0]?.worker, 9);
  });
  it("gives nothing for a log with no size", () => {
    assert.deepEqual(sizesOf("Running 1 test"), []);
  });
});

describe("budgetsOf", () => {
  it("reads the budgets from the text of the test", () => {
    const spec = "const PAGE_BUDGET = 256 * 1024;\nconst SCRIPT_BUDGET = 180 * 1024;\nconst WORKER_BUDGET = 128 * 1024;\n";
    assert.deepEqual(budgetsOf(spec), budgets);
  });
  it("fails when a budget changes its form", () => {
    assert.throws(() => budgetsOf("const PAGE_BUDGET = 256 * 1024;"), /SCRIPT_BUDGET/);
  });
});

describe("cannotFail", () => {
  const workflow = (needs: string, extra = ""): string => `jobs:\n  checks:\n    steps:\n      - run: node scripts/coverage.ts${extra}\n  ci-ok:\n    name: CI OK\n    needs: [${needs}]\n`;
  it("finds no reason in a job that the required check needs", () => {
    assert.equal(cannotFail(workflow("ci, checks"), "checks", "node scripts/coverage.ts"), undefined);
  });
  it("gives a reason for continue-on-error", () => {
    assert.match(cannotFail(workflow("checks", "\n        continue-on-error: true"), "checks", "node scripts/coverage.ts") ?? "", /continue-on-error/);
  });
  it("gives a reason for a lost command", () => {
    assert.match(cannotFail(workflow("checks"), "checks", "node scripts/other.ts") ?? "", /does not start/);
  });
  it("gives a reason for a job that the required check does not need", () => {
    assert.match(cannotFail(workflow("ci"), "checks", "node scripts/coverage.ts") ?? "", /does not need/);
  });
  it("gives a reason for a job that the workflow does not have", () => {
    assert.match(cannotFail(workflow("checks"), "site", "node scripts/coverage.ts") ?? "", /has no job site/);
  });
  it("gives a reason when the command is in another job", () => {
    const other = `jobs:\n  checks:\n    steps:\n      - run: echo\n  other:\n    steps:\n      - run: node scripts/coverage.ts\n  ci-ok:\n    needs: [checks, other]\n`;
    assert.match(cannotFail(other, "checks", "node scripts/coverage.ts") ?? "", /the job checks does not start/);
  });

  const pages = (uses: string): string => `jobs:\n  site:\n    name: Site\n    uses: ${uses}\n    with:\n      timeout-minutes: 25\n  ci-ok:\n    needs: [site]\n`;
  const shared = "mark1russell7/template/.github/workflows/reusable-pages-check.yml@94adcfe # main";
  it("finds the command in the build of the site config when the job uses the shared Pages check", () => {
    assert.equal(cannotFail(pages(shared), "site", "@procedures/site test:e2e", "pnpm build\npnpm --filter @procedures/site test:e2e\n"), undefined);
  });
  it("gives a reason when the build of the site config does not start the command", () => {
    assert.match(cannotFail(pages(shared), "site", "@procedures/site test:e2e", "pnpm build\n") ?? "", /the job site does not start/);
  });
  it("does not read the site config for a job that uses another workflow", () => {
    const other = "mark1russell7/template/.github/workflows/reusable-other.yml@94adcfe";
    assert.match(cannotFail(pages(other), "site", "@procedures/site test:e2e", "pnpm --filter @procedures/site test:e2e\n") ?? "", /does not start/);
  });
});

describe("jobOf", () => {
  const text = "on:\n  site:\n    x: 1\njobs:\n  site:\n    name: Site\n\n    with:\n      a: 1\n  # A comment of the next job\n  next:\n    name: Next\n";
  it("gives the lines of the job under jobs, up to the next job", () => {
    assert.equal(jobOf(text, "site"), "  site:\n    name: Site\n\n    with:\n      a: 1");
  });
  it("reads a file with CRLF line ends", () => {
    assert.equal(jobOf(text.replaceAll("\n", "\r\n"), "next"), "  next:\n    name: Next\n");
  });
  it("gives undefined for a job that the workflow does not have", () => {
    assert.equal(jobOf(text, "other"), undefined);
  });
});

describe("the size of a fault", () => {
  it("goes over the budget by the margin", () => {
    assert.equal(100 + overBudget(1000, 100), 1000 + MARGIN);
  });
  it("finds a script budget that can fail alone", () => {
    assert.equal(scriptCannotFailAlone({ route: "docs/", total: 100_000, script: 80_000, worker: 0, workers: [] }, budgets), undefined);
  });
  it("finds a script budget that the page budget stops first", () => {
    assert.match(scriptCannotFailAlone({ route: "docs/", total: 150_000, script: 50_000, worker: 0, workers: [] }, budgets) ?? "", /stops the test first/);
  });
  it("has filler whose gzip size is near the asked size, under the margin", () => {
    const size = gzipSync(fillerOf(50_000)).length;
    assert.ok(size > 50_000 - MARGIN && size < 50_000 + MARGIN, `gzip size ${size}`);
  });
});
