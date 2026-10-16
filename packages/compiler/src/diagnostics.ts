/**
 * The diagnostics of the compiler: each problem that a pass finds, with the JSON pointer of its
 * source in the program.
 */

/** The severity of a diagnostic. An error makes `ok` false: the host does not start the program. */
export type Severity = "error" | "warning" | "info";

/** The codes of the diagnostics. */
export type DiagnosticCode =
  /** The program is not a call: `client.exec()` starts only a call. */
  | "root-not-call"
  /** A `$proc` path is empty, or it has a segment that is not a string. */
  | "invalid-path"
  /** No procedure has the path. */
  | "unknown-procedure"
  /** The host does not expose the procedure, so a data-driven procedure cannot call it. */
  | "not-exposed"
  /** The capability refuses the call: its effects, or a destructive procedure. */
  | "capability-refused"
  /** The compiler cannot see what a call runs, so it does not know its effects. */
  | "effects-unknown"
  /** A `$ref` reads a name that no scope has. */
  | "unknown-name"
  /** A `$ref` reads the name of a later step of a chain. */
  | "use-before-definition"
  /** A `$ref` is outside each scope, so it is data. */
  | "unscoped-ref"
  /** The input does not agree with the JSON Schema of the procedure. */
  | "input-schema"
  /** The input of a control-flow procedure does not agree with its schema. */
  | "invalid-control-flow"
  /** The `fn` of `client.map` or `client.reduce` is not one call. */
  | "fn-not-call"
  /** The calls nest deeper than the hydration limit of 10 levels. */
  | "depth-limit"
  /** Plain data nests deeper than 1000 levels. */
  | "data-depth"
  /** An input contains itself. */
  | "cyclic-input"
  /** A `$never` call is data in a position where a call usually runs. */
  | "never-trap"
  /** A call waits for its runner (`$parent` or a context name), so hydration keeps it as data. */
  | "deferred-call"
  /** A `$name` on a call that is not a chain step: no `$ref` can read it. */
  | "name-not-bound"
  /** Two steps of one chain have the same `$name`. */
  | "duplicate-name"
  /** Control flow adds `cwd` or `node` to an input that is not an object, so the input is lost. */
  | "input-replaced"
  /** An array of calls runs as one `client.chain`: its value is `{ results, final }`. */
  | "implicit-chain"
  /** A literal of the program has no source text (a function, a class instance). */
  | "not-serializable"
  /** The program nests so deep that a JavaScript parser can refuse its source text. */
  | "text-depth";

/** One problem that the compiler found. */
export interface Diagnostic {
  readonly severity: Severity;
  readonly code: DiagnosticCode;
  readonly message: string;
  /** The JSON pointer (RFC 6901) of the part of the program. The empty string is the root. */
  readonly pointer: string;
}

/** True when the list has an error. */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

/** The diagnostics in the order of their pointers, then the errors first. The same problem at the same place is one diagnostic. */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  const rank: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const seen = new Set<string>();
  const unique = diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.pointer}\u0000${diagnostic.code}\u0000${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => comparePointers(a.pointer, b.pointer) || rank[a.severity] - rank[b.severity]);
}

/** The order of two pointers: the segments one by one, and a number segment as a number. */
function comparePointers(a: string, b: string): number {
  const left = a.split("/");
  const right = b.split("/");
  for (let index = 0; index < Math.min(left.length, right.length); index++) {
    const x = left[index]!;
    const y = right[index]!;
    if (x === y) continue;
    const numbers = /^\d+$/.test(x) && /^\d+$/.test(y);
    if (numbers) return Number(x) - Number(y);
    return x < y ? -1 : 1;
  }
  return left.length - right.length;
}
