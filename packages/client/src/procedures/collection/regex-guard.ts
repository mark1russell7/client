/**
 * The guard of `$regex` against patterns that can take an exponential time in a backtracking
 * engine such as V8. It reads the pattern, and it refuses a group that repeats when the group can
 * match the same text in more than one way:
 *
 * - The group holds a repetition of variable length: `(a+)+`, `(a{2,3})+`, `(a?a?)+`.
 * - The group holds alternatives that can start with the same character: `(a|a)*`, `(a|aa)+`.
 *
 * A group with a bounded repetition passes when the number of its ways to match is small, for
 * example `(\d{1,3}\.){3}`. The guard does not find each polynomial pattern, for example `\s*\s*$`.
 * A host keeps `maxRegexLength` small for callers that it does not trust.
 */

/** A set of UTF-16 code units: the ranges, or each code unit outside them when `negated`. */
interface CharSet {
  readonly ranges: ReadonlyArray<readonly [number, number]>;
  readonly negated: boolean;
}

/** One part of a pattern. */
type RegexNode =
  | { readonly kind: "atom"; readonly first: CharSet; readonly width: boolean }
  | { readonly kind: "group"; readonly branches: RegexNode[][]; readonly width: boolean }
  | { readonly kind: "repeat"; readonly node: RegexNode; readonly min: number; readonly max: number };

/** The most ways to match that a group with a bounded repetition can have. */
const MAX_WAYS = 1000;

const ANY: CharSet = { ranges: [], negated: true };
const DIGIT: Array<[number, number]> = [[0x30, 0x39]];
const WORD: Array<[number, number]> = [[0x30, 0x39], [0x41, 0x5a], [0x5f, 0x5f], [0x61, 0x7a]];
const SPACE: Array<[number, number]> = [
  [0x09, 0x0d], [0x20, 0x20], [0xa0, 0xa0], [0x1680, 0x1680], [0x2000, 0x200a],
  [0x2028, 0x2029], [0x202f, 0x202f], [0x205f, 0x205f], [0x3000, 0x3000], [0xfeff, 0xfeff],
];
const CONTROL_ESCAPES: Record<string, number> = { t: 9, n: 10, v: 11, f: 12, r: 13, "0": 0 };

/** With the flag `i`, each ASCII letter of a range also gives the letter of the other case. */
function folded(ranges: ReadonlyArray<readonly [number, number]>, ignoreCase: boolean): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = [...ranges];
  if (!ignoreCase) return result;
  for (const [lo, hi] of ranges) {
    for (const [from, to, shift] of [[0x41, 0x5a, 0x20], [0x61, 0x7a, -0x20]] as const) {
      const start = Math.max(lo, from);
      const end = Math.min(hi, to);
      if (start <= end) result.push([start + shift, end + shift]);
    }
  }
  return result;
}

/** True when each code unit of a range is in one of the ranges. */
function covered([lo, hi]: readonly [number, number], ranges: ReadonlyArray<readonly [number, number]>): boolean {
  let next = lo;
  for (const [from, to] of [...ranges].sort((a, b) => a[0] - b[0])) {
    if (from > next) break;
    next = Math.max(next, to + 1);
    if (next > hi) return true;
  }
  return next > hi;
}

/** True when two sets can have the same code unit. */
function overlaps(a: CharSet, b: CharSet): boolean {
  if (a.negated && b.negated) return true;
  if (!a.negated && !b.negated) return a.ranges.some(([lo, hi]) => b.ranges.some(([from, to]) => lo <= to && from <= hi));
  const [positive, negative] = a.negated ? [b, a] : [a, b];
  return positive.ranges.some((range) => !covered(range, negative.ranges));
}

/** This function reads a pattern into parts. A construct that it does not know becomes an atom that can match each character. */
function parse(pattern: string, ignoreCase: boolean): RegexNode[][] {
  let at = 0;
  const set = (ranges: ReadonlyArray<readonly [number, number]>, negated = false): CharSet => ({ ranges: folded(ranges, ignoreCase), negated });
  const unit = (code: number): CharSet => set([[code, code]]);

  /** The code unit of an escape that names one character, after the backslash. */
  const escapedCode = (): number => {
    const char = pattern[at++] ?? "\\";
    if (char in CONTROL_ESCAPES) return CONTROL_ESCAPES[char]!;
    if (char === "x" && /^[0-9a-fA-F]{2}/.test(pattern.slice(at))) {
      at += 2;
      return Number.parseInt(pattern.slice(at - 2, at), 16);
    }
    if (char === "u") {
      const braced = /^\{([0-9a-fA-F]+)\}/.exec(pattern.slice(at));
      if (braced) {
        at += braced[0].length;
        const code = Number.parseInt(braced[1]!, 16);
        return code > 0xffff ? 0xd800 + ((code - 0x10000) >> 10) : code;
      }
      if (/^[0-9a-fA-F]{4}/.test(pattern.slice(at))) {
        at += 4;
        return Number.parseInt(pattern.slice(at - 4, at), 16);
      }
    }
    if (char === "c" && /^[a-zA-Z]/.test(pattern.slice(at))) return pattern.charCodeAt(at++) % 32;
    return char.charCodeAt(0);
  };

  /** The set of a class escape (`\d`, `\W`), or undefined for another escape. The backslash is read. */
  const classEscape = (): CharSet | undefined => {
    const char = pattern[at];
    const ranges = char === "d" || char === "D" ? DIGIT : char === "w" || char === "W" ? WORD : char === "s" || char === "S" ? SPACE : undefined;
    if (ranges !== undefined) {
      at++;
      return set(ranges, char === "D" || char === "W" || char === "S");
    }
    if (char === "p" || char === "P") {
      at++;
      if (pattern[at] === "{") {
        const end = pattern.indexOf("}", at);
        at = end === -1 ? pattern.length : end + 1;
      }
      return ANY;
    }
    return undefined;
  };

  const parseClass = (): CharSet => {
    const negated = pattern[at] === "^";
    if (negated) at++;
    const ranges: Array<[number, number]> = [];
    let unknown = false;
    const member = (): number | undefined => {
      if (pattern[at] !== "\\") return pattern.charCodeAt(at++);
      at++;
      const escape = classEscape();
      if (escape !== undefined) {
        // A negated escape in a class, or a property: the set is not known here
        if (escape.negated) unknown = true;
        else ranges.push(...(escape.ranges as Array<[number, number]>));
        return undefined;
      }
      if (pattern[at] === "b") {
        at++;
        return 8;
      }
      return escapedCode();
    };
    while (at < pattern.length && pattern[at] !== "]") {
      const low = member();
      if (low === undefined) continue;
      if (pattern[at] === "-" && pattern[at + 1] !== "]" && at + 1 < pattern.length) {
        at++;
        const high = member();
        if (high === undefined) {
          ranges.push([low, low], [0x2d, 0x2d]);
          continue;
        }
        ranges.push([Math.min(low, high), Math.max(low, high)]);
      } else {
        ranges.push([low, low]);
      }
    }
    at++;
    if (unknown) return ANY;
    return set(ranges, negated);
  };

  const parseAtom = (): RegexNode => {
    const char = pattern[at++]!;
    if (char === "(") {
      let width = true;
      for (const [prefix, zeroWidth] of [["?:", false], ["?=", true], ["?!", true], ["?<=", true], ["?<!", true]] as const) {
        if (pattern.startsWith(prefix, at)) {
          at += prefix.length;
          width = !zeroWidth;
          break;
        }
      }
      if (width && pattern.startsWith("?<", at)) {
        const end = pattern.indexOf(">", at);
        at = end === -1 ? pattern.length : end + 1;
      } else if (width && pattern[at] === "?") {
        // A modifier group, for example (?i:x)
        const colon = pattern.indexOf(":", at);
        at = colon === -1 ? pattern.length : colon + 1;
      }
      const branches = parseAlternatives();
      if (pattern[at] === ")") at++;
      return { kind: "group", branches, width };
    }
    if (char === "[") return { kind: "atom", first: parseClass(), width: true };
    if (char === ".") return { kind: "atom", first: ANY, width: true };
    if (char === "^" || char === "$") return { kind: "atom", first: ANY, width: false };
    if (char === "\\") {
      const escape = classEscape();
      if (escape !== undefined) return { kind: "atom", first: escape, width: true };
      const next = pattern[at];
      if (next === "b" || next === "B") {
        at++;
        return { kind: "atom", first: ANY, width: false };
      }
      // A back reference matches a text that the guard does not know
      if (next !== undefined && /[1-9]/.test(next)) {
        while (/[0-9]/.test(pattern[at] ?? "")) at++;
        return { kind: "atom", first: ANY, width: true };
      }
      if (next === "k" && pattern[at + 1] === "<") {
        const end = pattern.indexOf(">", at);
        at = end === -1 ? pattern.length : end + 1;
        return { kind: "atom", first: ANY, width: true };
      }
      return { kind: "atom", first: unit(escapedCode()), width: true };
    }
    return { kind: "atom", first: unit(char.charCodeAt(0)), width: true };
  };

  /** The bounds of a quantifier at the position, or undefined. A lazy quantifier has the same bounds. */
  const parseQuantifier = (): { min: number; max: number } | undefined => {
    const char = pattern[at];
    let bounds: { min: number; max: number } | undefined;
    if (char === "*") bounds = { min: 0, max: Infinity };
    else if (char === "+") bounds = { min: 1, max: Infinity };
    else if (char === "?") bounds = { min: 0, max: 1 };
    if (bounds !== undefined) {
      at++;
    } else if (char === "{") {
      const counted = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(at));
      if (counted === null) return undefined;
      at += counted[0].length;
      const min = Number(counted[1]);
      bounds = { min, max: counted[2] === undefined ? min : counted[3] === "" ? Infinity : Number(counted[3]) };
    } else {
      return undefined;
    }
    if (pattern[at] === "?") at++;
    return bounds;
  };

  const parseAlternatives = (): RegexNode[][] => {
    const branches: RegexNode[][] = [[]];
    while (at < pattern.length && pattern[at] !== ")") {
      if (pattern[at] === "|") {
        at++;
        branches.push([]);
        continue;
      }
      const atom = parseAtom();
      const bounds = parseQuantifier();
      branches[branches.length - 1]!.push(bounds === undefined ? atom : { kind: "repeat", node: atom, ...bounds });
    }
    return branches;
  };

  const top: RegexNode[][] = [];
  while (at < pattern.length) {
    top.push(...parseAlternatives());
    // A ")" without its "(": the RegExp constructor refuses the pattern
    at++;
  }
  return top;
}

/** The characters that a branch can start with. An empty branch, or a start that can be empty, can start with each character. */
function firstOf(branch: readonly RegexNode[]): CharSet {
  const node = branch[0];
  if (node === undefined) return ANY;
  if (node.kind === "atom") return node.width ? node.first : ANY;
  if (node.kind === "repeat") return node.min >= 1 ? firstOf([node.node]) : ANY;
  if (!node.width) return ANY;
  const sets = node.branches.map(firstOf);
  if (sets.some((one) => one.negated)) return ANY;
  return { ranges: sets.flatMap((one) => one.ranges), negated: false };
}

/** What makes a group match the same text in more than one way. */
interface Ways {
  /** A repetition without a bound inside the group. */
  unbounded: boolean;
  /** A repetition of variable length inside the group. */
  variable: boolean;
  /** Alternatives inside the group that can start with the same character. */
  overlap: boolean;
  /** An upper bound of the ways to match one time. */
  count: number;
}

/** This function adds the ways of the parts inside a group to `ways`. */
function collect(nodes: readonly RegexNode[], ways: Ways): void {
  for (const node of nodes) {
    if (node.kind === "repeat") {
      if (node.min !== node.max) {
        ways.variable = true;
        if (node.max === Infinity) ways.unbounded = true;
        ways.count *= node.max - node.min + 1;
      }
      collect([node.node], ways);
    } else if (node.kind === "group") {
      if (node.branches.length > 1) {
        ways.count *= node.branches.length;
        const firsts = node.branches.map(firstOf);
        if (firsts.some((first, index) => firsts.slice(index + 1).some((other) => overlaps(first, other)))) ways.overlap = true;
      }
      for (const branch of node.branches) collect(branch, ways);
    }
  }
}

/** The first problem of a repeated group in the parts, or undefined. */
function problemOf(nodes: readonly RegexNode[]): string | undefined {
  for (const node of nodes) {
    if (node.kind === "group") {
      for (const branch of node.branches) {
        const problem = problemOf(branch);
        if (problem !== undefined) return problem;
      }
      continue;
    }
    if (node.kind !== "repeat") continue;
    if (node.max > 1 && node.node.kind === "group") {
      const ways: Ways = { unbounded: false, variable: false, overlap: false, count: 1 };
      collect([node.node], ways);
      if (ways.unbounded) return "repeats a group that repeats without a bound";
      // A bounded repetition with few ways to match passes, for example (\d{1,3}\.){3}
      const few = node.max !== Infinity && ways.count ** node.max <= MAX_WAYS;
      if (ways.overlap && !few) return "repeats a group with alternatives that can start with the same character";
      if (ways.variable && !few) return "repeats a group with a repetition of variable length";
    }
    const problem = problemOf([node.node]);
    if (problem !== undefined) return problem;
  }
  return undefined;
}

/**
 * This function gives the reason why a pattern can take an exponential time, or undefined. It
 * reads the pattern with its flags: with `i`, `a` and `A` are the same character.
 */
export function exponentialRegex(pattern: string, flags = ""): string | undefined {
  return problemOf(parse(pattern, flags.includes("i")).flat());
}
