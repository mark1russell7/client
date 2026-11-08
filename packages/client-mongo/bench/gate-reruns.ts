/**
 * The count of the reruns of the speed gate of the store (roadmap CLI-94): `<file>...`, one `gate-report.json` for each try.
 * This script prints the no reads of each pull request, the reruns that follow them and the passes that follow them.
 * The level does not count a rerun as a look. So a pass after a no read has less weight than a first pass.
 */

import { readFileSync } from "node:fs";
import { rerunCounts, type GateAttempt } from "./gate-verdict.js";

const files = process.argv.slice(2);
if (files.length === 0) throw new RangeError("this script needs one report for each try");
console.log(JSON.stringify(rerunCounts(files.map((file) => JSON.parse(readFileSync(file, "utf8")) as GateAttempt)), null, 2));
