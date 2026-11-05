/**
 * The report of the test of the rule (roadmap CLI-96): `--jobs <folder> --out <file> [--run <id>]`.
 * The exit code is 1 when a case does not give its expected result: a miss where the rule holds, or no miss where the case expects one.
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { RULE_CASES, type RuleRound } from "./tenant-rule-cases.js";

const { values } = parseArgs({ options: { jobs: { type: "string" }, out: { type: "string" }, run: { type: "string" } } });
if (values.jobs === undefined || values.out === undefined) throw new RangeError("this report needs --jobs and --out");
const folder = values.jobs;

const jobs = readdirSync(folder)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(join(folder, name), "utf8")) as { job: string; env: unknown; results: RuleRound[] });
const rounds = jobs.flatMap((job) => job.results);

const expected = new Map<string, "none" | "some">([...RULE_CASES.map((kase) => [kase.id, kase.miss] as const), ["formc-stamp", "some"], ["formc-stream", "none"]]);
const cases = [...expected].map(([id, miss]) => {
  const own = rounds.filter((round) => round.case === id);
  const missed = own.reduce((sum, round) => sum + round.missed, 0);
  const errors: Record<string, number> = {};
  for (const round of own) for (const [kind, count] of Object.entries(round.errors)) errors[kind] = (errors[kind] ?? 0) + count;
  const asExpected = own.length > 0 && (miss === "none" ? missed === 0 : missed > 0);
  return {
    case: id,
    expected: miss,
    asExpected,
    rounds: own.length,
    replied: own.reduce((sum, round) => sum + round.replied, 0),
    missed,
    examples: own.flatMap((round) => round.examples).slice(0, 5),
    deltas: own.reduce((sum, round) => sum + round.deltas, 0),
    laterFulls: own.reduce((sum, round) => sum + round.laterFulls, 0),
    errors,
  };
});

writeFileSync(values.out, `${JSON.stringify({ schema: "tenant-rule/1", run: values.run ?? "", cases, env: jobs.map(({ job, env }) => ({ job, env })) }, null, 2)}\n`);
const wrong = cases.filter((one) => !one.asExpected).map((one) => one.case);
console.log(wrong.length === 0 ? "PASS: each case gives its expected result." : `FAIL: these cases do not give their expected result: ${wrong.join(", ")}.`);
if (wrong.length > 0) process.exitCode = 1;
