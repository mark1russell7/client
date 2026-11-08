import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { main, MEASURED_SCHEMA, mergeRecords, numberOfBenchResult, numbersOfFolder, runOfEnvironment, type MeasuredRecord } from "./measured-record.ts";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const ENV = { GITHUB_RUN_ID: "42", GITHUB_REPOSITORY: "owner/repo", GITHUB_SHA: COMMIT };
const NOW = new Date("2026-11-08T21:50:00.123Z");

const result = (p50: unknown, samplesCount: unknown = 20) => ({ latency: { p50, samplesCount, mean: 99 }, context: { cpu: "test" } });

describe("measured-record", () => {
  let root: string;

  before(() => {
    root = mkdtempSync(join(tmpdir(), "measured-record-"));
    mkdirSync(join(root, "results"));
    writeFileSync(join(root, "results", "write-1000.json"), JSON.stringify(result(14.5)));
    writeFileSync(join(root, "results", "read-10000.json"), JSON.stringify(result(3.25, 64)));
    writeFileSync(join(root, "results", "notes.txt"), "not a result");
    mkdirSync(join(root, "empty"));
    mkdirSync(join(root, "pkg"));
    writeFileSync(join(root, "pkg", "package.json"), JSON.stringify({ name: "@scope/engine", version: "0.7.1" }));
  });

  after(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("gives the median latency of a result, and refuses a result with no median or no samples", () => {
    assert.deepEqual(numberOfBenchResult(result(14.5), "a.json"), { value: 14.5, unit: "ms", stat: "p50", samples: 20, source: "a.json" });
    assert.throws(() => numberOfBenchResult(result(undefined), "a.json"), /a.json: no latency.p50/);
    assert.throws(() => numberOfBenchResult(result(-1), "a.json"), /no latency.p50/);
    assert.throws(() => numberOfBenchResult(result(Number.NaN), "a.json"), /no latency.p50/);
    assert.throws(() => numberOfBenchResult(result(1, 0), "a.json"), /no latency.samplesCount/);
    assert.throws(() => numberOfBenchResult({}, "a.json"), /no latency.p50/);
  });

  it("gives a key for each JSON file of a folder, and refuses a folder with no result", () => {
    const numbers = numbersOfFolder("sqlite", join(root, "results"));
    assert.deepEqual(Object.keys(numbers), ["sqlite.read-10000", "sqlite.write-1000"]);
    assert.equal(numbers["sqlite.write-1000"]?.value, 14.5);
    assert.equal(numbers["sqlite.read-10000"]?.samples, 64);
    assert.throws(() => numbersOfFolder("x", join(root, "empty")), /no result file/);
  });

  it("gives the run of GitHub Actions, and refuses a run with no full commit", () => {
    assert.deepEqual(runOfEnvironment(ENV, NOW), { id: "42", url: "https://github.com/owner/repo/actions/runs/42", date: "2026-11-08T21:50:00Z", commit: COMMIT });
    assert.throws(() => runOfEnvironment({}, NOW), /start the script in a workflow/);
    assert.throws(() => runOfEnvironment({ ...ENV, GITHUB_SHA: "0123abc" }, NOW), /not a full commit/);
  });

  it("joins the records of one run with the earliest date, and refuses two runs, two versions or one key twice", () => {
    const run = { id: "42", url: "u", date: "2026-11-08T22:00:00Z", commit: COMMIT };
    const a: MeasuredRecord = { schema: MEASURED_SCHEMA, run, engines: { e: "1.0.0" }, numbers: { "a.x": numberOfBenchResult(result(1), "x") } };
    const b: MeasuredRecord = { schema: MEASURED_SCHEMA, run: { ...run, date: "2026-11-08T21:00:00Z" }, engines: { e: "1.0.0", f: "2.0.0" }, numbers: { "b.y": numberOfBenchResult(result(2), "y") } };
    const merged = mergeRecords([a, b]);
    assert.equal(merged.run.date, "2026-11-08T21:00:00Z");
    assert.deepEqual(merged.engines, { e: "1.0.0", f: "2.0.0" });
    assert.deepEqual(Object.keys(merged.numbers), ["a.x", "b.y"]);
    assert.throws(() => mergeRecords([a, { ...b, run: { ...b.run, id: "43" } }]), /the runs 42 and 43/);
    assert.throws(() => mergeRecords([a, { ...b, engines: { e: "1.1.0" } }]), /e has the versions 1.0.0 and 1.1.0/);
    assert.throws(() => mergeRecords([a, a]), /the key a.x is in two records/);
    assert.throws(() => mergeRecords([]), /no record/);
  });

  it("writes a record from the command line, and merges two records", () => {
    const out = join(root, "a.json");
    main(["--out", out, "--bench", `sqlite=${join(root, "results")}`, "--engine", `@scope/engine=${join(root, "pkg")}`], ENV, NOW);
    const record = JSON.parse(readFileSync(out, "utf8")) as MeasuredRecord;
    assert.equal(record.schema, MEASURED_SCHEMA);
    assert.deepEqual(record.engines, { "@scope/engine": "0.7.1" });
    assert.equal(Object.keys(record.numbers).length, 2);

    const other = join(root, "b.json");
    writeFileSync(other, JSON.stringify({ ...record, numbers: { "mark.call": record.numbers["sqlite.write-1000"] } }));
    const merged = main(["--out", join(root, "m.json"), "--merge", out, other], ENV, NOW);
    assert.deepEqual(Object.keys(merged.numbers), ["sqlite.read-10000", "sqlite.write-1000", "mark.call"]);
  });

  it("refuses a command line with no output, no bench, a bad pair or a wrong package", () => {
    assert.throws(() => main(["--bench", "a=b"], ENV, NOW), /--out <file> is necessary/);
    assert.throws(() => main(["--out", join(root, "x.json")], ENV, NOW), /at least one --bench/);
    assert.throws(() => main(["--out", join(root, "x.json"), "--bench", "nofolder"], ENV, NOW), /--bench needs <name>=<value>/);
    assert.throws(() => main(["--out", join(root, "x.json"), "--bench", `s=${join(root, "results")}`, "--engine", `@other/name=${join(root, "pkg")}`], ENV, NOW), /is not the package @other\/name/);
    writeFileSync(join(root, "bad.json"), JSON.stringify({ schema: "other/1" }));
    assert.throws(() => main(["--out", join(root, "x.json"), "--merge", join(root, "bad.json")], ENV, NOW), /the schema is not measured\/1/);
  });
});
