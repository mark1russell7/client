/**
 * The analysis of the CPU profiles of the server request bench (O94). It has no I/O: the script
 * `server-request.ts` takes the profiles of the host child, and this file compares them.
 *
 * The question: which functions of the host spend the transport time of each step of `client.chain`?
 * The profile `a` is of a case with many steps (`chain-200`), and the profile `b` is of a case with
 * few steps (`chain-1`). Each profile has a known count of calls.
 *
 * - The self time of a sample is the time to the next sample, from `timeDeltas`. The last sample
 *   goes to `endTime`. A negative delta counts as 0.
 * - A function is its `functionName`, its location and its `lineNumber` (`keyOf()`). The location
 *   is a path in the tree, `node_modules/<package>`, `(node)`, or the name of a V8 entry, for
 *   example `(garbage collector)` (`locationOf()`).
 * - The excess self time of a function is its self time per call in `a` minus its self time per
 *   call in `b`. The share of a function is its excess over the total excess of all functions.
 * - The outcomes of the prediction are in `outcomesOf()`. (a) The function with the largest excess is
 *   on the host side. (b) It has 25 % or more of the total excess. (c) The frames of
 *   `node_modules/zod` have less than 20 % of the total excess.
 */

import { median } from "@mark1russell7/rigor-statistics";

/** The format of the record of the profile mode. */
export const PROFILE_FORMAT = "server-request-profile/1";

/** A CPU profile of V8, as `Profiler.stop` gives it and as `--cpu-prof` writes it: only the fields that the analysis reads. */
export interface CpuProfile {
  readonly nodes: readonly {
    readonly id: number;
    readonly callFrame: { readonly functionName: string; readonly url: string; readonly lineNumber: number };
    readonly hitCount?: number;
  }[];
  readonly startTime?: number;
  readonly endTime?: number;
  readonly samples: readonly number[];
  /** The time from the sample before, in microseconds. The first delta is from `startTime`. */
  readonly timeDeltas: readonly number[];
}

/** The path prefixes of the host side: the server, the HTTP face of `@procedures/peer` and the server of the client, in source and in build. */
export const HOST_SIDE = ["packages/server/", "packages/client-server/", "packages/client/src/server/", "packages/client/dist/server/"] as const;

/** The name of the group of the host side. */
export const HOST_GROUP = "host side";

/** The names of the V8 entries without a script. The location of each is its name. */
export const V8_ENTRIES = ["(program)", "(garbage collector)", "(idle)", "(root)"] as const;

/** The limits of the outcomes (b) and (c), as shares of the total excess. */
export const OUTCOME_LIMITS = { topShare: 0.25, zodShare: 0.2 } as const;

/** The location of `node_modules/zod`, for the outcome (c). */
export const ZOD = "node_modules/zod";

/** This function gives the path of a URL with `/`, or `undefined` for a URL that is not a file. */
function filePathOf(url: string): string | undefined {
  if (!url.startsWith("file:")) return undefined;
  // The path of the URL, and not fileURLToPath: a test on Windows reads the profiles of Linux
  const path = decodeURIComponent(new URL(url).pathname);
  // A path of Windows has the form /C:/...
  return /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path;
}

/** This function gives a path with `/` and without a `/` at the end. */
const normal = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * This function gives the location of a call frame:
 * - the name for a V8 entry of `V8_ENTRIES`,
 * - `(node)` for a module of Node.js (`node:`) and for a frame without a URL (a native function),
 * - `node_modules/<package>` for a file of a package of `node_modules`, from the last `node_modules` of the path,
 * - the path in the tree for a file of the tree (`packages/...`),
 * - the URL for each other frame.
 */
export function locationOf(frame: { readonly functionName: string; readonly url: string }, tree: string): string {
  if (frame.url === "") return (V8_ENTRIES as readonly string[]).includes(frame.functionName) ? frame.functionName : "(node)";
  if (frame.url.startsWith("node:")) return "(node)";
  const path = filePathOf(frame.url);
  if (path === undefined) return frame.url;
  const at = path.lastIndexOf("/node_modules/");
  if (at !== -1) {
    const parts = path.slice(at + "/node_modules/".length).split("/");
    return `node_modules/${parts[0]!.startsWith("@") ? `${parts[0]}/${parts[1]}` : parts[0]}`;
  }
  const root = `${normal(tree)}/`;
  return path.startsWith(root) ? path.slice(root.length) : frame.url;
}

/** This function tells if a location is on the host side (`HOST_SIDE`). */
export function isHostSide(location: string): boolean {
  return HOST_SIDE.some((prefix) => location.startsWith(prefix));
}

/**
 * This function gives the group of a location. The group of the host side is `HOST_GROUP`, and the
 * group of each other package of the tree is `packages/<folder>`. A package of `node_modules`,
 * `(node)` and a V8 entry are each a group. Each other location goes to `(other)`.
 */
export function groupOf(location: string): string {
  if (isHostSide(location)) return HOST_GROUP;
  const pkg = /^packages\/[^/]+/.exec(location);
  if (pkg !== null) return pkg[0];
  if (location.startsWith("node_modules/") || location === "(node)" || (V8_ENTRIES as readonly string[]).includes(location)) return location;
  return "(other)";
}

/** This function gives the key of a function: its name, its location and its line, as `name location:line`. */
export function keyOf(functionName: string, location: string, lineNumber: number): string {
  return `${functionName || "(anonymous)"} ${location}:${lineNumber}`;
}

/** The self time of one function in one profile. */
export interface FunctionSelf {
  readonly key: string;
  readonly functionName: string;
  readonly location: string;
  /** The line of V8, from 0 */
  readonly lineNumber: number;
  /** The self time, in microseconds */
  readonly selfUs: number;
  /** The samples of the function */
  readonly samples: number;
  /** The sum of `hitCount` of the nodes of the function */
  readonly hits: number;
}

/** This function gives the time of each sample in microseconds: the time to the next sample, and for the last sample the time to `endTime`. */
export function sampleTimesOf(profile: CpuProfile): number[] {
  const n = profile.samples.length;
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const next = i + 1 < n ? profile.timeDeltas[i + 1] : lastTimeOf(profile);
    times.push(Math.max(0, next ?? 0));
  }
  return times;
}

/** This function gives the time from the last sample to `endTime`, or 0 without `startTime` and `endTime`. */
function lastTimeOf(profile: CpuProfile): number {
  if (profile.startTime === undefined || profile.endTime === undefined) return 0;
  const last = profile.timeDeltas.slice(0, profile.samples.length).reduce((s, d) => s + d, profile.startTime);
  return profile.endTime - last;
}

/** This function gives the self time of each function of a profile, from its samples and time deltas. The order is the order of the first sample. */
export function selfTimesOf(profile: CpuProfile, tree: string): FunctionSelf[] {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
  const functions = new Map<string, { key: string; functionName: string; location: string; lineNumber: number; selfUs: number; samples: number; hits: number }>();
  const entryOf = (node: CpuProfile["nodes"][number]) => {
    const location = locationOf(node.callFrame, tree);
    const key = keyOf(node.callFrame.functionName, location, node.callFrame.lineNumber);
    let entry = functions.get(key);
    if (entry === undefined) {
      entry = { key, functionName: node.callFrame.functionName, location, lineNumber: node.callFrame.lineNumber, selfUs: 0, samples: 0, hits: 0 };
      functions.set(key, entry);
    }
    return entry;
  };
  const times = sampleTimesOf(profile);
  profile.samples.forEach((id, i) => {
    const node = nodes.get(id);
    if (node === undefined) throw new Error(`The sample ${i} names the node ${id}, and the profile has no such node.`);
    const entry = entryOf(node);
    entry.selfUs += times[i]!;
    entry.samples += 1;
  });
  for (const node of profile.nodes) if ((node.hitCount ?? 0) > 0) entryOf(node).hits += node.hitCount!;
  return [...functions.values()];
}

/** One profile of the analysis: the case, the profile and the count of calls in it. */
export interface ProfileSide {
  readonly id: string;
  readonly profile: CpuProfile;
  readonly calls: number;
}

/** The totals of one profile. */
export interface ProfileTotals {
  readonly id: string;
  readonly calls: number;
  readonly samples: number;
  /** The self time of all the samples, in microseconds */
  readonly totalUs: number;
  readonly perCallUs: number;
  /** The median time delta, in microseconds: the sampling interval that the profiler gave */
  readonly medianDeltaUs: number;
}

/** The self time of a function or a group in one profile. */
export interface SideTime {
  readonly selfUs: number;
  readonly perCallUs: number;
  readonly samples: number;
}

/** One row of the excess table: one function. */
export interface ExcessRow {
  readonly key: string;
  readonly functionName: string;
  readonly location: string;
  readonly lineNumber: number;
  readonly group: string;
  readonly hostSide: boolean;
  readonly a: SideTime;
  readonly b: SideTime;
  /** The self time per call in `a` minus the self time per call in `b`, in microseconds */
  readonly excessUs: number;
  /** The excess over the total excess. NaN when the total excess is not above 0. */
  readonly share: number;
}

/** One row of the groups: the sums of the rows of one group. */
export interface GroupRow {
  readonly group: string;
  readonly functions: number;
  readonly aPerCallUs: number;
  readonly bPerCallUs: number;
  readonly excessUs: number;
  readonly share: number;
}

/** The three outcomes of the prediction. An outcome is `null` when the total excess is not above 0. */
export interface ProfileOutcomes {
  /** The key of the function with the largest excess, or `null` without functions */
  readonly top: string | null;
  readonly topLocation: string | null;
  readonly topShare: number;
  /** (a) The function with the largest excess is on the host side (`HOST_SIDE`) */
  readonly topOnHostSide: boolean | null;
  /** (b) That function has 25 % or more of the total excess */
  readonly topShareAtLeast25: boolean | null;
  /** The share of all the frames of `node_modules/zod` */
  readonly zodShare: number;
  /** (c) The frames of `node_modules/zod` have less than 20 % of the total excess */
  readonly zodUnder20: boolean | null;
}

/** The analysis of two profiles. */
export interface ProfileAnalysis {
  readonly a: ProfileTotals;
  readonly b: ProfileTotals;
  /** The sum of the excess of all functions, in microseconds per call: the per-call time of `a` minus that of `b` */
  readonly totalExcessUs: number;
  /** The functions, from the largest excess */
  readonly functions: readonly ExcessRow[];
  /** The groups, from the largest excess */
  readonly groups: readonly GroupRow[];
  readonly outcomes: ProfileOutcomes;
}

/** This function gives the totals of one profile from the self times of its functions. A profile with fewer than 2 samples has no median interval (NaN). */
function totalsOf(side: ProfileSide, selves: readonly FunctionSelf[]): ProfileTotals {
  const totalUs = selves.reduce((s, f) => s + f.selfUs, 0);
  // The first delta is from startTime, not from a sample
  const deltas = side.profile.timeDeltas.slice(1);
  return {
    id: side.id,
    calls: side.calls,
    samples: side.profile.samples.length,
    totalUs,
    perCallUs: totalUs / side.calls,
    medianDeltaUs: deltas.length === 0 ? Number.NaN : median(deltas),
  };
}

/** This function sorts rows from the largest excess, and then by key. */
const byExcess = <T extends { excessUs: number }>(key: (row: T) => string) => (x: T, y: T) => y.excessUs - x.excessUs || (key(x) < key(y) ? -1 : key(x) > key(y) ? 1 : 0);

/**
 * This function gives the analysis of the profile `a` (many steps) against the profile `b` (few
 * steps). The analysis has the self time per call of each function, the excess table, the groups and
 * the outcomes.
 * It throws for a count of calls that is not a whole number above 0.
 */
export function profileAnalysisOf(a: ProfileSide, b: ProfileSide, tree: string): ProfileAnalysis {
  for (const side of [a, b]) if (!Number.isInteger(side.calls) || side.calls <= 0) throw new Error(`The profile ${side.id} has ${side.calls} calls: give a whole number above 0.`);
  const selfA = selfTimesOf(a.profile, tree);
  const selfB = selfTimesOf(b.profile, tree);
  const none: SideTime = { selfUs: 0, perCallUs: 0, samples: 0 };
  const timeOf = (f: FunctionSelf | undefined, calls: number): SideTime => (f === undefined ? none : { selfUs: f.selfUs, perCallUs: f.selfUs / calls, samples: f.samples });
  const inA = new Map(selfA.map((f) => [f.key, f]));
  const inB = new Map(selfB.map((f) => [f.key, f]));
  const keys = [...new Set([...inA.keys(), ...inB.keys()])];
  const rows = keys.map((key) => {
    const f = (inA.get(key) ?? inB.get(key))!;
    const ta = timeOf(inA.get(key), a.calls);
    const tb = timeOf(inB.get(key), b.calls);
    return { key, functionName: f.functionName, location: f.location, lineNumber: f.lineNumber, group: groupOf(f.location), hostSide: isHostSide(f.location), a: ta, b: tb, excessUs: ta.perCallUs - tb.perCallUs };
  });
  const totalExcessUs = rows.reduce((s, r) => s + r.excessUs, 0);
  const shareOf = (excess: number) => (totalExcessUs > 0 ? excess / totalExcessUs : Number.NaN);
  const functions: ExcessRow[] = rows.map((r) => ({ ...r, share: shareOf(r.excessUs) })).sort(byExcess((r) => r.key));
  const groupMap = new Map<string, { group: string; functions: number; aPerCallUs: number; bPerCallUs: number; excessUs: number }>();
  for (const r of functions) {
    const g = groupMap.get(r.group) ?? { group: r.group, functions: 0, aPerCallUs: 0, bPerCallUs: 0, excessUs: 0 };
    g.functions += 1;
    g.aPerCallUs += r.a.perCallUs;
    g.bPerCallUs += r.b.perCallUs;
    g.excessUs += r.excessUs;
    groupMap.set(r.group, g);
  }
  const groups: GroupRow[] = [...groupMap.values()].map((g) => ({ ...g, share: shareOf(g.excessUs) })).sort(byExcess((g) => g.group));
  return { a: totalsOf(a, selfA), b: totalsOf(b, selfB), totalExcessUs, functions, groups, outcomes: outcomesOf(functions, totalExcessUs) };
}

/** This function gives the outcomes of the prediction from the excess table, sorted from the largest excess. */
export function outcomesOf(functions: readonly ExcessRow[], totalExcessUs: number): ProfileOutcomes {
  const valid = totalExcessUs > 0;
  const top = functions[0];
  const zodShare = valid ? functions.filter((r) => r.location === ZOD).reduce((s, r) => s + r.excessUs, 0) / totalExcessUs : Number.NaN;
  const topShare = valid && top !== undefined ? top.excessUs / totalExcessUs : Number.NaN;
  return {
    top: top?.key ?? null,
    topLocation: top?.location ?? null,
    topShare,
    topOnHostSide: valid && top !== undefined ? top.hostSide : null,
    topShareAtLeast25: valid && top !== undefined ? topShare >= OUTCOME_LIMITS.topShare : null,
    zodShare,
    zodUnder20: valid ? zodShare < OUTCOME_LIMITS.zodShare : null,
  };
}

/** The record of the profile mode. */
export interface ProfileRecord {
  readonly format: typeof PROFILE_FORMAT;
  readonly refs: { readonly head: string };
  readonly node: string;
  readonly run: { readonly label: string; readonly id?: string; readonly url?: string };
  /** The sampling interval that the host child asked for, in microseconds */
  readonly intervalUs: number;
  /** The untimed calls before the profiler starts, the same for each case */
  readonly warmup: number;
  /** The calls in each profile, the same for each case */
  readonly calls: number;
  /** The profile file of each case, relative to the folder of the record */
  readonly files: Readonly<Record<string, string>>;
  readonly analysis: ProfileAnalysis;
}

/** This function gives the Markdown of a record of the profile mode: the top functions, the groups and the outcomes. */
export function profileMarkdownOf(record: ProfileRecord, top = 25): string {
  const { analysis } = record;
  const { a, b, outcomes } = analysis;
  const us = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "none");
  const pc = (x: number) => (Number.isFinite(x) ? `${(x * 100).toFixed(1)} %` : "none");
  const yes = (x: boolean | null) => (x === null ? "none" : x ? "yes" : "no");
  // The lines of V8 start from 0, and the Markdown gives them from 1
  const where = (r: ExcessRow) => `${r.location}${r.lineNumber >= 0 ? `:${r.lineNumber + 1}` : ""}`;
  // A backslash and a | of a name get a backslash: the | does not end the cell of the table
  const cell = (s: string) => s.replace(/[\\|]/g, (c) => `\\${c}`);
  const lines = [
    `# Server request profile (O94): \`${a.id}\` against \`${b.id}\``,
    "",
    `Head \`${record.refs.head}\`, Node.js ${record.node}. The host child of each case did ${record.warmup} untimed calls, then the profiler ran for ${record.calls} calls, with a sampling interval of ${record.intervalUs} µs.`,
    "",
    "- The self time of a sample is the time to the next sample.",
    `- The excess of a function is its self time per call in \`${a.id}\` minus its self time per call in \`${b.id}\`.`,
    "- The share of a function is its excess over the total excess of all functions.",
    "- A line is from 1.",
    "",
    "| Profile | Calls | Samples | Median interval µs | Self time per call µs |",
    "|---|---|---|---|---|",
    ...[a, b].map((t) => `| \`${t.id}\` | ${t.calls} | ${t.samples} | ${us(t.medianDeltaUs)} | ${us(t.perCallUs)} |`),
    "",
    `The total excess is ${us(analysis.totalExcessUs)} µs per call.`,
    "",
    "## The outcomes",
    "",
    `- The function with the largest excess: ${outcomes.top === null ? "none" : `\`${cell(outcomes.top)}\``}, ${pc(outcomes.topShare)} of the total excess.`,
    `- (a) It is on the host side (${HOST_SIDE.map((p) => `\`${p}\``).join(", ")}): ${yes(outcomes.topOnHostSide)}.`,
    `- (b) It has ${OUTCOME_LIMITS.topShare * 100} % or more of the total excess: ${yes(outcomes.topShareAtLeast25)}.`,
    `- (c) The frames of \`${ZOD}\` have less than ${OUTCOME_LIMITS.zodShare * 100} % of the total excess: ${yes(outcomes.zodUnder20)} (${pc(outcomes.zodShare)}).`,
    "",
    `## The top ${top} functions`,
    "",
    `| # | Function | Location | \`${a.id}\` µs per call | \`${b.id}\` µs per call | Excess µs | Share |`,
    "|---|---|---|---|---|---|---|",
    ...analysis.functions
      .slice(0, top)
      .map((r, i) => `| ${i + 1} | \`${cell(r.functionName || "(anonymous)")}\` | \`${cell(where(r))}\` | ${us(r.a.perCallUs)} | ${us(r.b.perCallUs)} | ${us(r.excessUs)} | ${pc(r.share)} |`),
    "",
    "## The groups",
    "",
    `| Group | Functions | \`${a.id}\` µs per call | \`${b.id}\` µs per call | Excess µs | Share |`,
    "|---|---|---|---|---|---|",
    ...analysis.groups.map((g) => `| \`${cell(g.group)}\` | ${g.functions} | ${us(g.aPerCallUs)} | ${us(g.bPerCallUs)} | ${us(g.excessUs)} | ${pc(g.share)} |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}
