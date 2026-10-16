/**
 * The procedures of @procedures/llm as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/llm
 *
 * `llmModule` sends each request to the Anthropic Messages API with the key of the environment
 * variable `ANTHROPIC_API_KEY`. `createLlmModule()` gives the same procedures with another
 * variable, another default model, another base URL or another `fetch` (roadmap R46).
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
  type ProcedureContext,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import { llmComplete } from "./procedures/llm/complete.js";
import { llmStructured, MAX_RETRIES } from "./procedures/llm/structured.js";
import { DEFAULT_LLM_SETTINGS, type EnvSource, type FetchFunction, type LlmSettings } from "./anthropic.js";
import type { LlmCompleteInput, LlmCompleteOutput, LlmStructuredInput, LlmStructuredOutput } from "./types.js";

// =============================================================================
// Schemas
// =============================================================================

const requestFields = {
  prompt: z.string().min(1).max(4_000_000).describe("The text of the user"),
  system: z.string().max(4_000_000).optional().describe("The system text: the instructions to the model"),
  model: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/, "A model ID")
    .optional()
    .describe("The model (default: the model of the module, claude-sonnet-5-5)"),
  maxTokens: z.number().int().min(1).max(64_000).optional().describe("The most tokens of the output, with the thinking (default 16000)"),
  temperature: z.number().min(0).max(1).optional().describe("The temperature, 0 to 1. Some models accept only the default"),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional().describe("The effort of the model (default: the default of the model)"),
  timeoutMs: z.number().int().positive().max(3_600_000).optional().describe("The time limit of the call, in milliseconds (default 600000)"),
  fallback: z.boolean().optional().describe("True: the API runs a declined request again on its fallback model (default: the option of the module, true)"),
};

const usage = z
  .object({
    inputTokens: z.number().int().describe("The tokens of the input that the cache did not have"),
    outputTokens: z.number().int().describe("The tokens of the output, with the thinking"),
    cacheReadInputTokens: z.number().int().describe("The tokens of the input from the cache"),
    cacheCreationInputTokens: z.number().int().describe("The tokens of the input that went into the cache"),
  })
  .describe("The tokens of the call");

const LlmCompleteInputSchema = z.object(requestFields);

const LlmCompleteOutputSchema = z.object({
  text: z.string().describe("The text of the answer"),
  model: z.string().describe("The model that answered"),
  stopReason: z.string().describe("Why the model stopped: end_turn, max_tokens, stop_sequence or another reason"),
  usage,
});

const LlmStructuredInputSchema = z.object({
  ...requestFields,
  schema: z.record(z.string(), z.unknown()).describe("The JSON Schema of the value"),
  constrained: z.boolean().optional().describe("True (default): the API constrains the output to the schema. False: the system text gives the schema"),
  retries: z.number().int().min(0).max(MAX_RETRIES).optional().describe("The new tries after an answer that is not valid, 0 to 2 (default 2)"),
});

const LlmStructuredOutputSchema = z.object({
  value: z.unknown().describe("The value: the schema accepts it"),
  model: z.string().describe("The model that gave the value"),
  attempts: z.number().int().describe("The number of calls to the model"),
  usage,
  unchecked: z.array(z.string()).describe("The keywords of the schema that the check does not examine fully"),
});

// =============================================================================
// Procedures
// =============================================================================

/**
 * The effects of each procedure: it sends data to a system outside the host and gets an answer.
 * A call costs money and can change the state of an account, so it declares a write. It deletes
 * nothing and a second call is a new call.
 */
const SENDS_TO_MODEL: Effects = Object.freeze({ reads: Object.freeze(["network"]), writes: Object.freeze(["network"]), destructive: false, idempotent: false });

/** The two procedures, with handlers that use the settings. */
function llmProcedures(settings: LlmSettings): AnyProcedure[] {
  const llmCompleteProcedure = createProcedure()
    .path(["llm", "complete"])
    .input(zodAdapter<LlmCompleteInput>(LlmCompleteInputSchema))
    .output(zodAdapter<LlmCompleteOutput>(LlmCompleteOutputSchema))
    .meta({
      description: "Send a prompt to a language model and give the text and the usage",
      tags: ["llm", "anthropic"],
      args: ["prompt"],
      shorts: { model: "m", system: "s" },
      output: "json",
      effects: SENDS_TO_MODEL,
    })
    .handler(async (input: LlmCompleteInput, ctx: ProcedureContext): Promise<LlmCompleteOutput> => llmComplete(input, ctx, settings))
    .build();

  const llmStructuredProcedure = createProcedure()
    .path(["llm", "structured"])
    .input(zodAdapter<LlmStructuredInput>(LlmStructuredInputSchema))
    .output(zodAdapter<LlmStructuredOutput>(LlmStructuredOutputSchema))
    .meta({
      description: "Send a prompt and a JSON Schema to a language model and give a value that the schema accepts",
      tags: ["llm", "anthropic", "json-schema"],
      args: ["prompt"],
      shorts: { model: "m", system: "s" },
      output: "json",
      effects: SENDS_TO_MODEL,
    })
    .handler(async (input: LlmStructuredInput, ctx: ProcedureContext): Promise<LlmStructuredOutput> => llmStructured(input, ctx, settings))
    .build();

  return [llmCompleteProcedure, llmStructuredProcedure];
}

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Each call reads the
 * key from `ANTHROPIC_API_KEY`. Importing this file registers nothing.
 */
export const llmModule: ProcedureModule = defineModule("@procedures/llm", llmProcedures(DEFAULT_LLM_SETTINGS));

export default llmModule;

/** The options of `createLlmModule()`. */
export interface LlmModuleOptions {
  /** The environment variable of the API key. The default is `ANTHROPIC_API_KEY`. */
  readonly apiKeyEnv?: string | undefined;
  /** The model of an input without `model`. The default is `claude-sonnet-5-5`. */
  readonly defaultModel?: string | undefined;
  /** The base URL of the API. The default is `https://api.anthropic.com`. */
  readonly baseUrl?: string | undefined;
  /** The default of the `fallback` input. The default is true. */
  readonly fallback?: boolean | undefined;
  /** The `fetch` of the requests. The default is the global `fetch`. A test gives a fake one. */
  readonly fetch?: FetchFunction | undefined;
  /** The variables: a record, or a function that gives them at each call. The default is `process.env`. */
  readonly env?: EnvSource | (() => EnvSource) | undefined;
}

/**
 * This function gives the module of this package with other settings. Without options, it gives
 * `llmModule`. A host gives it to `createRegistry()` before its bundles, so it replaces the
 * `llmModule` that a bundle requires (the first module of a name counts). A bad option throws here.
 *
 * ```ts
 * createRegistry(createLlmModule({ apiKeyEnv: "WORK_ANTHROPIC_KEY", defaultModel: "claude-haiku-5-5" }));
 * ```
 */
export function createLlmModule(options: LlmModuleOptions = {}): ProcedureModule {
  if (Object.values(options).every((value) => value === undefined)) return llmModule;
  const apiKeyEnv = options.apiKeyEnv ?? DEFAULT_LLM_SETTINGS.apiKeyEnv;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(apiKeyEnv)) throw new TypeError(`createLlmModule: apiKeyEnv must be the name of a variable, not ${JSON.stringify(apiKeyEnv)}`);
  const baseUrl = options.baseUrl ?? DEFAULT_LLM_SETTINGS.baseUrl;
  if (!/^https?:\/\//.test(baseUrl)) throw new TypeError("createLlmModule: baseUrl must be an http or https URL");
  const env = options.env;
  const settings: LlmSettings = {
    apiKeyEnv,
    env: env === undefined ? DEFAULT_LLM_SETTINGS.env : typeof env === "function" ? env : () => env,
    fetch: options.fetch ?? DEFAULT_LLM_SETTINGS.fetch,
    baseUrl,
    defaultModel: options.defaultModel ?? DEFAULT_LLM_SETTINGS.defaultModel,
    fallback: options.fallback ?? DEFAULT_LLM_SETTINGS.fallback,
  };
  return defineModule("@procedures/llm", llmProcedures(settings));
}

/**
 * This function registers the procedures of @procedures/llm in a registry. The default is the
 * global registry. The options are the options of `createLlmModule()`.
 */
export function registerLlmProcedures(registry: ProcedureRegistry = PROCEDURE_REGISTRY, options: LlmModuleOptions = {}): void {
  registerModules(registry, [createLlmModule(options)]);
}
