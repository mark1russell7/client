/**
 * The Releases section: the parser of the changelogs (`scripts/releases-data.mjs`), the summary
 * line and the layout of the timeline.
 */

import { describe, it, expect } from "vitest";
import { ReleaseDataError, buildReleases, compareVersions, firstSentence, parseChangelog, splitReleases } from "../../scripts/releases-data.mjs";
import type { Release } from "../data";
import { dayRange, longDate, oldestFirst, releaseSummary, shortDate, timelineLayout } from "./releases";
import { newerVersion } from "./versions";

const CLIENT = `# @procedures/client

## 0.3.1

### Patch Changes

- 3a235b9: New: the patch operations \`$remove\` and \`$insert\` (wave 2). \`$remove\` takes an element out
  of an array.
- Updated dependencies [3a235b9]
  - @procedures/store@0.3.1

## 0.3.0

### Minor Changes

- e2fe006: The expose rule applies to each pin (CLI-47):
  - New option \`alwaysOn\`.

  The second paragraph. It is not in the text.

### Patch Changes

- b89e3fe: The field \`partition\` reaches each collection procedure again. Before, \`withPartition()\` refused it.

## 0.2.0

No changes in this release.

## 0.1.0

The first release on npm.

- The core depends on no other package. It moved the storage.
`;

const STORE = `# @procedures/store

## 0.3.1

### Patch Changes

- 3a235b9: New: the patch operations \`$remove\` and \`$insert\` (wave 2). \`$remove\` takes an element out
  of an array.
- @procedures/client@0.3.1

## 0.3.0

### Minor Changes

- e2fe006: The expose rule applies to each pin (CLI-47):
- 0c627f8: \`HybridStorage\` keeps the queue in \`v1.2\` files.

## 0.0.9

- 1234567: A version that the group does not have.
`;

const DATES = new Map([
  ["0.3.1", "2026-10-18T15:34:06-04:00"],
  ["0.3.0", "2026-10-18T13:10:35-04:00"],
  ["0.2.0", "2026-10-16T02:43:51Z"],
  ["0.1.0", "2026-10-11T23:36:16-04:00"],
]);

const changelogs = [
  { name: "@procedures/store", markdown: STORE },
  { name: "@procedures/client", markdown: CLIENT },
];

describe("the changelog parser", () => {
  it("reads the entries of each version, and skips the lines of new dependency versions", () => {
    const sections = parseChangelog(CLIENT);
    expect(sections.map((section) => section.version)).toEqual(["0.3.1", "0.3.0", "0.2.0", "0.1.0"]);
    expect(sections[0]!.entries).toEqual([{ commit: "3a235b9", text: "New: the patch operations `$remove` and `$insert` (wave 2)." }]);
    expect(sections[2]!.entries).toEqual([]);
    expect(sections[3]!.entries).toEqual([{ commit: null, text: "The core depends on no other package." }]);
  });

  it("stops the text of an entry at a nested list or an empty line", () => {
    const [, minor] = parseChangelog(CLIENT);
    expect(minor!.entries.map((entry) => entry.text)).toEqual([
      "The expose rule applies to each pin (CLI-47).",
      "The field `partition` reaches each collection procedure again.",
    ]);
  });

  it("joins the wrapped lines of an entry", () => {
    expect(parseChangelog("## 1.0.0\n\n- abcdef1: One long\n  sentence. Two.\n")[0]!.entries[0]!.text).toBe("One long sentence.");
  });

  it("finds the first sentence outside the code spans", () => {
    expect(firstSentence("Use `a. B` here. Then more.")).toBe("Use `a. B` here.");
    expect(firstSentence("Version 0.4.0 of `x` and `y.z` works. Next.")).toBe("Version 0.4.0 of `x` and `y.z` works.");
    expect(firstSentence("Node 22. after a lowercase word the sentence goes on. End.")).toBe("Node 22. after a lowercase word the sentence goes on.");
    expect(firstSentence("A list follows:")).toBe("A list follows.");
    expect(firstSentence("No full stop")).toBe("No full stop");
  });
});

describe("the releases", () => {
  const releases = buildReleases(changelogs, DATES);

  it("gives the versions of the group, newest first, with their kind and date", () => {
    expect(releases.map((release) => [release.version, release.kind, release.date])).toEqual([
      ["0.3.1", "patch", "2026-10-18T15:34:06-04:00"],
      ["0.3.0", "minor", "2026-10-18T13:10:35-04:00"],
      ["0.2.0", "minor", "2026-10-16T02:43:51Z"],
      ["0.1.0", "first", "2026-10-11T23:36:16-04:00"],
    ]);
  });

  it("gives one change for each commit, with the sorted packages that list it, the most packages first", () => {
    expect(releases[0]!.changes).toEqual([
      { commit: "3a235b9", text: "New: the patch operations `$remove` and `$insert` (wave 2).", packages: ["@procedures/client", "@procedures/store"] },
    ]);
    expect(releases[1]!.changes).toEqual([
      { commit: "e2fe006", text: "The expose rule applies to each pin (CLI-47).", packages: ["@procedures/client", "@procedures/store"] },
      { commit: "0c627f8", text: "`HybridStorage` keeps the queue in `v1.2` files.", packages: ["@procedures/store"] },
      { commit: "b89e3fe", text: "The field `partition` reaches each collection procedure again.", packages: ["@procedures/client"] },
    ]);
    expect(releases[2]!.changes).toEqual([]);
  });

  it("splits the data: the index with the changes of the newest version, and all the changes by version", () => {
    const { index, changes } = splitReleases({ group: "@procedures/client", releases });
    expect(index.releases.map((release) => [release.version, release.changeCount])).toEqual([
      ["0.3.1", 1],
      ["0.3.0", 3],
      ["0.2.0", 0],
      ["0.1.0", 1],
    ]);
    expect(index.releases[0]).not.toHaveProperty("changes");
    expect(Object.keys(index.changes)).toEqual(["0.3.1"]);
    expect(index.changes["0.3.1"]).toEqual(releases[0]!.changes);
    expect(Object.keys(changes)).toEqual(["0.3.1", "0.3.0", "0.2.0", "0.1.0"]);
    expect(changes["0.3.0"]).toEqual(releases[1]!.changes);
  });

  it("stops without the changelog of the group or without a date", () => {
    expect(() => buildReleases([{ name: "@procedures/store", markdown: STORE }], DATES)).toThrow(ReleaseDataError);
    expect(() => buildReleases(changelogs, new Map([["0.3.1", "2026-10-18T15:34:06Z"]]))).toThrow(/0\.3\.0 has no date/);
  });

  it("compares versions by their numbers", () => {
    expect(["0.10.0", "0.9.2", "0.13.1", "0.2.0"].sort(compareVersions)).toEqual(["0.2.0", "0.9.2", "0.10.0", "0.13.1"]);
    expect(newerVersion("0.13.1", "0.13.2")).toBe("0.13.2");
    expect(newerVersion("0.13.2", "0.9.9")).toBe("0.13.2");
    expect(newerVersion("0.13.1", null)).toBe("0.13.1");
  });
});

describe("the summary and the dates", () => {
  const releases = buildReleases(changelogs, DATES) as Release[];

  it("counts the versions and the kinds, and gives the first and the last date", () => {
    const summary = releaseSummary(releases);
    expect(summary).toEqual({ versions: 4, minor: 2, patch: 1, first: "2026-10-12T03:36:16.000Z", last: "2026-10-18T19:34:06.000Z" });
    expect(shortDate(summary.first!)).toBe("Oct 12");
    expect(longDate("2026-10-18T15:34:06-04:00")).toBe("Oct 18, 2026, 19:34 UTC");
  });

  it("names a range of days", () => {
    expect(dayRange(Date.UTC(2026, 9, 13), Date.UTC(2026, 9, 15, 23))).toBe("Oct 13–15");
    expect(dayRange(Date.UTC(2026, 8, 30), Date.UTC(2026, 9, 2))).toBe("Sep 30–Oct 2");
    expect(dayRange(Date.UTC(2026, 9, 18), Date.UTC(2026, 9, 18, 20))).toBe("Oct 18");
  });
});

describe("the timeline layout", () => {
  /** Releases at the given UTC times, one minute apart when the hours are the same. */
  const at = (...hours: Array<[day: number, hour: number]>): Release[] =>
    hours.map(([day, hour], index) => ({
      version: `0.${index + 1}.0`,
      date: new Date(Date.UTC(2026, 9, day, hour, index)).toISOString(),
      kind: "minor",
      changes: [],
    }));

  it("puts the marks from the oldest to the newest, inside the width", () => {
    const releases = at([12, 3], [16, 2], [18, 19]);
    const layout = timelineLayout([...releases].reverse(), { width: 600 });
    expect(layout.marks.map((mark) => mark.release.version)).toEqual(["0.1.0", "0.2.0", "0.3.0"]);
    for (const mark of layout.marks) {
      expect(mark.x - mark.half).toBeGreaterThanOrEqual(0);
      expect(mark.x + mark.half).toBeLessThanOrEqual(600);
    }
    expect(oldestFirst(releases).map((release) => release.version)).toEqual(["0.1.0", "0.2.0", "0.3.0"]);
  });

  it("makes one narrow band of a run of days with no release", () => {
    const layout = timelineLayout(at([12, 3], [16, 2], [18, 19]), { width: 600 });
    expect(layout.bands.map((band) => [band.label, band.count, band.empty])).toEqual([
      ["Oct 12", 1, false],
      ["Oct 13–15", 0, true],
      ["Oct 16", 1, false],
      ["Oct 17", 0, true],
      ["Oct 18", 1, false],
    ]);
    const [day, gap] = layout.bands;
    expect(gap!.x1 - gap!.x0).toBeLessThan(day!.x1 - day!.x0);
  });

  it("puts marks that are near each other into lanes, so that no two labels in a lane overlap", () => {
    const layout = timelineLayout(at([18, 1], [18, 2], [18, 3], [18, 4], [18, 20]), { width: 400 });
    expect(layout.lanes).toBeGreaterThan(1);
    expect(layout.height).toBe(layout.plotBottom + 46);
    for (const a of layout.marks) {
      for (const b of layout.marks) {
        if (a === b || a.lane !== b.lane) continue;
        expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(a.half + b.half);
      }
    }
    // A mark far from the others goes back to the lane next to the axis
    expect(layout.marks[layout.marks.length - 1]!.lane).toBe(0);
  });

  it("has no mark and no band without a release", () => {
    const layout = timelineLayout([], { width: 400 });
    expect(layout.marks).toEqual([]);
    expect(layout.bands).toEqual([]);
  });
});
