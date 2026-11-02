/** The types of the part of `paired-time.mjs` that the TypeScript scripts import. The JSDoc typedefs of the module are the source. */

/** The mode of a paired time run. */
export type Mode = "process" | "fresh";

/** One arm. Mode `process` uses `run`, and mode `fresh` starts `command` with the child protocol. */
export interface Arm {
  readonly id: string;
  readonly run?: (input: unknown) => unknown;
  readonly command?: readonly string[];
}

/** One input. The `group` is a fold of the inputs, for example a seed. */
export interface Input {
  readonly id: string;
  readonly group?: string;
  readonly value?: unknown;
}

/** The result of one child: its time in milliseconds and its peak resident memory in bytes. */
export interface ChildResult {
  readonly ms: number;
  readonly peakRss?: number;
}

/** The computer of a paired time run. */
export interface PairedEnv {
  readonly cpu: string;
  readonly cores: number;
  readonly os: string;
  readonly arch: string;
  readonly node: string;
  readonly runner?: string;
}

/** The options of `measureIsolated`. The arm 0 is the base: the denominator of each ratio. */
export interface PairedOptions {
  readonly arms: readonly Arm[];
  readonly inputs: readonly Input[];
  readonly repeats: number;
  readonly warmup?: number;
  readonly mode: Mode;
  readonly aa?: boolean;
  readonly clock?: () => number;
  /** The start of a child for mode `fresh`. The default starts a process with the child protocol. */
  readonly startChild?: (command: readonly string[], input: string, warmup: number) => Promise<ChildResult>;
  readonly env?: PairedEnv;
  readonly context?: string;
}

/** The ratios of one arm over the base. */
export interface PairedRatio {
  readonly inputs: number;
  readonly median: number;
  readonly p10: number;
  readonly p90: number;
  readonly moved: number | null;
  readonly groups: Readonly<Record<string, number>>;
  readonly groupMean: number;
  readonly groupSD: number;
}

/** One input of a report: the raw times of each arm, one value for each round, in milliseconds. */
export interface PairedInput {
  readonly id: string;
  readonly group?: string;
  readonly ms: Readonly<Record<string, readonly number[]>>;
  readonly median: Readonly<Record<string, number>>;
  readonly ratio: Readonly<Record<string, number>>;
  readonly peakRss?: Readonly<Record<string, number>>;
}

/** The report of a paired time run: schema `paired-time/1`. */
export interface PairedReport {
  readonly schema: "paired-time/1";
  readonly mode: Mode;
  readonly context?: string;
  readonly env: PairedEnv;
  readonly base: string;
  readonly arms: readonly string[];
  readonly inputs: readonly PairedInput[];
  readonly ratios: Readonly<Record<string, PairedRatio>>;
  readonly noiseFloor: { readonly median: number; readonly p10: number; readonly p90: number } | null;
}

/** The id of the A/A arm of a base arm. */
export function aaId(base: string): string;

/** The quantile `q` (0 to 1) of the values, with linear interpolation. No values give `NaN`. */
export function quantileOf(values: readonly number[], q: number): number;

/** The paired time test. Mode `fresh` gives a promise of the report. */
export function measureIsolated(options: PairedOptions & { mode: "fresh" }): Promise<PairedReport>;
export function measureIsolated(options: PairedOptions): PairedReport | Promise<PairedReport>;

/** The Markdown table of a report. */
export function pairedMarkdown(r: PairedReport, title?: string): string;
