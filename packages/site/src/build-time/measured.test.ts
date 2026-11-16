/**
 * The tests of the measured numbers of the docs pages (scripts/measured.ts): the fill of the README blocks,
 * the stamps of the pages, and the schedule of each workflow against its limit.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkFreshness, cronLines, DATA_STAMP_SCHEMA, parseDataStamps } from "@mark1russell7/site-pages";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fillMeasured, formatMs, joinStamps, MEASURED_LIMITS, readMeasured, stampOfPage } from "../../scripts/measured.ts";
import { MEASURED_SCHEMA, type MeasuredRecord } from "../../scripts/measured-record.ts";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const WORKFLOW = ".github/workflows/nightly.yml";

function record(id: string, numbers: Record<string, number>, workflow = WORKFLOW): MeasuredRecord {
  return {
    schema: MEASURED_SCHEMA,
    run: { id, url: `https://github.com/owner/repo/actions/runs/${id}`, date: "2026-11-07T03:10:00Z", commit: "0123456789abcdef0123456789abcdef01234567", workflow },
    engines: { "@procedures/sqlite": "0.5.1" },
    numbers: Object.fromEntries(Object.entries(numbers).map(([key, value]) => [key, { value, unit: "ms", stat: "p50", samples: 20, source: `${key}.json` }])),
  } as MeasuredRecord;
}

const README = [
  "# A package",
  "",
  "<!-- measured",
  "| Write | {nightly.write} |",
  "",
  "From [the run of {run.date}]({run.url}), commit `{run.commit}`, version {engine:@procedures/sqlite}, limit {run.limit} days.",
  "-->",
  "The site shows the times.",
  "<!-- /measured -->",
  "",
  "The end.",
  "",
].join("\n");

describe("formatMs", () => {
  it("gives two decimals under 10 ms, one under 100 ms, and whole numbers after", () => {
    expect(formatMs(1.234)).toBe("1.23 ms");
    expect(formatMs(9.994)).toBe("9.99 ms");
    expect(formatMs(20.06)).toBe("20.1 ms");
    expect(formatMs(141.4)).toBe("141 ms");
    expect(formatMs(1246.4)).toBe("1,246 ms");
  });
});

describe("fillMeasured", () => {
  it("gives the text for GitHub and npm when the build has no records", () => {
    const filled = fillMeasured(README, undefined, "packages/a");
    expect(filled.markdown).toBe("# A package\n\nThe site shows the times.\n\nThe end.\n");
    expect(filled.runs).toEqual([]);
  });

  it("fills the numbers and the run of one record", () => {
    const filled = fillMeasured(README, [record("7", { "nightly.write": 141.4 })], "packages/a");
    expect(filled.markdown).toContain("| Write | 141 ms |");
    expect(filled.markdown).toContain("From [the run of 2026-11-07](https://github.com/owner/repo/actions/runs/7), commit `01234567`, version 0.5.1, limit 3 days.");
    expect(filled.markdown).not.toContain("The site shows the times.");
    expect(filled.markdown).not.toContain("measured");
    expect(filled.markdown).toMatch(/limit 3 days\.\n\nThe end\.\n$/);
    expect(filled.runs.map((run) => run.id)).toEqual(["7"]);
  });

  it("gives each run once when two blocks use the same run", () => {
    const filled = fillMeasured(`${README}\n${README}`, [record("7", { "nightly.write": 1 })], "packages/a");
    expect(filled.runs).toHaveLength(1);
  });

  it("throws on a key that no record has", () => {
    expect(() => fillMeasured(README, [record("7", { "nightly.read": 1 })], "packages/a")).toThrow(/no record has the number nightly.write/);
  });

  it("throws when the numbers of one block come from two runs", () => {
    const two = README.replace("| Write | {nightly.write} |", "| Write | {nightly.write} |\n| Read | {other.read} |");
    expect(() => fillMeasured(two, [record("7", { "nightly.write": 1 }), record("8", { "other.read": 2 })], "packages/a")).toThrow(/from 2 runs/);
  });

  it("throws on a block with no number", () => {
    const empty = "<!-- measured\nThe run {run.date}.\n-->\nText.\n<!-- /measured -->\n";
    expect(() => fillMeasured(empty, [record("7", { "nightly.write": 1 })], "packages/a")).toThrow(/has no number/);
  });

  it("throws on an unknown run place and on a version that the run does not name", () => {
    const place = README.replace("{run.date}", "{run.branch}");
    expect(() => fillMeasured(place, [record("7", { "nightly.write": 1 })], "packages/a")).toThrow(/\{run.branch\} is not known/);
    const engine = README.replace("{engine:@procedures/sqlite}", "{engine:@procedures/mongo}");
    expect(() => fillMeasured(engine, [record("7", { "nightly.write": 1 })], "packages/a")).toThrow(/names no version of @procedures\/mongo/);
  });

  it("throws on a block with no end", () => {
    expect(() => fillMeasured("<!-- measured\n{nightly.write}\n-->\nText.\n", [record("7", { "nightly.write": 1 })], "packages/a")).toThrow(/no end/);
  });

  it("throws on a workflow with no limit", () => {
    expect(() => fillMeasured(README, [record("7", { "nightly.write": 1 }, ".github/workflows/other.yml")], "packages/a")).toThrow(/has no limit/);
  });
});

describe("stampOfPage and joinStamps", () => {
  const run = { ...fillMeasured(README, [record("7", { "nightly.write": 1 })], "packages/a").runs[0]! };
  const fixed = {
    schema: DATA_STAMP_SCHEMA,
    pages: [{ page: "docs/packages/b/index.html", runs: [{ id: "1", url: "https://github.com/owner/repo/actions/runs/1", date: "2026-10-17T00:00:00Z", engines: { b: "0.1.0" }, commit: "0123456789abcdef0123456789abcdef01234567" }], study: true, noLimit: { reproduce: "A later commit measures another version.", today: "The page claims nothing about the current version." } }],
  };

  it("gives the limit of the workflow and no workflow field in the runs", () => {
    const stamp = stampOfPage("docs/packages/a/index.html", [run]);
    expect(stamp.limit).toEqual({ days: 3, reason: MEASURED_LIMITS[WORKFLOW]!.reason, workflow: WORKFLOW });
    expect(stamp.runs[0]).not.toHaveProperty("workflow");
  });

  it("throws when the runs of a page come from two workflows", () => {
    expect(() => stampOfPage("docs/packages/a/index.html", [run, { ...run, id: "9", workflow: ".github/workflows/other.yml" }])).toThrow(/one workflow, not 2/);
  });

  it("joins the fixed stamps and the measured stamps, and the result parses with no fault", () => {
    const joined = joinStamps(fixed, [stampOfPage("docs/packages/a/index.html", [run])]);
    expect(joined.pages.map((stamp) => stamp.page)).toEqual(["docs/packages/b/index.html", "docs/packages/a/index.html"]);
    expect(parseDataStamps(joined).ok).toBe(true);
  });

  it("throws on a fixed file of another format", () => {
    expect(() => joinStamps({ schema: "other/1", pages: [] }, [])).toThrow(/not a file data-stamp\/1/);
  });

  it("throws on a fault of a fixed stamp", () => {
    const faulty = { ...fixed, pages: [{ ...fixed.pages[0]!, noLimit: {} }] };
    expect(() => joinStamps(faulty, [])).toThrow(/the data stamps have faults/);
  });

  it("throws on a page with a fixed stamp and measured numbers", () => {
    expect(() => joinStamps(fixed, [stampOfPage("docs/packages/b/index.html", [run])])).toThrow(/a fixed stamp and measured numbers/);
  });

  it("gives a stamp that the freshness gate passes when the run is new, and fails when it is older than the limit", () => {
    const stamps = joinStamps({ schema: DATA_STAMP_SCHEMA, pages: [] }, [stampOfPage("docs/packages/a/index.html", [run])]);
    const times = [{ name: "@procedures/sqlite", version: "0.5.1", date: "2026-11-01T00:00:00Z" }];
    const schedules = { [WORKFLOW]: 1 };
    const fresh = checkFreshness(stamps, { now: "2026-11-08T00:00:00Z", times, schedules });
    expect(fresh.faults).toEqual([]);
    expect(fresh.notRun).toEqual([]);
    const stale = checkFreshness(stamps, { now: "2026-11-12T00:00:00Z", times, schedules });
    expect(stale.faults.length).toBeGreaterThan(0);
  });
});

describe("the schedule of each workflow", () => {
  it("runs each day, so the gap between two runs is under the limit of its numbers", () => {
    for (const [workflow, { days }] of Object.entries(MEASURED_LIMITS)) {
      const lines = cronLines(readFileSync(join(REPO, workflow), "utf8"));
      expect(lines.length, workflow).toBeGreaterThan(0);
      // A cron with a fixed minute and hour and a star in each day field starts once each day: a gap of one day.
      expect(lines.some((line) => /^\d+ \d+ \* \* \*$/.test(line.cron)), workflow).toBe(true);
      expect(days, workflow).toBeGreaterThan(1);
    }
  });
});

describe("readMeasured", () => {
  let folder: string;
  beforeAll(() => {
    folder = mkdtempSync(join(tmpdir(), "measured-"));
  });
  afterAll(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it("reads each record of a folder, and throws on a key in two records", () => {
    const one = join(folder, "one");
    mkdirSync(one);
    writeFileSync(join(one, "a.json"), JSON.stringify(record("7", { "nightly.write": 1 })));
    expect(readMeasured(one).map((item) => item.run.id)).toEqual(["7"]);
    writeFileSync(join(one, "b.json"), JSON.stringify(record("8", { "nightly.write": 2 })));
    expect(() => readMeasured(one)).toThrow(/nightly.write is in the records of the runs 7 and 8/);
  });

  it("throws on a folder with no record", () => {
    const empty = join(folder, "empty");
    mkdirSync(empty);
    expect(() => readMeasured(empty)).toThrow(/no record/);
  });
});
