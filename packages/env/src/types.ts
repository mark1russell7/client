/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here. The zod schemas are in
 * `module.ts`: an exported schema needs a written type (isolatedDeclarations).
 */

/** The variables that the procedures read: a name and a value, or undefined for a variable that is not set. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

// =============================================================================
// env.get
// =============================================================================

export interface EnvGetInput {
  /** The name of the variable. */
  name: string;
}

export interface EnvGetOutput {
  /** The name of the variable. */
  name: string;
  /** True when the variable has a value. An empty value counts as set. */
  set: boolean;
  /** True when the name matches a pattern of secret names. */
  secret: boolean;
  /** True when the variable is a secret and the host does not reveal it: the output has no value. */
  masked: boolean;
  /** The value. It is absent for a variable that is not set and for a masked secret. */
  value?: string | undefined;
}

// =============================================================================
// env.list
// =============================================================================

export interface EnvListInput {
  /** Only the names that start with this text. The comparison ignores the case. */
  prefix?: string | undefined;
  /** True: the output has the value of each variable that is not a secret. The default is false. */
  values?: boolean | undefined;
}

/** One variable of `env.list`. */
export interface EnvListEntry {
  name: string;
  /** True when the name matches a pattern of secret names. */
  secret: boolean;
  /** The value, only with `values: true` and only for a variable that is not a secret. */
  value?: string | undefined;
}

export interface EnvListOutput {
  /** The variables, sorted by name. */
  variables: EnvListEntry[];
}

// =============================================================================
// env.check
// =============================================================================

export interface EnvCheckInput {
  /** The names of the variables that must have a value. */
  required: string[];
  /** True: an empty value counts as present. The default is false: an empty value counts as missing. */
  allowEmpty?: boolean | undefined;
}

export interface EnvCheckOutput {
  /** True when no required variable is missing. */
  ok: boolean;
  /** The required variables that are not set (or that are empty), in the order of the input. */
  missing: string[];
  /** The required variables that have a value, in the order of the input. */
  present: string[];
}
