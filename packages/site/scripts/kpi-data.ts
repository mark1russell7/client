// The measures of the file `kpi.json` of the site. The file `scripts/kpi.ts` reads the sources and writes the file.
//
// A count from a committed file has the time of the commit. A measure from GitHub has the time of its data.
// A failed read of GitHub gives no measure, so the file does not show a value that nobody read.

import type { GitHubGreenRun, KpiMeasure } from "@mark1russell7/site-pages";

/** The workflow that the measure `nightly-green-run` reads. */
export const NIGHTLY_WORKFLOW = "nightly.yml";

/** A script in JavaScript: in the `scripts` folder of the root or of a package. */
const JS_SCRIPT = /^(scripts|packages\/[^/]+\/scripts)\/.*\.(js|mjs|cjs)$/;

/** This function counts the scripts in JavaScript in a list of the paths of the repository. */
export function jsScripts(paths: readonly string[]): number {
  return paths.filter((path) => JS_SCRIPT.test(path)).length;
}

/** This function gives the measures of the site from the paths of the commit and the read of the scheduled runs. */
export function kpiMeasures({ paths, nightly }: { paths: readonly string[]; nightly: GitHubGreenRun }): KpiMeasure[] {
  const scripts: KpiMeasure = {
    id: "js-scripts",
    value: jsScripts(paths),
    unit: "files",
    notCounted: "JavaScript files outside a scripts folder of the root or of a package, and scripts in TypeScript.",
  };
  if (!nightly.available) return [scripts];
  return [
    scripts,
    {
      id: "nightly-green-run",
      value: nightly.value,
      unit: "runs",
      at: nightly.at,
      notCounted: `Runs that a person started, and scheduled runs older than the newest 30 of ${NIGHTLY_WORKFLOW}.`,
    },
  ];
}
