/**
 * The secret names and the settings of the env procedures.
 *
 * A secret is a variable whose name matches a pattern. A pattern is a name with `*` for each
 * sequence of characters (also an empty one). The comparison ignores the case, because Windows
 * ignores the case of the names of variables.
 */

import type { EnvSource } from "./types.js";

/** The default patterns of secret names. */
export const DEFAULT_SECRET_PATTERNS: readonly string[] = Object.freeze(["*_TOKEN", "*_KEY", "*_SECRET", "*PASSWORD*"]);

/** This function gives the regular expression of a pattern: `*` matches each sequence of characters. */
function patternExpression(pattern: string): RegExp {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

/** This function gives the test of the secret names for a list of patterns. */
export function secretMatcher(patterns: readonly string[]): (name: string) => boolean {
  const expressions = patterns.map((pattern) => {
    if (typeof pattern !== "string" || pattern.trim() === "") throw new TypeError("A secret pattern must be a text that is not empty");
    return patternExpression(pattern);
  });
  return (name) => expressions.some((expression) => expression.test(name));
}

/** True when the name matches one of the default patterns of secret names. */
export const isDefaultSecret: (name: string) => boolean = secretMatcher(DEFAULT_SECRET_PATTERNS);

/** What the procedures of a module use: the variables, the secret test and the reveal rule. */
export interface EnvSettings {
  /** This function gives the variables at the time of a call. */
  readonly source: () => EnvSource;
  /** True when a name is a secret. */
  readonly isSecret: (name: string) => boolean;
  /** True when `env.get` gives the value of this secret. */
  readonly reveals: (name: string) => boolean;
}

/** The settings of the default module: `process.env`, the default patterns, and no secret revealed. */
export const DEFAULT_ENV_SETTINGS: EnvSettings = Object.freeze({
  source: () => process.env,
  isSecret: isDefaultSecret,
  reveals: () => false,
});

/** The value of a variable, or undefined. The lookup is the lookup of the source: `process.env` ignores the case on Windows. */
export function valueOf(source: EnvSource, name: string): string | undefined {
  const value = source[name];
  return typeof value === "string" ? value : undefined;
}
