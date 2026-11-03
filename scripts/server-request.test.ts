// Tests of the pure parts of the server request bench (O90, O94). No test starts a process or times code.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PairedReport } from "./lib/paired-time.mjs";
import {
  bytesOf,
  caseOf,
  chainSteps,
  FIT_BOOTSTRAP,
  FIT_MODEL,
  fitOf,
  fitRowsOf,
  FORMAT,
  jsonBytes,
  markdownOf,
  PROFILE_DEFAULTS,
  PROFILE_INTERVAL_US,
  profileOptionsOf,
  recordOf,
  REQUESTS,
  SHARE_BOOTSTRAP,
  shareOf,
  type CaseBytes,
  type FitRow,
} from "./server-request.ts";
import {
  groupOf,
  HOST_GROUP,
  HOST_SIDE,
  isHostSide,
  keyOf,
  locationOf,
  OUTCOME_LIMITS,
  outcomesOf,
  PROFILE_FORMAT,
  profileAnalysisOf,
  profileMarkdownOf,
  sampleTimesOf,
  selfTimesOf,
  type CpuProfile,
  type ExcessRow,
  type ProfileRecord,
} from "./server-request-profile.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-12;

// The fit of the tests: 0.4 ms fixed, 0.00002 ms (20 µs per KB) for each byte of the input, 0.00001 ms for each byte of the result
const TRUE_FIT = { fixedMs: 0.4, msPerByteIn: 2e-5, msPerByteOut: 1e-5 };
const transportOf = (b: CaseBytes) => TRUE_FIT.fixedMs + TRUE_FIT.msPerByteIn * b.bytesIn + TRUE_FIT.msPerByteOut * b.bytesOut;

// The bytes of every case, for the tests. The three cases of the report have the true bytes of one-call, chain-50 and range-1000
const BYTES: Record<string, CaseBytes> = Object.fromEntries(Object.keys(REQUESTS).map((id, k) => [id, { bytesIn: 100 * k + 10, bytesOut: 1000 * (k % 3) + 5 }]));
Object.assign(BYTES, { "one-call": { bytesIn: 13, bytesOut: 1 }, "chain-50": { bytesIn: 3196, bytesOut: 2 }, "range-1000": { bytesIn: 22, bytesOut: 3891 } });

/** This function gives a paired-time/1 report of the cases, with 3 rounds of exact transport times. */
function reportOf(execs: Readonly<Record<string, number>>): PairedReport {
  const inputs = Object.entries(execs).map(([id, exec]) => {
    const request = exec + transportOf(BYTES[id]!);
    return { id, ms: { request: [request, request, request], exec: [exec, exec, exec], "request~aa": [request, request, request] }, median: {}, ratio: { "request~aa": 1 } };
  });
  const env = { cpu: "test", cores: 1, os: "test", arch: "x64", node: "v26.0.0" };
  return { schema: "paired-time/1", mode: "fresh", env, base: "request", arms: ["request", "exec", "request~aa"], inputs, ratios: {}, noiseFloor: null };
}

const CONTEXT = { refs: { head: "abc" }, node: "v26.0.0", run: { label: "local" }, runner: { cpu: "test", cores: 1, node: "v26.0.0", platform: "linux", arch: "x64" }, rounds: 3 };
const report = reportOf({ "one-call": 0.005, "chain-50": 0.8, "range-1000": 0.1 });
const record = recordOf(report, BYTES, CONTEXT);

describe("server-request", () => {
  it("gives the share: the median of the exec samples over the median of the request samples", () => {
    // The per-process medians of 5 rounds, in microseconds (the unit has no effect on the share)
    const s = shareOf([100, 120, 80, 110, 90], [5, 6, 4, 7, 3]);
    assert.equal(s.rounds, 5);
    assert.ok(near(s.request.median, 100));
    assert.ok(near(s.exec.median, 5));
    assert.ok(near(s.share, 0.05));
    assert.deepEqual(s.samples.request, [100, 120, 80, 110, 90]);
    assert.deepEqual(s.samples.exec, [5, 6, 4, 7, 3]);
  });

  it("gives the bootstrap interval of the share: 10 000 runs, seed 1, around the share", () => {
    const s = shareOf([100, 120, 80, 110, 90], [5, 6, 4, 7, 3]);
    assert.ok(near(s.interval.estimate, s.share));
    assert.equal(s.interval.runs, SHARE_BOOTSTRAP.runs);
    assert.equal(s.interval.seed, SHARE_BOOTSTRAP.seed);
    assert.equal(s.interval.level, 0.95);
    assert.equal(s.interval.finite, SHARE_BOOTSTRAP.runs);
    assert.ok(s.interval.low <= s.share && s.share <= s.interval.high);
    assert.ok(s.interval.low < s.interval.high);
    // The same samples give the same interval: the seed fixes the draws
    assert.deepEqual(shareOf([100, 120, 80, 110, 90], [5, 6, 4, 7, 3]).interval, s.interval);
  });

  it("gives an interval of one point when the samples do not vary", () => {
    const s = shareOf([2, 2, 2, 2], [0.5, 0.5, 0.5, 0.5]);
    assert.ok(near(s.interval.low, 0.25));
    assert.ok(near(s.interval.high, 0.25));
  });

  it("gives the round-paired ratios exec / request, and their p10 to p90", () => {
    const s = shareOf([1, 2, 4, 5, 10], [0.1, 0.1, 0.2, 0.5, 0.5]);
    assert.deepEqual(s.paired, [0.1, 0.05, 0.05, 0.1, 0.05]);
    assert.ok(near(s.pairedBand.median, 0.05));
    assert.ok(near(s.pairedBand.p10, 0.05));
    assert.ok(near(s.pairedBand.p90, 0.1));
    // The share of the medians is not the median of the round ratios
    assert.ok(near(s.share, 0.2 / 4));
  });

  it("pairs only the rounds that both arms have", () => {
    const s = shareOf([1, 2, 3], [0.5, 1]);
    assert.equal(s.rounds, 2);
    assert.deepEqual(s.paired, [0.5, 0.5]);
  });

  it("gives the A/A band of the request arm from the input of a paired-time/1 report", () => {
    const input = {
      id: "one-call",
      ms: { request: [1, 2, 4], exec: [0.1, 0.2, 0.4], "request~aa": [1.1, 1.8, 4] },
      median: { request: 2, exec: 0.2, "request~aa": 1.8 },
      ratio: { exec: 0.1, "request~aa": 0.9 },
    };
    const c = caseOf(input);
    assert.ok(near(c.share, 0.1));
    assert.ok(c.aa !== null);
    assert.equal(c.aa.ratio, 0.9);
    assert.ok(near(c.aa.band.median, 1));
    assert.ok(caseOf({ ...input, ms: { request: [1], exec: [0.1] } }).aa === null);
  });

  it("gives a Markdown table for each case, and says that the requests are synthetic", () => {
    const md = markdownOf(record);
    assert.ok(md.startsWith("# Server request (O90, O94)\n"));
    assert.ok(md.includes("The requests are synthetic: no record of real traffic exists (O91)."));
    assert.ok(md.includes("The share interval is the 95 % percentile bootstrap of rigor-statistics: 10000 runs, seed 1."));
    assert.ok(md.includes("## `one-call`"));
    assert.ok(md.includes(`Each process: ${REQUESTS["one-call"].warmup} warm-up calls, then ${REQUESTS["one-call"].calls} timed calls.`));
    assert.ok(md.includes("`client.add` of 1 and 2. Input 13 bytes, result 1 bytes. Each process: 2000 warm-up calls, then 2000 timed calls."));
    assert.ok(md.includes("| Request median µs | Exec median µs | Share | Share 95 % interval | Round-paired p10 to p90 | A/A p10 to p90 |"));
    // The request of one-call is 0.005 ms of exec plus 0.40027 ms of transport: the share is 0.005 / 0.40527
    assert.ok(md.includes("| 405.3 | 5.0 | 1.2 % | 1.2 % to 1.2 % | 1.2 % to 1.2 % | 1.000 to 1.000 |"));
  });

  it("gives the Markdown of the fit: the coefficients in µs and µs per KB, and a row for each case", () => {
    const md = markdownOf(record);
    assert.ok(md.includes("## The transport time per byte (O94)"));
    assert.ok(md.includes("One KB is 1000 bytes."));
    assert.ok(md.includes("The transport time is the request sample minus the exec sample of the same round."));
    assert.ok(md.includes(`Its intervals are the 95 % percentile bootstrap of rigor-statistics: ${FIT_BOOTSTRAP.runs} runs, seed ${FIT_BOOTSTRAP.seed}.`));
    assert.ok(md.includes("9 rows, r² 1.000, residual SD 0.0 µs."));
    assert.ok(md.includes("| Coefficient | Estimate | 95 % interval |"));
    assert.ok(md.includes("| Fixed, µs | 400.0 | 400.0 to 400.0 |"));
    assert.ok(md.includes("| Each KB of the input, µs | 20.00 | 20.00 to 20.00 |"));
    assert.ok(md.includes("| Each KB of the result, µs | 10.00 | 10.00 to 10.00 |"));
    assert.ok(md.includes("| Case | Input bytes | Result bytes | Rounds | Transport median µs | Fitted µs |"));
    assert.ok(md.includes("| `one-call` | 13 | 1 | 3 | 400.3 | 400.3 |"));
    assert.ok(md.includes("| `chain-50` | 3196 | 2 | 3 | 463.9 | 463.9 |"));
    // The fit table comes before the tables of the cases
    assert.ok(md.indexOf("## The transport time per byte (O94)") < md.indexOf("## `one-call`"));
  });

  it("writes none in the Markdown for a fit without numbers", () => {
    const md = markdownOf({ ...record, fit: fitOf([]) });
    assert.ok(md.includes("0 rows, r² none, residual SD none µs."));
    assert.ok(md.includes("| Fixed, µs | none | none to none |"));
    assert.ok(md.includes("| Each KB of the input, µs | none | none to none |"));
  });
});

describe("server-request cases", () => {
  it("keeps the ids, labels, paths, inputs and counts of one-call and chain-50 (O90)", () => {
    assert.deepEqual(REQUESTS["one-call"], { label: "`client.add` of 1 and 2", path: ["client", "add"], input: { a: 1, b: 2 }, warmup: 2000, calls: 2000 });
    const chain50 = REQUESTS["chain-50"];
    assert.equal(chain50.label, "`client.chain` of 50 steps of `client.add`");
    assert.deepEqual(chain50.path, ["client", "chain"]);
    assert.equal(chain50.warmup, 200);
    assert.equal(chain50.calls, 500);
    // The steps of O90: client.add of 0 and 1, then 49 steps that add 1 to $last
    const add = (a: unknown, b: unknown) => ({ $proc: ["client", "add"], input: { a, b } });
    assert.deepEqual(chain50.input, { steps: [add(0, 1), ...Array.from({ length: 49 }, () => add({ $ref: "$last" }, 1))] });
  });

  it("has the nine cases of O94, in order", () => {
    assert.deepEqual(Object.keys(REQUESTS), ["one-call", "chain-1", "chain-10", "chain-50", "chain-200", "range-100", "range-1000", "range-10000", "identity-1000"]);
    for (const x of Object.values(REQUESTS)) {
      assert.ok(Number.isInteger(x.warmup) && x.warmup > 0);
      assert.ok(Number.isInteger(x.calls) && x.calls > 0);
      assert.equal(x.path[0], "client");
    }
  });

  it("gives the chains N steps of client.add, with the step shape of chain-50", () => {
    for (const n of [1, 10, 50, 200]) {
      const x = REQUESTS[`chain-${n}` as keyof typeof REQUESTS];
      assert.deepEqual(x.path, ["client", "chain"]);
      assert.deepEqual(x.input, { steps: chainSteps(n) });
      assert.equal(chainSteps(n).length, n);
    }
    assert.deepEqual(chainSteps(1), [{ $proc: ["client", "add"], input: { a: 0, b: 1 } }]);
    assert.deepEqual(chainSteps(2)[1], { $proc: ["client", "add"], input: { a: { $ref: "$last" }, b: 1 } });
    assert.equal(REQUESTS["chain-1"].label, "`client.chain` of 1 step of `client.add`");
    assert.equal(REQUESTS["chain-200"].label, "`client.chain` of 200 steps of `client.add`");
  });

  it("gives the ranges from 0 to M, and the identity of 1000 numbers", () => {
    for (const m of [100, 1000, 10_000]) {
      const x = REQUESTS[`range-${m}` as keyof typeof REQUESTS];
      assert.deepEqual(x.path, ["client", "range"]);
      assert.deepEqual(x.input, { start: 0, end: m });
    }
    assert.equal(REQUESTS["range-10000"].label, "`client.range` from 0 to 10000, without 10000");
    assert.deepEqual(REQUESTS["identity-1000"].path, ["client", "identity"]);
    assert.deepEqual(REQUESTS["identity-1000"].input, { value: Array.from({ length: 1000 }, (_, i) => i) });
  });

  it("gives each new chain about the work of a request sample of chain-50, from the times of O90", () => {
    // O90: 518 µs for one client.add, 2302 µs for a chain of 50 steps, thus about 482 µs plus 36 µs for each step
    const work = (n: number) => {
      const x = REQUESTS[`chain-${n}` as keyof typeof REQUESTS];
      return (x.warmup + x.calls) * (482 + 36 * n);
    };
    for (const n of [1, 10, 200]) assert.ok(Math.abs(work(n) / work(50) - 1) < 0.1, `chain-${n}: ${work(n) / work(50)}`);
  });
});

describe("server-request bytes", () => {
  it("gives the UTF-8 bytes of the JSON of a value", () => {
    assert.equal(jsonBytes({ a: 1, b: 2 }), 13);
    assert.equal(jsonBytes(3), 1);
    // The JSON of µ is "µ": 2 quotes and 2 bytes of UTF-8
    assert.equal(jsonBytes("µ"), 4);
    assert.equal(jsonBytes(undefined), 0);
    assert.equal(jsonBytes(null), 4);
  });

  it("gives the bytes of a case from its input and its result", () => {
    assert.deepEqual(bytesOf(REQUESTS["one-call"].input, 3), { bytesIn: 13, bytesOut: 1 });
    // client.range gives the numbers from start up to end, without end
    for (const [m, bytesIn, bytesOut] of [[100, 21, 291], [1000, 22, 3891], [10_000, 23, 48_891]] as const) {
      const x = REQUESTS[`range-${m}` as keyof typeof REQUESTS];
      assert.deepEqual(bytesOf(x.input, Array.from({ length: m }, (_, i) => i)), { bytesIn, bytesOut });
    }
    // client.identity gives its value: the input has the 10 bytes of {"value":} more than the result
    const identity = REQUESTS["identity-1000"].input;
    assert.deepEqual(bytesOf(identity, identity.value), { bytesIn: 3901, bytesOut: 3891 });
  });

  it("gives the input bytes of the chains: 60 bytes for the first step, and 64 bytes for each other step", () => {
    for (const n of [1, 10, 50, 200]) {
      const x = REQUESTS[`chain-${n}` as keyof typeof REQUESTS];
      assert.equal(bytesOf(x.input, n).bytesIn, 60 + 64 * (n - 1));
    }
    assert.equal(jsonBytes(REQUESTS["chain-200"].input), 12_796);
  });
});

describe("server-request fit rows", () => {
  const bytes = { a: { bytesIn: 10, bytesOut: 20 }, b: { bytesIn: 30, bytesOut: 40 } };

  it("gives one row for each case and round: the request sample minus the exec sample of the same round", () => {
    const rows = fitRowsOf({ a: { samples: { request: [1, 2], exec: [0.25, 0.5] } }, b: { samples: { request: [4], exec: [1] } } }, bytes);
    assert.deepEqual(rows, [
      { id: "a", round: 0, bytesIn: 10, bytesOut: 20, ms: 0.75 },
      { id: "a", round: 1, bytesIn: 10, bytesOut: 20, ms: 1.5 },
      { id: "b", round: 0, bytesIn: 30, bytesOut: 40, ms: 3 },
    ]);
  });

  it("pairs only the rounds that both arms have, as roundRatios pairs them", () => {
    const rows = fitRowsOf({ a: { samples: { request: [1, 2, 3], exec: [0.5, 1] } }, b: { samples: { request: [4], exec: [1, 2, 3] } } }, bytes);
    assert.deepEqual(
      rows.map((r) => [r.id, r.round, r.ms]),
      [["a", 0, 0.5], ["a", 1, 1], ["b", 0, 3]],
    );
  });

  it("skips a round whose request sample is not above 0, and a sample that is not finite", () => {
    const rows = fitRowsOf({ a: { samples: { request: [0, -1, Number.NaN, 2, Number.POSITIVE_INFINITY, 3], exec: [0.1, 0.1, 0.1, Number.NaN, 0.1, 1] } } }, bytes);
    assert.deepEqual(
      rows.map((r) => [r.round, r.ms]),
      [[5, 2]],
    );
  });

  it("gives no rows without samples, and throws for a case without bytes", () => {
    assert.deepEqual(fitRowsOf({ a: { samples: { request: [], exec: [] } } }, bytes), []);
    assert.throws(() => fitRowsOf({ c: { samples: { request: [1], exec: [0.5] } } }, bytes), /The case c has no bytes/);
  });

  it("gives the rows of the shares of caseOf", () => {
    const rows = fitRowsOf(record.cases, BYTES);
    assert.equal(rows.length, 9);
    assert.ok(rows.every((r) => Math.abs(r.ms - transportOf(BYTES[r.id]!)) < 1e-12));
  });
});

describe("server-request fit", () => {
  // Five cases with bytes that are not on one line, 4 rounds each, and exact transport times
  const cases: CaseBytes[] = [
    { bytesIn: 13, bytesOut: 1 },
    { bytesIn: 3196, bytesOut: 2 },
    { bytesIn: 22, bytesOut: 48_891 },
    { bytesIn: 3901, bytesOut: 3891 },
    { bytesIn: 12_796, bytesOut: 3 },
  ];
  const exactRows: FitRow[] = cases.flatMap((b, k) => [0, 1, 2, 3].map((round) => ({ id: `c${k}`, round, ...b, ms: transportOf(b) })));
  const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

  it("gives the known coefficients of exact rows, with r2 1 and no residual", () => {
    const fit = fitOf(exactRows);
    assert.equal(fit.model, FIT_MODEL);
    assert.deepEqual(fit.bootstrap, FIT_BOOTSTRAP);
    assert.equal(fit.n, 20);
    assert.equal(fit.k, 3);
    assert.ok(close(fit.coefficients.fixedMs.estimate, 0.4, 1e-9));
    assert.ok(close(fit.coefficients.msPerByteIn.estimate, 2e-5, 1e-12));
    assert.ok(close(fit.coefficients.msPerByteOut.estimate, 1e-5, 1e-12));
    assert.ok(close(fit.r2, 1, 1e-9));
    assert.ok(fit.residualSd < 1e-9);
    // Each draw of exact rows gives the same coefficients, thus each interval is one point
    assert.ok(close(fit.coefficients.fixedMs.low, 0.4, 1e-9) && close(fit.coefficients.fixedMs.high, 0.4, 1e-9));
    assert.ok(close(fit.coefficients.msPerByteIn.low, 2e-5, 1e-12) && close(fit.coefficients.msPerByteIn.high, 2e-5, 1e-12));
  });

  it("gives the bootstrap intervals of FIT_BOOTSTRAP: 10 000 runs, seed 1, level 0.95", () => {
    const fit = fitOf(exactRows);
    for (const c of Object.values(fit.coefficients)) {
      assert.equal(c.runs, 10_000);
      assert.equal(c.seed, 1);
      assert.equal(c.level, 0.95);
      // A draw from fewer than 3 cases has no full rank: it does not count
      assert.ok(c.finite > 9_900 && c.finite <= 10_000);
    }
  });

  it("gives intervals around the estimates for rows with noise, and the same intervals for the same rows", () => {
    // A noise of +-0.01 ms that alternates with the round
    const rows = exactRows.map((r) => ({ ...r, ms: r.ms + (r.round % 2 === 0 ? 0.01 : -0.01) * (1 + (r.round >> 1)) }));
    const fit = fitOf(rows);
    for (const c of Object.values(fit.coefficients)) {
      assert.ok(c.low <= c.estimate && c.estimate <= c.high);
      assert.ok(c.low < c.high);
    }
    assert.ok(close(fit.coefficients.fixedMs.estimate, 0.4, 0.01));
    assert.ok(fit.coefficients.fixedMs.low < 0.4 && 0.4 < fit.coefficients.fixedMs.high);
    assert.ok(fit.r2 > 0.9 && fit.r2 < 1);
    assert.ok(fit.residualSd > 0);
    assert.deepEqual(fitOf(rows).coefficients, fit.coefficients);
  });

  it("gives the median transport time and the fitted value of each case", () => {
    const rows = exactRows.map((r) => (r.id === "c0" ? { ...r, ms: r.ms + [0, 0.1, 0.2, 0.3][r.round]! } : r));
    const fit = fitOf(rows);
    assert.deepEqual(Object.keys(fit.cases), ["c0", "c1", "c2", "c3", "c4"]);
    const c0 = fit.cases.c0!;
    assert.equal(c0.bytesIn, 13);
    assert.equal(c0.bytesOut, 1);
    assert.equal(c0.rounds, 4);
    // The median of 4 rounds is the midpoint of the 2 middle values: 0.1 and 0.2 above the exact time
    assert.ok(close(c0.medianMs, transportOf(cases[0]!) + 0.15, 1e-12));
    const { fixedMs, msPerByteIn, msPerByteOut } = fit.coefficients;
    for (const [id, x] of Object.entries(fit.cases)) {
      assert.ok(close(x.fittedMs, fixedMs.estimate + msPerByteIn.estimate * x.bytesIn + msPerByteOut.estimate * x.bytesOut, 1e-12), id);
    }
    assert.deepEqual(fit.rows, rows);
  });

  it("gives NaN coefficients without rows, and for rows of one case", () => {
    const empty = fitOf([]);
    assert.equal(empty.n, 0);
    assert.deepEqual(empty.cases, {});
    for (const c of Object.values(empty.coefficients)) {
      assert.ok(Number.isNaN(c.estimate) && Number.isNaN(c.low) && Number.isNaN(c.high));
      assert.equal(c.finite, 0);
    }
    // One case: all the rows have the same bytes, thus the design has no full rank
    const one = fitOf(exactRows.filter((r) => r.id === "c0"));
    assert.ok(Number.isNaN(one.coefficients.fixedMs.estimate));
    assert.ok(Number.isNaN(one.cases.c0!.fittedMs));
  });
});

describe("server-request record", () => {
  it("gives the fields of the record, format server-request/3", () => {
    assert.equal(FORMAT, "server-request/3");
    assert.equal(record.format, "server-request/3");
    assert.deepEqual(record.refs, { head: "abc" });
    assert.equal(record.node, "v26.0.0");
    assert.deepEqual(record.run, { label: "local" });
    assert.equal(record.synthetic, true);
    assert.equal(record.rounds, 3);
    assert.equal(record.warmupPasses, 1);
    assert.equal(record.report, report);
    assert.deepEqual(Object.keys(record.cases), ["one-call", "chain-50", "range-1000"]);
  });

  it("gives the label, path, counts and bytes of each case, without its input", () => {
    assert.deepEqual(Object.keys(record.requests), Object.keys(REQUESTS));
    assert.deepEqual(record.requests["one-call"], { label: "`client.add` of 1 and 2", path: ["client", "add"], warmup: 2000, calls: 2000, bytesIn: 13, bytesOut: 1 });
    assert.deepEqual(record.requests["chain-50"], { label: "`client.chain` of 50 steps of `client.add`", path: ["client", "chain"], warmup: 200, calls: 500, bytesIn: 3196, bytesOut: 2 });
    for (const x of Object.values(record.requests)) assert.ok(!("input" in x));
    assert.throws(() => recordOf(report, { "one-call": { bytesIn: 13, bytesOut: 1 } }, CONTEXT), /has no bytes/);
  });

  it("gives the fit of the rows of the cases: the coefficients with their intervals, r2, residualSd, n and the rows", () => {
    const { fit } = record;
    assert.equal(fit.n, 9);
    assert.equal(fit.rows.length, 9);
    assert.ok(Math.abs(fit.coefficients.fixedMs.estimate - TRUE_FIT.fixedMs) < 1e-9);
    assert.ok(Math.abs(fit.coefficients.msPerByteIn.estimate - TRUE_FIT.msPerByteIn) < 1e-12);
    assert.ok(Math.abs(fit.coefficients.msPerByteOut.estimate - TRUE_FIT.msPerByteOut) < 1e-12);
    assert.ok(Math.abs(fit.r2 - 1) < 1e-9);
    assert.equal(fit.cases["chain-50"]!.bytesIn, 3196);
    // The fit is JSON: it parses back to the same value
    assert.deepEqual(JSON.parse(JSON.stringify(fit)), fit);
    assert.equal(fit.coefficients.fixedMs.runs, 10_000);
  });
});

// The profile mode (O94). Each synthetic profile has samples with known times, thus known self times.
type Frame = { functionName: string; url: string; lineNumber: number };

/** This function gives a CPU profile of samples with known times: each entry is a frame and the time of its sample, in µs. */
function profileOf(entries: readonly (readonly [Frame, number])[], startTime = 1000, firstDelta = 7): CpuProfile {
  const ids = new Map<string, number>();
  const nodes: { id: number; callFrame: Frame; hitCount: number }[] = [{ id: 1, callFrame: { functionName: "(root)", url: "", lineNumber: -1 }, hitCount: 0 }];
  const idOf = (frame: Frame) => {
    const key = JSON.stringify(frame);
    let id = ids.get(key);
    if (id === undefined) {
      id = nodes.length + 1;
      ids.set(key, id);
      nodes.push({ id, callFrame: frame, hitCount: 0 });
    }
    return id;
  };
  const samples = entries.map(([frame]) => idOf(frame));
  for (const id of samples) nodes[id - 1]!.hitCount += 1;
  // The delta before sample i + 1 is the time of sample i, and the last sample ends at endTime
  const timeDeltas = [firstDelta, ...entries.slice(0, -1).map(([, us]) => us)];
  const endTime = startTime + timeDeltas.reduce((s, d) => s + d, 0) + (entries.at(-1)?.[1] ?? 0);
  return { nodes, startTime, endTime, samples, timeDeltas };
}

/** This function gives `count` samples of a frame, each of `us` microseconds. */
const repeat = (frame: Frame, count: number, us = 100): [Frame, number][] => Array.from({ length: count }, () => [frame, us]);

const TREE = "/t";
const F = {
  host: { functionName: "dispatch", url: "file:///t/packages/server/dist/host.js", lineNumber: 41 },
  peer: { functionName: "handle", url: "file:///t/packages/client-server/dist/http.js", lineNumber: 9 },
  zod: { functionName: "_parse", url: "file:///t/node_modules/.pnpm/zod@3.25.0/node_modules/zod/lib/types.js", lineNumber: 100 },
  chain: { functionName: "chain", url: "file:///t/packages/client/dist/procedures/chain.js", lineNumber: 5 },
  gc: { functionName: "(garbage collector)", url: "", lineNumber: -1 },
  node: { functionName: "writeGeneric", url: "node:internal/stream_base_commons", lineNumber: 20 },
} satisfies Record<string, Frame>;

// The profile a: 10 calls. Per call: host 300 µs, zod 70, chain 50, GC 20, node 10
const PROFILE_A = profileOf([...repeat(F.host, 30), ...repeat(F.zod, 7), ...repeat(F.chain, 5), ...repeat(F.gc, 2), ...repeat(F.node, 1)]);
// The profile b: 20 calls. Per call: node 20 µs, host 20, zod 10, chain 10, GC 10, peer 5
const PROFILE_B = profileOf([...repeat(F.node, 2), ...repeat(F.host, 4), ...repeat(F.zod, 2), ...repeat(F.chain, 2), ...repeat(F.gc, 2), ...repeat(F.node, 2), ...repeat(F.peer, 1)]);
const ANALYSIS = profileAnalysisOf({ id: "chain-200", profile: PROFILE_A, calls: 10 }, { id: "chain-1", profile: PROFILE_B, calls: 20 }, TREE);

describe("server-request profile locations", () => {
  it("gives the path in the tree for a file of the tree", () => {
    assert.equal(locationOf(F.host, TREE), "packages/server/dist/host.js");
    assert.equal(locationOf(F.host, "/t/"), "packages/server/dist/host.js");
    assert.equal(locationOf({ functionName: "f", url: "file:///t/packages/a%20b/x.js" }, TREE), "packages/a b/x.js");
  });

  it("gives the path in the tree for a file URL of Windows and a tree with backslashes", () => {
    assert.equal(locationOf({ functionName: "f", url: "file:///C:/work/tree/packages/client/dist/server/index.js" }, "C:\\work\\tree"), "packages/client/dist/server/index.js");
  });

  it("gives node_modules/<package> from the last node_modules of the path, also for a scoped package", () => {
    assert.equal(locationOf(F.zod, TREE), "node_modules/zod");
    assert.equal(
      locationOf({ functionName: "f", url: "file:///t/node_modules/.pnpm/@mark1russell7+service@0.5.2/node_modules/@mark1russell7/service/dist/run.js" }, TREE),
      "node_modules/@mark1russell7/service",
    );
    // A package outside the tree is also a package of node_modules
    assert.equal(locationOf({ functionName: "f", url: "file:///elsewhere/node_modules/ws/lib/x.js" }, TREE), "node_modules/ws");
  });

  it("gives (node) for a module of Node.js and for a native frame without a URL", () => {
    assert.equal(locationOf(F.node, TREE), "(node)");
    assert.equal(locationOf({ functionName: "writeUtf8String", url: "" }, TREE), "(node)");
    assert.equal(locationOf({ functionName: "", url: "" }, TREE), "(node)");
  });

  it("gives the name of a V8 entry as is", () => {
    for (const name of ["(program)", "(garbage collector)", "(idle)", "(root)"]) assert.equal(locationOf({ functionName: name, url: "" }, TREE), name);
  });

  it("gives the URL for a file outside the tree and for a URL that is not a file", () => {
    assert.equal(locationOf({ functionName: "serve", url: "file:///checkout/scripts/server-request.ts" }, TREE), "file:///checkout/scripts/server-request.ts");
    assert.equal(locationOf({ functionName: "f", url: "wasm://wasm/abc" }, TREE), "wasm://wasm/abc");
    // A folder whose name starts with the name of the tree is not in the tree
    assert.equal(locationOf({ functionName: "f", url: "file:///tx/packages/a.js" }, TREE), "file:///tx/packages/a.js");
  });

  it("tells the host side: the server, the HTTP face of peer, and the server of the client in source and build", () => {
    assert.deepEqual(HOST_SIDE, ["packages/server/", "packages/client-server/", "packages/client/src/server/", "packages/client/dist/server/"]);
    for (const location of ["packages/server/dist/host.js", "packages/client-server/dist/http.js", "packages/client/src/server/index.ts", "packages/client/dist/server/index.js"]) {
      assert.ok(isHostSide(location), location);
      assert.equal(groupOf(location), HOST_GROUP);
    }
    for (const location of ["packages/client/dist/index.js", "packages/server-x/a.js", "packages/client-shell/a.js", "node_modules/zod", "(node)"]) assert.ok(!isHostSide(location), location);
  });

  it("gives the groups: the host side, each other package of the tree, each package of node_modules, (node), each V8 entry, and (other)", () => {
    assert.equal(groupOf("packages/client/dist/procedures/chain.js"), "packages/client");
    assert.equal(groupOf("packages/client-shell/dist/a.js"), "packages/client-shell");
    assert.equal(groupOf("node_modules/zod"), "node_modules/zod");
    assert.equal(groupOf("node_modules/@mark1russell7/service"), "node_modules/@mark1russell7/service");
    assert.equal(groupOf("(node)"), "(node)");
    assert.equal(groupOf("(garbage collector)"), "(garbage collector)");
    assert.equal(groupOf("(program)"), "(program)");
    assert.equal(groupOf("(idle)"), "(idle)");
    assert.equal(groupOf("file:///checkout/scripts/server-request.ts"), "(other)");
    assert.equal(groupOf("wasm://wasm/abc"), "(other)");
  });

  it("gives the key of a function from its name, location and line, with (anonymous) for a function without a name", () => {
    assert.equal(keyOf("dispatch", "packages/server/dist/host.js", 41), "dispatch packages/server/dist/host.js:41");
    assert.equal(keyOf("", "(node)", 3), "(anonymous) (node):3");
    assert.equal(keyOf("(program)", "(program)", -1), "(program) (program):-1");
  });
});

describe("server-request profile self times", () => {
  it("gives each sample the time to the next sample, and the last sample the time to endTime", () => {
    const p = profileOf([[F.host, 30], [F.zod, 50], [F.host, 20]]);
    assert.deepEqual(p.timeDeltas, [7, 30, 50]);
    assert.deepEqual(sampleTimesOf(p), [30, 50, 20]);
  });

  it("gives the last sample 0 without startTime or endTime, and counts a negative time as 0", () => {
    const { startTime: _s, endTime: _e, ...open } = profileOf([[F.host, 30], [F.zod, 50]]);
    assert.deepEqual(sampleTimesOf(open), [30, 0]);
    assert.deepEqual(sampleTimesOf({ ...open, timeDeltas: [7, -4] }), [0, 0]);
    assert.deepEqual(sampleTimesOf({ ...profileOf([[F.host, 30]]), endTime: 0 }), [0]);
    assert.deepEqual(sampleTimesOf(profileOf([])), []);
  });

  it("gives the self time of each function from the times of its samples, not from hitCount", () => {
    // One sample of each function: the same hitCount, and self times of 900 and 100 µs
    const self = selfTimesOf(profileOf([[F.host, 900], [F.zod, 100]]), TREE);
    assert.deepEqual(
      self.map((f) => [f.key, f.selfUs, f.samples, f.hits]),
      [
        ["dispatch packages/server/dist/host.js:41", 900, 1, 1],
        ["_parse node_modules/zod:100", 100, 1, 1],
      ],
    );
    assert.equal(self[0]!.location, "packages/server/dist/host.js");
    assert.equal(self[0]!.functionName, "dispatch");
    assert.equal(self[0]!.lineNumber, 41);
  });

  it("adds the nodes of one function: two call stacks of one function are one row", () => {
    const p = profileOf([[F.host, 10], [F.zod, 20]]);
    // A second node with the frame of F.host, as for a second caller: two more samples of 6 and 4 µs
    const twice: CpuProfile = { ...p, nodes: [...p.nodes, { id: 99, callFrame: F.host, hitCount: 2 }], samples: [...p.samples, 99, 99], timeDeltas: [...p.timeDeltas, 20, 6], endTime: p.endTime! + 6 + 4 };
    const self = selfTimesOf(twice, TREE);
    const host = self.find((f) => f.functionName === "dispatch")!;
    assert.equal(self.length, 2);
    assert.equal(host.samples, 3);
    assert.equal(host.hits, 3);
    assert.equal(host.selfUs, 10 + 6 + 4);
    assert.equal(self.find((f) => f.functionName === "_parse")!.selfUs, 20);
  });

  it("throws for a sample of a node that the profile does not have", () => {
    const p = profileOf([[F.host, 10]]);
    assert.throws(() => selfTimesOf({ ...p, samples: [42] }, TREE), /names the node 42/);
  });

  it("gives the functions in the order of their first sample", () => {
    const self = selfTimesOf(PROFILE_B, TREE);
    assert.deepEqual(
      self.map((f) => [f.location, f.selfUs]),
      [
        ["(node)", 400],
        ["packages/server/dist/host.js", 400],
        ["node_modules/zod", 200],
        ["packages/client/dist/procedures/chain.js", 200],
        ["(garbage collector)", 200],
        ["packages/client-server/dist/http.js", 100],
      ],
    );
  });
});

describe("server-request profile analysis", () => {
  const row = (key: string) => ANALYSIS.functions.find((r) => r.key === key)!;
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

  it("gives the totals of each profile: calls, samples, self time per call and the median interval", () => {
    assert.deepEqual(ANALYSIS.a, { id: "chain-200", calls: 10, samples: 45, totalUs: 4500, perCallUs: 450, medianDeltaUs: 100 });
    assert.deepEqual(ANALYSIS.b, { id: "chain-1", calls: 20, samples: 15, totalUs: 1500, perCallUs: 75, medianDeltaUs: 100 });
  });

  it("gives the excess per call of each function for unequal counts of calls: a / 10 calls minus b / 20 calls", () => {
    const host = row("dispatch packages/server/dist/host.js:41");
    assert.deepEqual(host.a, { selfUs: 3000, perCallUs: 300, samples: 30 });
    assert.deepEqual(host.b, { selfUs: 400, perCallUs: 20, samples: 4 });
    assert.equal(host.excessUs, 280);
    assert.equal(host.group, HOST_GROUP);
    assert.equal(host.hostSide, true);
    assert.equal(row("_parse node_modules/zod:100").excessUs, 60);
    assert.equal(row("chain packages/client/dist/procedures/chain.js:5").excessUs, 40);
    assert.equal(row("(garbage collector) (garbage collector):-1").excessUs, 10);
    assert.equal(row("writeGeneric (node):20").excessUs, -10);
  });

  it("gives a function of only one profile 0 in the other profile", () => {
    const peer = row("handle packages/client-server/dist/http.js:9");
    assert.deepEqual(peer.a, { selfUs: 0, perCallUs: 0, samples: 0 });
    assert.equal(peer.b.perCallUs, 5);
    assert.equal(peer.excessUs, -5);
  });

  it("gives the total excess as the per-call time of a minus that of b, and the share of each function in it", () => {
    assert.equal(ANALYSIS.totalExcessUs, 375);
    assert.equal(ANALYSIS.totalExcessUs, ANALYSIS.a.perCallUs - ANALYSIS.b.perCallUs);
    assert.ok(close(row("dispatch packages/server/dist/host.js:41").share, 280 / 375));
    assert.ok(close(row("writeGeneric (node):20").share, -10 / 375));
    assert.ok(close(ANALYSIS.functions.reduce((s, r) => s + r.share, 0), 1));
  });

  it("sorts the functions from the largest excess", () => {
    assert.deepEqual(
      ANALYSIS.functions.map((r) => r.excessUs),
      [280, 60, 40, 10, -5, -10],
    );
  });

  it("sorts rows with the same excess by key", () => {
    const p = profileOf([[F.zod, 10], [F.host, 10]]);
    const empty = profileOf([[F.gc, 0]]);
    const keys = profileAnalysisOf({ id: "a", profile: p, calls: 1 }, { id: "b", profile: empty, calls: 1 }, TREE).functions.map((r) => r.key);
    assert.deepEqual(keys, ["_parse node_modules/zod:100", "dispatch packages/server/dist/host.js:41", "(garbage collector) (garbage collector):-1"]);
  });

  it("gives the groups: the sums of their functions, from the largest excess", () => {
    assert.deepEqual(
      ANALYSIS.groups.map((g) => [g.group, g.functions, g.aPerCallUs, g.bPerCallUs, g.excessUs]),
      [
        [HOST_GROUP, 2, 300, 25, 275],
        ["node_modules/zod", 1, 70, 10, 60],
        ["packages/client", 1, 50, 10, 40],
        ["(garbage collector)", 1, 20, 10, 10],
        ["(node)", 1, 10, 20, -10],
      ],
    );
    assert.ok(close(ANALYSIS.groups[0]!.share, 275 / 375));
  });

  it("gives the outcomes: the top function is on the host side, has 25 % or more, and zod has less than 20 %", () => {
    assert.deepEqual(ANALYSIS.outcomes, {
      top: "dispatch packages/server/dist/host.js:41",
      topLocation: "packages/server/dist/host.js",
      topShare: 280 / 375,
      topOnHostSide: true,
      topShareAtLeast25: true,
      zodShare: 60 / 375,
      zodUnder20: true,
    });
  });

  it("throws for a count of calls that is not a whole number above 0", () => {
    for (const calls of [0, -1, 1.5, Number.NaN]) {
      assert.throws(() => profileAnalysisOf({ id: "a", profile: PROFILE_A, calls }, { id: "b", profile: PROFILE_B, calls: 1 }, TREE), /The profile a has/);
      assert.throws(() => profileAnalysisOf({ id: "a", profile: PROFILE_A, calls: 1 }, { id: "b", profile: PROFILE_B, calls }, TREE), /The profile b has/);
    }
  });

  it("gives NaN shares and no outcomes when the total excess is not above 0", () => {
    const flat = profileAnalysisOf({ id: "a", profile: PROFILE_B, calls: 20 }, { id: "b", profile: PROFILE_B, calls: 20 }, TREE);
    assert.equal(flat.totalExcessUs, 0);
    assert.ok(flat.functions.every((r) => Number.isNaN(r.share)));
    assert.equal(flat.outcomes.topOnHostSide, null);
    assert.equal(flat.outcomes.topShareAtLeast25, null);
    assert.equal(flat.outcomes.zodUnder20, null);
    assert.ok(Number.isNaN(flat.outcomes.zodShare));
  });

  it("gives JSON that parses back to the same analysis", () => {
    assert.deepEqual(JSON.parse(JSON.stringify(ANALYSIS)), ANALYSIS);
  });
});

describe("server-request profile outcomes", () => {
  /** This function gives an excess row of a location, for the outcomes. */
  const rowOf = (location: string, excessUs: number, n = 0): ExcessRow => ({
    key: keyOf(`f${n}`, location, n),
    functionName: `f${n}`,
    location,
    lineNumber: n,
    group: groupOf(location),
    hostSide: isHostSide(location),
    a: { selfUs: excessUs, perCallUs: excessUs, samples: 1 },
    b: { selfUs: 0, perCallUs: 0, samples: 0 },
    excessUs,
    share: Number.NaN,
  });

  it("gives (a) no when the top function is not on the host side", () => {
    const o = outcomesOf([rowOf("packages/client/dist/procedures/chain.js", 60), rowOf("packages/server/dist/host.js", 40, 1)], 100);
    assert.equal(o.top, "f0 packages/client/dist/procedures/chain.js:0");
    assert.equal(o.topLocation, "packages/client/dist/procedures/chain.js");
    assert.equal(o.topOnHostSide, false);
    assert.equal(o.topShareAtLeast25, true);
  });

  it("gives (b) yes at exactly 25 %, and no under it", () => {
    assert.equal(OUTCOME_LIMITS.topShare, 0.25);
    assert.equal(outcomesOf([rowOf("packages/server/a.js", 25), rowOf("(node)", 75)], 100).topShareAtLeast25, true);
    assert.equal(outcomesOf([rowOf("packages/server/a.js", 24.9), rowOf("(node)", 75.1)], 100).topShareAtLeast25, false);
  });

  it("gives (c) from the sum of all zod frames: no at exactly 20 %, and yes under it", () => {
    assert.equal(OUTCOME_LIMITS.zodShare, 0.2);
    const zod = (x: number, y: number) => [rowOf("packages/server/a.js", 100 - x - y), rowOf("node_modules/zod", x, 1), rowOf("node_modules/zod", y, 2)];
    const at = outcomesOf(zod(12, 8), 100);
    assert.equal(at.zodShare, 0.2);
    assert.equal(at.zodUnder20, false);
    assert.equal(outcomesOf(zod(12, 7.9), 100).zodUnder20, true);
    // A package with zod in its name is not zod
    assert.equal(outcomesOf([rowOf("packages/server/a.js", 50), rowOf("node_modules/zod-to-json-schema", 50, 1)], 100).zodShare, 0);
  });

  it("gives no top without functions, and no outcomes for a total excess that is not above 0", () => {
    const none = outcomesOf([], 0);
    assert.equal(none.top, null);
    assert.equal(none.topLocation, null);
    assert.equal(none.topOnHostSide, null);
    assert.ok(Number.isNaN(none.topShare));
    const negative = outcomesOf([rowOf("packages/server/a.js", -5)], -5);
    assert.equal(negative.top, "f0 packages/server/a.js:0");
    assert.equal(negative.topShareAtLeast25, null);
  });
});

describe("server-request profile record", () => {
  const RECORD: ProfileRecord = {
    format: PROFILE_FORMAT,
    refs: { head: "abc" },
    node: "v26.0.0",
    run: { label: "local" },
    intervalUs: PROFILE_INTERVAL_US,
    warmup: 1000,
    calls: 10,
    files: { "chain-200": "chain-200/host.cpuprofile", "chain-1": "chain-1/host.cpuprofile" },
    analysis: ANALYSIS,
  };

  it("has the format server-request-profile/1 and the interval of --cpu-prof-interval 100", () => {
    assert.equal(PROFILE_FORMAT, "server-request-profile/1");
    assert.equal(PROFILE_INTERVAL_US, 100);
  });

  it("gives the Markdown: the counts, the totals, the outcomes, the functions and the groups", () => {
    const md = profileMarkdownOf(RECORD);
    assert.ok(md.startsWith("# Server request profile (O94): `chain-200` against `chain-1`\n"));
    assert.ok(md.includes("Head `abc`, Node.js v26.0.0. The host child of each case did 1000 untimed calls, then the profiler ran for 10 calls, with a sampling interval of 100 µs."));
    assert.ok(md.includes("| `chain-200` | 10 | 45 | 100.0 | 450.0 |"));
    assert.ok(md.includes("| `chain-1` | 20 | 15 | 100.0 | 75.0 |"));
    assert.ok(md.includes("The total excess is 375.0 µs per call."));
    assert.ok(md.includes("- The function with the largest excess: `dispatch packages/server/dist/host.js:41`, 74.7 % of the total excess."));
    assert.ok(md.includes("- (a) It is on the host side (`packages/server/`, `packages/client-server/`, `packages/client/src/server/`, `packages/client/dist/server/`): yes."));
    assert.ok(md.includes("- (b) It has 25 % or more of the total excess: yes."));
    assert.ok(md.includes("- (c) The frames of `node_modules/zod` have less than 20 % of the total excess: yes (16.0 %)."));
    assert.ok(md.includes("| # | Function | Location | `chain-200` µs per call | `chain-1` µs per call | Excess µs | Share |"));
    // The line of V8 is from 0, and the Markdown gives it from 1
    assert.ok(md.includes("| 1 | `dispatch` | `packages/server/dist/host.js:42` | 300.0 | 20.0 | 280.0 | 74.7 % |"));
    assert.ok(md.includes("| 4 | `(garbage collector)` | `(garbage collector)` | 20.0 | 10.0 | 10.0 | 2.7 % |"));
    assert.ok(md.includes("| `host side` | 2 | 300.0 | 25.0 | 275.0 | 73.3 % |"));
    assert.ok(md.includes("| `(node)` | 1 | 10.0 | 20.0 | -10.0 | -2.7 % |"));
    assert.ok(md.indexOf("## The outcomes") < md.indexOf("## The top 25 functions"));
    assert.ok(md.indexOf("## The top 25 functions") < md.indexOf("## The groups"));
  });

  it("gives only the top 25 functions, and escapes a | in a name", () => {
    const frames = Array.from({ length: 30 }, (_, i) => ({ functionName: i === 0 ? "a|b" : `f${i}`, url: "file:///t/packages/server/dist/x.js", lineNumber: i }));
    const a = profileOf(frames.map((f, i) => [f, 100 * (30 - i)] as const));
    const analysis = profileAnalysisOf({ id: "x", profile: a, calls: 1 }, { id: "y", profile: profileOf([[F.gc, 0]]), calls: 1 }, TREE);
    const md = profileMarkdownOf({ ...RECORD, analysis });
    assert.ok(md.includes("| 1 | `a\\|b` | `packages/server/dist/x.js:1` |"));
    assert.ok(md.includes("| 25 | `f24` |"));
    assert.ok(!md.includes("| 26 |"));
    assert.ok(profileMarkdownOf({ ...RECORD, analysis }, 3).includes("## The top 3 functions"));
  });

  it("writes none for the outcomes of a total excess that is not above 0, and no line for a frame without a line", () => {
    const flat = profileAnalysisOf({ id: "a", profile: PROFILE_B, calls: 20 }, { id: "b", profile: PROFILE_B, calls: 20 }, TREE);
    const md = profileMarkdownOf({ ...RECORD, analysis: flat });
    assert.ok(md.includes("`packages/client/dist/server/`): none."));
    assert.ok(md.includes("- (b) It has 25 % or more of the total excess: none."));
    assert.ok(md.includes("- (c) The frames of `node_modules/zod` have less than 20 % of the total excess: none (none)."));
    assert.ok(md.includes("| `(garbage collector)` | `(garbage collector)` |"));
  });
});

describe("server-request profile options", () => {
  it("gives the two cases and the counts, with the defaults", () => {
    assert.deepEqual(profileOptionsOf("chain-200,chain-1", "500", "800"), { cases: ["chain-200", "chain-1"], warmup: 500, calls: 800 });
    assert.deepEqual(profileOptionsOf(" chain-200 , chain-1 ", undefined, undefined), { cases: ["chain-200", "chain-1"], ...PROFILE_DEFAULTS });
    assert.deepEqual(PROFILE_DEFAULTS, { warmup: 1000, calls: 1000 });
    assert.equal(profileOptionsOf("one-call,chain-1", "0", "1").warmup, 0);
  });

  it("throws unless --profile names two different cases of REQUESTS", () => {
    for (const value of ["chain-200", "chain-200,chain-200", "chain-200,chain-1,chain-10", "chain-200,nope", ""]) {
      assert.throws(() => profileOptionsOf(value, undefined, undefined), /names two different cases/, value);
    }
  });

  it("throws for a warm-up that is not a whole number of 0 or more, and for calls that are not a whole number above 0", () => {
    for (const value of ["-1", "1.5", "x"]) assert.throws(() => profileOptionsOf("chain-200,chain-1", value, undefined), /--profile-warmup/, value);
    for (const value of ["0", "-1", "2.5", "x"]) assert.throws(() => profileOptionsOf("chain-200,chain-1", undefined, value), /--profile-calls/, value);
  });
});
