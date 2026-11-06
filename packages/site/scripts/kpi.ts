// This script writes `kpi.json` into the built site, with the typed writer of site-pages.
//
// The top time of the file is the time of the commit, not the time of the build.
// Without git the build stays good and the site has no file. A failed read of GitHub removes one measure.

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { githubGreenRun, writeKpi } from "@mark1russell7/site-pages";
import { commitTime } from "@mark1russell7/site-pages/vite";
import { kpiMeasures, NIGHTLY_WORKFLOW } from "./kpi-data.ts";

const SITE = fileURLToPath(new URL("..", import.meta.url));
const REPO = join(SITE, "..", "..");

/** This function gives the output of a git command at the root of the repository, or `null` when it fails. */
function git(...args: string[]): string | null {
  try {
    return execFileSync("git", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).trim() || null;
  } catch {
    return null;
  }
}

const commit = git("rev-parse", "HEAD");
const paths = git("ls-files");
if (commit === null || paths === null) {
  process.stderr.write("kpi: git gives no commit or no files, so the site has no kpi.json.\n");
} else {
  const nightly = await githubGreenRun({ owner: "mark1russell7", repo: "client", token: process.env["GITHUB_TOKEN"], workflow: NIGHTLY_WORKFLOW });
  if (!nightly.available) process.stderr.write(`kpi: no measure nightly-green-run: ${nightly.reason}.\n`);
  const file = writeKpi(join(SITE, "dist"), {
    project: "client",
    at: commitTime({}, REPO),
    commit,
    measures: kpiMeasures({ paths: paths.split("\n"), nightly }),
  });
  process.stdout.write(`kpi: wrote ${file}\n`);
}
