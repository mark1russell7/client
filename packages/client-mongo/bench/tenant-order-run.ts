/**
 * One job of the suite `tenant-order` (roadmap CLI-96): `--job <n> --rounds <n> --cap <seconds> --out <file>`.
 * Each round of each copy of the store runs one child on a new database.
 */

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { benchEnv } from "@mark1russell7/rigor-bench/fresh";
import { writeFormCopies } from "./tenant-form-copies.js";
import { ORDER_COPIES, ORDER_HOLD_MS, type OrderRound } from "./tenant-order-cases.js";

const { values } = parseArgs({ options: { job: { type: "string" }, rounds: { type: "string" }, cap: { type: "string" }, out: { type: "string" } } });
const job = Number(values.job);
const rounds = Number(values.rounds);
const cap = Number(values.cap);
if (!Number.isInteger(job) || !Number.isInteger(rounds) || !(cap > 0) || values.out === undefined) throw new RangeError("this job needs --job, --rounds, --cap and --out");

writeFormCopies();

/** This function runs one child and gives its last line of stdout. */
function runChild(copy: string, database: string): Promise<string> {
  const child = spawn(process.execPath, ["--import", "tsx", "bench/tenant-order-child.ts", "--copy", copy, "--database", database], { stdio: ["ignore", "pipe", "inherit"], env: { ...process.env, FORM_HOLD_MS: String(ORDER_HOLD_MS) } });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const timer = setTimeout(() => child.kill("SIGKILL"), cap * 1000);
  return new Promise<string>((resolve, reject) => {
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output.trim().split("\n").at(-1) ?? "");
      else reject(new Error(`the child of ${copy} ended with the code ${String(code)}`));
    });
  });
}

const results: OrderRound[] = [];
for (let round = 0; round < rounds; round++) {
  for (const copy of ORDER_COPIES) {
    const line = await runChild(copy, `order_${String(job)}_${String(round)}_${copy}`);
    const result: OrderRound = { copy, round: (job - 1) * rounds + round, ...(JSON.parse(line) as Omit<OrderRound, "copy" | "round">) };
    results.push(result);
    console.log(JSON.stringify(result));
  }
}
mkdirSync(dirname(values.out), { recursive: true });
writeFileSync(values.out, `${JSON.stringify({ job: String(job), env: benchEnv(), results })}\n`);
process.exit(0);
