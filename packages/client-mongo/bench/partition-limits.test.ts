import { describe, expect, it } from "vitest";
import { MODEL_LIMIT_RULE, candidateLimits, freezeLimits, type ModelLimitsFile, type ModelRead } from "@mark1russell7/rigor-bench";
import { PARTITION_CASES, type TenantCount } from "./tenant-cases.js";
import { PARTITION_GATE_CASES, PARTITION_MEASURE, partitionGate, partitionReads, type LadderRung } from "./partition-limits.js";

const row = (arm: string, name: string, p99Ms: number): TenantCount => ({ job: "1", arm, case: name, p99Ms }) as unknown as TenantCount;

const model = "AMD EPYC 7763 64-Core Processor";
const frozen: ModelLimitsFile = freezeLimits(
  PARTITION_MEASURE,
  candidateLimits(PARTITION_GATE_CASES.flatMap((name) => [10, 11, 12, 13, 14].map((value): ModelRead => ({ case: name, model, value })))),
  { commit: "0123456789abcdef0123456789abcdef01234567", date: "2026-11-15" },
  MODEL_LIMIT_RULE,
);
const limitOf = (name: string): number => frozen.limits[name]![model]!.limit;
const passing: LadderRung[] = PARTITION_GATE_CASES.map((name) => ({ case: name, outcome: "provisional pass" }));
const readsAt = (value: number, cpu = model): ModelRead[] => PARTITION_GATE_CASES.map((name) => ({ case: name, model: cpu, value }));

describe("partitionReads", () => {
  it("gives the median of the p99 of the children of the arm partition, for each job and case", () => {
    const counts = [row("partition", "200-p2", 9), row("partition", "200-p2", 30), row("partition", "200-p2", 12), row("control", "200-p2", 500)];
    expect(partitionReads([{ file: "job-1-200-p2.json", cpu: ` ${model} `, counts }])).toEqual({ reads: [{ case: "200-p2", model, value: 12 }], faults: [] });
  });

  it("gives the model unknown to a job with no CPU model", () => {
    const counts = [9, 10, 11].map((value) => row("partition", "200-p4", value));
    expect(partitionReads([{ file: "a.json", cpu: "", counts }]).reads).toEqual([{ case: "200-p4", model: "unknown", value: 10 }]);
  });

  it("gives no read for a job with another count of children, because its statistic has another spread", () => {
    const counts = [row("partition", "200-p2", 9), row("partition", "200-p2", 10)];
    const read = partitionReads([{ file: "job-2-200-p2.json", cpu: model, counts }]);
    expect(read.reads).toEqual([]);
    expect(read.faults).toEqual(["job-2-200-p2.json: the case 200-p2 has 2 children of the arm partition, not 3"]);
  });
});

describe("partitionGate", () => {
  it("has its cases in the suite tenant-partition", () => {
    for (const name of PARTITION_GATE_CASES) expect(PARTITION_CASES).toContain(name);
  });

  it("passes when each case reads within the limit of its CPU model", () => {
    const gate = partitionGate(frozen, readsAt(limitOf("200-p2") - 0.01), passing);
    expect([gate.outcome, gate.exitCode, gate.rerun]).toEqual(["pass", 0, []]);
  });

  it("blocks a read beyond the limit of its CPU model", () => {
    const reads = [...readsAt(12), { case: "200-p4", model, value: limitOf("200-p4") + 0.01 }];
    const gate = partitionGate(frozen, reads, passing);
    expect([gate.outcome, gate.exitCode]).toEqual(["block", 1]);
    expect(gate.cases.map((entry) => entry.outcome)).toEqual(["pass", "block"]);
  });

  it("gives no read on a CPU model with no limit, and names each case for one more job", () => {
    const gate = partitionGate(frozen, readsAt(12, "Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz"), passing);
    expect([gate.outcome, gate.exitCode, gate.rerun]).toEqual(["no read", 2, ["200-p2", "200-p4"]]);
  });

  it("passes a case of the second look when one read is within and the other model has no limit", () => {
    const gate = partitionGate(frozen, [...readsAt(12, "Intel(R) Xeon(R) Platinum 8370C CPU @ 2.80GHz"), ...readsAt(12)], passing);
    expect(gate.outcome).toBe("pass");
  });

  it("keeps the absolute reading: a failed rung blocks, and a rung with no reading or no rung gives no read", () => {
    const failed = partitionGate(frozen, readsAt(12), [{ case: "200-p2", outcome: "fail" }, passing[1]!]);
    expect(failed.outcome).toBe("block");
    const noReading = partitionGate(frozen, readsAt(12), [{ case: "200-p2", outcome: "no reading" }]);
    expect(noReading.cases.map((entry) => [entry.absolute, entry.outcome])).toEqual([
      ["no reading", "no read"],
      ["missing", "no read"],
    ]);
  });

  it("gives no read for a case with no job", () => {
    const gate = partitionGate(frozen, readsAt(12).slice(0, 1), passing);
    expect(gate.cases[1]).toMatchObject({ case: "200-p4", outcome: "no read", note: "200-p4: no read on a CPU model with a limit (no job)" });
  });

  it("refuses a file of limits with a fault", () => {
    const broken = { ...frozen, limits: { "200-p2": { [model]: { ...frozen.limits["200-p2"]![model]!, limit: 1 } } } };
    expect(() => partitionGate(broken, readsAt(12), passing)).toThrow(/faults/);
  });
});
