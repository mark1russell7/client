/**
 * The procedures of @procedures/env as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/env
 *
 * `envModule` reads `process.env` and masks each secret. `createEnvModule()` gives the same
 * procedures with more secret patterns, secrets that `env.get` reveals, or other variables
 * (roadmap R46). These procedures are not MCP tools: a value goes to the model and its provider.
 */

import { z } from "zod";
import {
  defineModule,
  registerModules,
  PROCEDURE_REGISTRY,
  createProcedure,
  zodAdapter,
  type AnyProcedure,
  type Effects,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import { envGet } from "./procedures/env/get.js";
import { envList } from "./procedures/env/list.js";
import { envCheck } from "./procedures/env/check.js";
import { DEFAULT_ENV_SETTINGS, DEFAULT_SECRET_PATTERNS, secretMatcher, type EnvSettings } from "./secrets.js";
import type { EnvCheckInput, EnvCheckOutput, EnvGetInput, EnvGetOutput, EnvListInput, EnvListOutput, EnvSource } from "./types.js";

// =============================================================================
// Schemas
// =============================================================================

/** The name of a variable: not empty, without `=` and without a NUL character. */
const variableName = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^[^=\0]+$/, "A name without = and without NUL")
  .describe("The name of an environment variable");

const EnvGetInputSchema = z.object({ name: variableName });

const EnvGetOutputSchema = z.object({
  name: z.string().describe("The name of the variable"),
  set: z.boolean().describe("True when the variable has a value. An empty value counts as set"),
  secret: z.boolean().describe("True when the name matches a pattern of secret names"),
  masked: z.boolean().describe("True for a secret that the host does not reveal: the output has no value"),
  value: z.string().optional().describe("The value. Absent for a variable that is not set and for a masked secret"),
});

const EnvListInputSchema = z.object({
  prefix: z.string().max(1024).optional().describe("Only the names that start with this text. The comparison ignores the case"),
  values: z.boolean().optional().describe("True: give the value of each variable that is not a secret (default false)"),
});

const EnvListOutputSchema = z.object({
  variables: z
    .array(
      z.object({
        name: z.string(),
        secret: z.boolean().describe("True when the name matches a pattern of secret names"),
        value: z.string().optional().describe("The value: only with values: true, and never for a secret"),
      }),
    )
    .describe("The variables, sorted by name"),
});

const EnvCheckInputSchema = z.object({
  required: z.array(variableName).max(1000).describe("The names of the variables that must have a value"),
  allowEmpty: z.boolean().optional().describe("True: an empty value counts as present (default false)"),
});

const EnvCheckOutputSchema = z.object({
  ok: z.boolean().describe("True when no required variable is missing"),
  missing: z.array(z.string()).describe("The required variables without a value"),
  present: z.array(z.string()).describe("The required variables with a value"),
});

// =============================================================================
// Procedures
// =============================================================================

/** The effects of each procedure: it reads the environment of the process and changes nothing. */
const READS_PROCESS: Effects = Object.freeze({ reads: Object.freeze(["process"]), writes: Object.freeze([]) });

/** The three procedures, with handlers that use the settings. */
function envProcedures(settings: EnvSettings): AnyProcedure[] {
  const envGetProcedure = createProcedure()
    .path(["env", "get"])
    .input(zodAdapter<EnvGetInput>(EnvGetInputSchema))
    .output(zodAdapter<EnvGetOutput>(EnvGetOutputSchema))
    .meta({
      description: "One environment variable. A secret is masked unless the host reveals it",
      tags: ["env", "secrets"],
      args: ["name"],
      shorts: {},
      output: "json",
      effects: READS_PROCESS,
    })
    .handler(async (input: EnvGetInput): Promise<EnvGetOutput> => envGet(input, settings))
    .build();

  const envListProcedure = createProcedure()
    .path(["env", "list"])
    .input(zodAdapter<EnvListInput>(EnvListInputSchema))
    .output(zodAdapter<EnvListOutput>(EnvListOutputSchema))
    .meta({
      description: "The names of the environment variables, never the values of the secrets",
      tags: ["env", "secrets"],
      args: ["prefix"],
      shorts: {},
      output: "json",
      effects: READS_PROCESS,
    })
    .handler(async (input: EnvListInput): Promise<EnvListOutput> => envList(input, settings))
    .build();

  const envCheckProcedure = createProcedure()
    .path(["env", "check"])
    .input(zodAdapter<EnvCheckInput>(EnvCheckInputSchema))
    .output(zodAdapter<EnvCheckOutput>(EnvCheckOutputSchema))
    .meta({
      description: "Which required environment variables are missing",
      tags: ["env"],
      args: ["required"],
      shorts: {},
      output: "json",
      effects: READS_PROCESS,
    })
    .handler(async (input: EnvCheckInput): Promise<EnvCheckOutput> => envCheck(input, settings))
    .build();

  return [envGetProcedure, envListProcedure, envCheckProcedure];
}

/**
 * The module of this package, for `createRegistry()`: its procedures as data. It reads
 * `process.env` at each call and masks each secret. Importing this file registers nothing.
 */
export const envModule: ProcedureModule = defineModule("@procedures/env", envProcedures(DEFAULT_ENV_SETTINGS));

export default envModule;

/** The options of `createEnvModule()`. */
export interface EnvModuleOptions {
  /** More patterns of secret names, after the default patterns. `*` matches each sequence of characters. */
  readonly secretPatterns?: readonly string[] | undefined;
  /**
   * The secrets whose value `env.get` gives: `true` for each secret, or a list of names (the
   * comparison ignores the case). The default is none. `env.list` never gives a secret.
   */
  readonly revealSecrets?: boolean | readonly string[] | undefined;
  /** The variables: a record, or a function that gives them at each call. The default is `process.env`. */
  readonly env?: EnvSource | (() => EnvSource) | undefined;
}

/**
 * This function gives the module of this package with other settings. Without options, it gives
 * `envModule`. A host gives it to `createRegistry()` before its bundles, so it replaces the
 * `envModule` that a bundle requires (the first module of a name counts).
 *
 * ```ts
 * createRegistry(createEnvModule({ secretPatterns: ["DATABASE_URL"], revealSecrets: ["NPM_TOKEN"] }));
 * ```
 */
export function createEnvModule(options: EnvModuleOptions = {}): ProcedureModule {
  if (Object.values(options).every((value) => value === undefined)) return envModule;
  const env = options.env;
  const source = env === undefined ? DEFAULT_ENV_SETTINGS.source : typeof env === "function" ? env : () => env;
  const reveal = options.revealSecrets;
  const revealed = Array.isArray(reveal) ? new Set(reveal.map((name) => name.toUpperCase())) : undefined;
  const settings: EnvSettings = {
    source,
    isSecret: secretMatcher([...DEFAULT_SECRET_PATTERNS, ...(options.secretPatterns ?? [])]),
    reveals: reveal === true ? () => true : revealed ? (name) => revealed.has(name.toUpperCase()) : () => false,
  };
  return defineModule("@procedures/env", envProcedures(settings));
}

/**
 * This function registers the procedures of @procedures/env in a registry. The default is the
 * global registry. The options are the options of `createEnvModule()`.
 */
export function registerEnvProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: EnvModuleOptions = {}): void {
  registerModules(registry, [createEnvModule(options)]);
}
