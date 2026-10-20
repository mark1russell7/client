/**
 * The releases page: the split of the release data, the summary line and the layout of the
 * timeline. `@mark1russell7/site-pages` reads the changelogs, and its own tests cover the parser.
 */

import { describe, it, expect } from "vitest";
import { splitReleases } from "../../scripts/releases-data.mjs";
import type { Release } from "../data";
import { dayRange, longDate, oldestFirst, releaseSummary, shortDate, timelineLayout } from "./releases";
import { newerVersion } from "./versions";

/** The releases of a group of two packages, newest first, as `readReleases` gives them. */
const RELEASES: Release[] = [
  {
    version: "0.3.1",
    date: "2026-10-18T15:34:06-04:00",
    kind: "patch",
    changes: [{ commit: "3a235b9", text: "New: the patch operations `$remove` and `$insert` (wave 2).", packages: ["@procedures/client", "@procedures/store"] }],
  },
  {
    version: "0.3.0",
    date: "2026-10-18T13:10:35-04:00",
    kind: "minor",
    changes: [
      { commit: "e2fe006", text: "The expose rule applies to each pin (CLI-47).", packages: ["@procedures/client", "@procedures/store"] },
      { commit: "0c627f8", text: "`HybridStorage` keeps the queue in `v1.2` files.", packages: ["@procedures/store"] },
      { commit: "b89e3fe", text: "The field `partition` reaches each collection procedure again.", packages: ["@procedures/client"] },
    ],
  },
  { version: "0.2.0", date: "2026-10-16T02:43:51Z", kind: "minor", changes: [] },
  { version: "0.1.0", date: "2026-10-11T23:36:16-04:00", kind: "first", changes: [{ commit: null, text: "The core depends on no other package.", packages: ["@procedures/client"] }] },
];

describe("the release data", () => {
  it("splits the data: the index with the changes of the newest version, and all the changes by version", () => {
    // The package gives the links of each version. The page makes its own, so the index drops them.
    const withLinks = RELEASES.map((release) => ({ ...release, links: [{ label: "Tag", url: `https://example.com/${release.version}` }] }));
    const { index, changes } = splitReleases({ group: "@procedures/client", releases: withLinks });
    expect(index.releases.map((release) => [release.version, release.changeCount])).toEqual([
      ["0.3.1", 1],
      ["0.3.0", 3],
      ["0.2.0", 0],
      ["0.1.0", 1],
    ]);
    expect(index.releases[0]).not.toHaveProperty("changes");
    expect(index.releases[0]).not.toHaveProperty("links");
    expect(Object.keys(index.changes)).toEqual(["0.3.1"]);
    expect(index.changes["0.3.1"]).toEqual(RELEASES[0]!.changes);
    expect(Object.keys(changes)).toEqual(["0.3.1", "0.3.0", "0.2.0", "0.1.0"]);
    expect(changes["0.3.0"]).toEqual(RELEASES[1]!.changes);
  });

  it("knows the newer of two versions by their numbers", () => {
    expect(newerVersion("0.13.1", "0.13.2")).toBe("0.13.2");
    expect(newerVersion("0.13.2", "0.9.9")).toBe("0.13.2");
    expect(newerVersion("0.13.1", null)).toBe("0.13.1");
  });
});

describe("the summary and the dates", () => {
  it("counts the versions and the kinds, and gives the first and the last date", () => {
    const summary = releaseSummary(RELEASES);
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
