/**
 * The parser of the status board. A table that it cannot read must stop the build: the board
 * must not show a part of the data without a message.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  StatusParseError,
  areaOf,
  hashesOf,
  parseDeepDive,
  parseJulyRegister,
  readStatusData,
  readTables,
  repoOf,
  severityOf,
  splitRow,
  type HashRecord,
} from "../../scripts/status-data.mjs";
import type { CommitLink } from "../data";

const resolve = (record: HashRecord): CommitLink => ({ hash: record.hash, repo: repoOf(record, null), url: "" });

const deepDive = (rows: string, header = "| ID | Severity | Status | Commit | Note |\n|---|---|---|---|---|"): string =>
  `# Status\n\n## Core\n\n${header}\n${rows}\n`;

describe("the tables", () => {
  it("split a row, and keep a | in a code span or after a backslash", () => {
    expect(splitRow("| a | `x | y` | b \\| c |")).toEqual(["a", "`x | y`", "b | c"]);
  });

  it("stop at a row whose cells do not match the header, with the file and the line", () => {
    expect(() => readTables(deepDive("| CORE-1 | high | fixed |"), "STATUS.md")).toThrow(/STATUS\.md:7: the row has 3 cells/);
  });

  it("stop at a table without a separator line", () => {
    expect(() => readTables("## A\n\n| a | b |\n| 1 | 2 |\n", "x.md")).toThrow(StatusParseError);
  });
});

describe("the deep-dive status", () => {
  it("reads the findings of each area", () => {
    const data = parseDeepDive(deepDive("| CORE-1 | high | fixed | `8a9e7c7` | `and` runs its operands. |"), "STATUS.md", resolve);
    expect(data.areas).toEqual([{ slug: "core", label: "Core", title: "Core" }]);
    expect(data.findings).toEqual([
      {
        id: "CORE-1",
        ids: ["CORE-1"],
        area: "core",
        severity: "high",
        severityText: "high",
        status: "fixed",
        note: "`and` runs its operands.",
        commits: [{ hash: "8a9e7c7", repo: "client", url: "" }],
      },
    ]);
  });

  it("stops at a status word that the board does not know", () => {
    expect(() => parseDeepDive(deepDive("| CORE-1 | high | almost | | |"), "STATUS.md", resolve)).toThrow(/the status "almost"/);
  });

  it("stops at a table without the columns of a status table", () => {
    expect(() => parseDeepDive(deepDive("| CORE-1 | high |", "| ID | Severity |\n|---|---|"), "STATUS.md", resolve)).toThrow(/needs the columns/);
  });

  it("reads the roadmap with its phases", () => {
    const markdown = "## Architecture roadmap\n\n| Item | Status | Commit | Note |\n|---|---|---|---|\n| 1.2 Interceptors | open | | |\n";
    const data = parseDeepDive(`${deepDive("| CORE-1 | high | open | | |")}\n${markdown}`, "STATUS.md", resolve);
    expect(data.roadmap).toEqual([{ item: "1.2 Interceptors", phase: 1, status: "open", note: "", commits: [] }]);
  });
});

describe("cells", () => {
  it("give the highest severity", () => {
    expect(severityOf("critical / high")).toBe("critical");
    expect(severityOf("low–medium")).toBe("medium");
    expect(severityOf("")).toBeNull();
  });

  it("give short names to the known areas", () => {
    expect(areaOf("The `mark` CLI and the servers")).toEqual({ slug: "cli", label: "CLI" });
    expect(areaOf("Tool wrappers")).toEqual({ slug: "wrappers", label: "Wrappers" });
    expect(areaOf("Plans")).toEqual({ slug: "plans", label: "Plans" });
  });

  it("find the repository next to a hash, before it or in parentheses after it", () => {
    expect(hashesOf("`docker-sqlite` `239baa6`, `5845f2c`")).toEqual([
      { hash: "239baa6", adjacent: "docker-sqlite", named: "docker-sqlite" },
      { hash: "5845f2c", adjacent: null, named: "docker-sqlite" },
    ]);
    expect(hashesOf("`352adc9` (`docker-sqlite`), `3e509e5` (lockfile)")).toEqual([
      { hash: "352adc9", adjacent: "docker-sqlite", named: "docker-sqlite" },
      { hash: "3e509e5", adjacent: null, named: "docker-sqlite" },
    ]);
  });

  it("give the repository: the history decides in a full clone, a name next to the hash in a shallow one", () => {
    const named = { hash: "f2bb602", adjacent: null, named: "cue" };
    expect(repoOf(named, true)).toBe("client");
    expect(repoOf(named, false)).toBe("cue");
    expect(repoOf(named, null)).toBe("client");
    expect(repoOf({ hash: "150df3b", adjacent: "cue", named: "cue" }, null)).toBe("cue");
  });
});

describe("the July register", () => {
  it("needs the summary table", () => {
    expect(() => parseJulyRegister("## Fixed\n\n| ID | Fix | Commit |\n|---|---|---|\n| L7 | x | `727c00d` |\n", "BUGS.md", resolve)).toThrow(
      /no summary table/,
    );
  });
});

describe("the documents of the repository", () => {
  it("are readable, and each finding has a known area", () => {
    const packages = join(fileURLToPath(new URL("../../..", import.meta.url)));
    const data = readStatusData(packages, join(packages, ".."));
    expect(data.findings.length).toBeGreaterThan(50);
    const areas = new Set(data.areas.map((area) => area.slug));
    for (const finding of data.findings) expect(areas.has(finding.area)).toBe(true);
    expect(data.july.summary.length).toBeGreaterThan(0);
  });
});
