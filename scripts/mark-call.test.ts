import assert from "node:assert/strict";
import { join, resolve } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { analyzeInput } from "./bench-paired.ts";
import type { PairedReport } from "./lib/paired-time.ts";
import {
  differenceOf,
  loadedPackagesOf,
  markdownOf,
  packageKeyOf,
  profileSummaryOf,
  rowTimesOf,
  withFileUrls,
  type MarkCallRecord,
  type ProfileRepeat,
  type StackProfile,
} from "./mark-call.ts";
import { selfTimesOf } from "./setup-profile.ts";

const TREE = resolve("/work/tree");
const url = (rel: string) => pathToFileURL(join(TREE, rel)).href;

/** A small profile: `main` of `cli.js` calls `readFreshManifest`, which calls `computeFingerprint`, and the print. */
const PROFILE: StackProfile = {
  nodes: [
    { id: 1, callFrame: { url: "", functionName: "(root)" }, children: [2, 6] },
    { id: 2, callFrame: { url: url("packages/mark/dist/cli.js"), functionName: "main" }, children: [3, 5] },
    { id: 3, callFrame: { url: url("packages/mark/dist/manifest.js"), functionName: "readFreshManifest" }, children: [4, 7] },
    { id: 4, callFrame: { url: "node:fs", functionName: "readFileSync" } },
    { id: 7, callFrame: { url: url("packages/mark/dist/manifest.js"), functionName: "computeFingerprint" }, children: [8] },
    { id: 8, callFrame: { url: "node:fs", functionName: "statSync" } },
    { id: 5, callFrame: { url: url("packages/mark/dist/print.js"), functionName: "json" } },
    { id: 6, callFrame: { url: "", functionName: "(garbage collector)" } },
  ],
  // The time of sample i is timeDeltas[i + 1], in microseconds
  samples: [4, 3, 8, 7, 5, 6, 2],
  timeDeltas: [0, 1000, 2000, 3000, 4000, 5000, 6000],
};

describe("mark-call", () => {
  it("gives the package key of a module URL", () => {
    assert.equal(packageKeyOf(url("node_modules/.pnpm/yaml@2.8.0/node_modules/yaml/dist/index.js"), TREE), "yaml");
    assert.equal(packageKeyOf(url("node_modules/.pnpm/@aws-sdk+client-s3@3/node_modules/@aws-sdk/client-s3/dist/index.js"), TREE), "@aws-sdk/client-s3");
    assert.equal(packageKeyOf(url("packages/client/dist/procedures/module.js"), TREE), "packages/client");
    assert.equal(packageKeyOf(url("packages/mark/node_modules/chalk/source/index.js"), TREE), "chalk");
    assert.equal(packageKeyOf("node:fs", TREE), undefined);
    assert.equal(packageKeyOf(pathToFileURL(resolve("/elsewhere/x.js")).href, TREE), "(outside the tree)");
  });

  it("gives the distinct packages of a call and the heavy packages among them", () => {
    const loaded = loadedPackagesOf(
      [url("packages/mark/dist/cli.js"), url("packages/mark/dist/cli.js"), url("node_modules/cli-table3/index.js"), url("node_modules/@smithy/core/dist/index.js"), "node:path"],
      TREE,
    );
    assert.equal(loaded.modules, 4);
    assert.deepEqual(loaded.packages, ["@smithy/core", "cli-table3", "packages/mark"]);
    assert.deepEqual(loaded.heavy, ["@smithy/core", "cli-table3"]);
  });

  it("groups a CPU profile by file and by named row", () => {
    assert.deepEqual(selfTimesOf(PROFILE, TREE), {
      "node:internal": 4,
      "packages/mark/dist/manifest.js": 6,
      "packages/mark/dist/print.js": 5,
      "(garbage collector)": 6,
      "packages/mark/dist/cli.js": 0,
    });
    const rows = rowTimesOf(PROFILE, TREE);
    // The stat call goes to the inner row (fingerprint), not to the manifest
    assert.deepEqual(rows.ms, { manifest: 3, fingerprint: 7, registry: 0, loader: 0, print: 5 });
    assert.deepEqual(rows.selfMs, { manifest: 2, fingerprint: 4, registry: 0, loader: 0, print: 5 });
    assert.deepEqual([...rows.found].sort(), ["fingerprint", "manifest", "print"]);
  });

  it("gives a file URL to a frame with an absolute path", () => {
    const path = join(TREE, "packages", "mark", "dist", "print.js");
    const profile = withFileUrls({ nodes: [{ id: 1, callFrame: { url: path, functionName: "x" } }, { id: 2, callFrame: { url: "node:fs", functionName: "y" } }], samples: [], timeDeltas: [] });
    assert.equal(profile.nodes[0].callFrame.url, pathToFileURL(path).href);
    assert.equal(profile.nodes[1].callFrame.url, "node:fs");
  });

  it("gives the medians of the profiles, not found for a row with no frame, and the remaining top files", () => {
    const repeat = (scale: number): ProfileRepeat => {
      const files = Object.fromEntries(Object.entries(selfTimesOf(PROFILE, TREE)).map(([k, ms]) => [k, ms * scale]));
      const rows = rowTimesOf(PROFILE, TREE);
      return { wallMs: 100 * scale, files, rows: { ...rows, ms: Object.fromEntries(Object.entries(rows.ms).map(([k, ms]) => [k, ms * scale])) } };
    };
    const s = profileSummaryOf([repeat(1), repeat(2), repeat(3)]);
    assert.equal(s.repeats, 3);
    assert.equal(s.wallMs, 200);
    assert.equal(s.sampledMs, 42);
    assert.deepEqual(s.rows.fingerprint, { ms: 14, selfMs: 4 });
    assert.deepEqual(s.rows.registry, { ms: null, selfMs: null });
    assert.deepEqual(
      s.rowFiles.map((r) => r.key),
      ["packages/mark/dist/manifest.js", "packages/mark/dist/print.js"],
    );
    assert.deepEqual(
      s.remaining.map((r) => r.key),
      ["(garbage collector)", "node:internal", "packages/mark/dist/cli.js"],
    );
  });

  it("gives the Markdown of a record, with the verdict, the rows and the packages", () => {
    const ms = { base: [100, 102, 98, 101, 99], "base~aa": [101, 101, 99, 100, 100], head: [60, 62, 59, 61, 60] };
    const median = (v: number[]) => v.toSorted((a, b) => a - b)[Math.floor(v.length / 2)];
    const medians = Object.fromEntries(Object.entries(ms).map(([arm, v]) => [arm, median(v)]));
    const report: PairedReport = {
      schema: "paired-time/1",
      mode: "fresh",
      env: { cpu: "test", cores: 1, os: "linux", arch: "x64", node: "v26.0.0" },
      base: "base",
      arms: Object.keys(ms),
      inputs: [{ id: "mark-one-call", ms, median: medians, ratio: Object.fromEntries(Object.entries(medians).map(([arm, m]) => [arm, m / medians.base])) }],
      ratios: {},
      noiseFloor: null,
    };
    const difference = differenceOf(report);
    assert.equal(difference.medianBaseMinusHeadMs, 40);
    assert.deepEqual(difference.roundsMs, [40, 40, 39, 40, 39]);
    const repeats = [{ wallMs: 100, files: selfTimesOf(PROFILE, TREE), rows: rowTimesOf(PROFILE, TREE) }];
    const state = { fresh: true, version: 3, commands: 400, stamp: "10:1" };
    const record: MarkCallRecord = {
      schema: "mark-call/1",
      refs: { base: "1770cfc4", head: "d9872020" },
      node: "v26.0.0",
      run: { label: "local" },
      context: { cpu: "test", cores: 1, node: "v26.0.0", platform: "linux", arch: "x64" },
      repeats: 5,
      warmup: 0,
      budget: 0.1,
      skipped: [],
      call: { args: ["--json", "{}"], output: "3", env: {} },
      manifest: { base: { before: state, after: state }, head: { before: state, after: state } },
      analysis: report.inputs.map((input) => analyzeInput(input, 0.1)),
      difference,
      report,
      profile: { repeats: 1, sides: { base: profileSummaryOf(repeats), head: profileSummaryOf(repeats) }, raw: { base: repeats, head: repeats } },
      packages: {
        base: { modules: 900, packages: ["mongodb", "packages/client"], heavy: ["mongodb"] },
        head: { modules: 300, packages: ["packages/client"], heavy: [] },
      },
    };
    const md = markdownOf(record);
    assert.match(md, /\| 100\.0 \| 60\.0 \| 40\.0 \| 39\.0 to 40\.0 \| 0\.600 \|/);
    assert.match(md, /\| faster \|/);
    assert.match(md, /`computeFingerprint`, with its stat calls \| 7\.0 \| 4\.0 \| 7\.0 \| 4\.0 \|/);
    assert.match(md, /The build of the core registry .* \| not found \| not found \|/);
    assert.match(md, /\| base \| 900 \| 2 \| `mongodb` \|/);
    assert.match(md, /\| head \| 300 \| 1 \| none \|/);
    assert.match(md, /## Paired bench, run local/);
  });
});
