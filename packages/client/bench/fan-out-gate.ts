/**
 * The gate of the fan-out bench: `--report <file>`. This script reads the field `growth` of the report. It fails when
 * the outcome is `block` or `no read`, because a `no read` is not a pass.
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: { report: { type: "string" } } });
if (values.report === undefined) throw new RangeError("this gate needs --report");
const { growth } = JSON.parse(readFileSync(values.report, "utf8")) as { growth: { outcome: string; reason: string } };
console.log(`fan-out growth gate: ${growth.outcome}${growth.reason === "" ? "" : `: ${growth.reason}`}`);
if (growth.outcome !== "pass") process.exitCode = 1;
