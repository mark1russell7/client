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
  recordOf,
  REQUESTS,
  SHARE_BOOTSTRAP,
  shareOf,
  type CaseBytes,
  type FitRow,
} from "./server-request.ts";

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
