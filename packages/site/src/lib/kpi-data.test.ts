// The measures of the file kpi.json. The count uses the same pattern as the reader of the project's targets.

import { describe, expect, it } from "vitest";
import { kpiFile } from "@mark1russell7/site-pages";
import { jsScripts, kpiMeasures } from "../../scripts/kpi-data.ts";

const COMMIT = "a".repeat(40);
const COMMIT_TIME = "2026-11-05T12:00:00Z";
const NOW = Date.parse("2026-11-05T18:00:00Z");

describe("the measure js-scripts", () => {
  it("counts each JavaScript file of a scripts folder of the root or of a package", () => {
    const paths = ["scripts/a.mjs", "scripts/deep/b.js", "packages/site/scripts/c.cjs", "packages/mark/scripts/d.js"];
    expect(jsScripts(paths)).toBe(4);
  });

  it("does not count a TypeScript script, another folder or a deeper package folder", () => {
    const paths = ["scripts/a.ts", "packages/site/src/b.js", "packages/site/e2e/scripts/c.js", "docs/scripts/d.js", "scripts.js"];
    expect(jsScripts(paths)).toBe(0);
  });
});

describe("the measures of kpi.json", () => {
  const green = { available: true, value: 3, at: "2026-11-05T07:30:00Z" } as const;
  const noRead = { available: false, reason: "no token" } as const;

  it("gives the time of the run to the measure from GitHub, and no own time to the count of the commit", () => {
    const measures = kpiMeasures({ paths: ["scripts/a.mjs"], nightly: green });
    expect(measures.find((measure) => measure.id === "nightly-green-run")).toMatchObject({ value: 3, at: green.at });
    const scripts = measures.find((measure) => measure.id === "js-scripts");
    expect(scripts?.value).toBe(1);
    expect(scripts?.at).toBeUndefined();
  });

  it("leaves out a measure that nobody read: the file has no typed zero", () => {
    const measures = kpiMeasures({ paths: [], nightly: noRead });
    expect(measures.map((measure) => measure.id)).toEqual(["js-scripts"]);
  });

  it("names what each measure does not count", () => {
    for (const measure of kpiMeasures({ paths: [], nightly: green })) expect(measure.notCounted).toBeTruthy();
  });

  it("gives a file that the writer of site-pages accepts", () => {
    const file = kpiFile({ project: "client", at: COMMIT_TIME, commit: COMMIT, measures: kpiMeasures({ paths: [], nightly: green }) }, NOW);
    expect(file.measures.map((measure) => measure.id)).toEqual(["js-scripts", "nightly-green-run"]);
    expect(file.at).toBe(COMMIT_TIME);
  });
});
