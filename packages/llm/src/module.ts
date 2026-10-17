/**
 * The procedures of @procedures/llm as data. Importing this file registers nothing.
 *
 * Scaffold a procedure with: mark procedure new <name> --path packages/llm
 *
 * `llmModule` sends each request to the Anthropic Messages API with the key of the environment
 * variable `ANTHROPIC_API_KEY`. `createLlmModule()` gives the same procedures with another
 * variable, another default model, another base URL, another `fetch`, another number of new
 * tries or another backoff (roadmap R46).
 */

import { z } from "zod";
import { backoffProblems, type Backoff } from "@mark1russell7/service/backoff";
import {
  defineModule,
  registerModules,
  PROCEDURE_REGISTRY,
  createProcedure,
  markDataDriven,
  zodAdapter,
  type AnyProcedure,
  type Effects,
  type ProcedureContext,
  type ProcedureHandler,
  type ProcedureModule,
  type ProcedureRegistry,
} from "@procedures/client";
import { llmComplete } from "./procedures/llm/complete.js";
import { llmStructured, MAX_RETRIES } from "./procedures/llm/structured.js";
import { llmStream } from "./procedures/llm/stream.js";
import { DEFAULT_LLM_SETTINGS, type EnvSource, type FetchFunction, type LlmSettings } from "./anthropic.js";
import { MAX_REQUEST_RETRIES } from "./retry.js";
import type { LlmCompleteInput, LlmCompleteOutput, LlmStreamInput, LlmStreamOutput, LlmStructuredInput, LlmStructuredOutput } from "./types.js";

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
  timeoutMs: z.number().int().positive().max(3_600_000).optional().describe("The time limit of each request, in milliseconds (default 600000)"),
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

const TOOL_NAME = /^[a-zA-Z0-9_-]{1,128}$/;

const tool = z.object({
  name: z.string().regex(TOOL_NAME, "1 to 128 letters, digits, _ and -").describe("The name of the tool"),
  description: z.string().max(100_000).optional().describe("What the tool does and when the model uses it"),
  inputSchema: z.record(z.string(), z.unknown()).describe("The JSON Schema of the input of the tool, with type object"),
  strict: z.boolean().optional().describe("True: the API makes each input agree with the schema (strict tool use)"),
});

const parallel = z.boolean().optional().describe("True: the model uses at most one tool in an answer");

const toolChoice = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("auto"), disableParallelToolUse: parallel }),
    z.object({ type: z.literal("any"), disableParallelToolUse: parallel }),
    z.object({ type: z.literal("tool"), name: z.string().regex(TOOL_NAME).describe("The tool that the model uses"), disableParallelToolUse: parallel }),
    z.object({ type: z.literal("none") }),
  ])
  .describe("How the model uses the tools: auto (default), any, tool or none. Some models refuse any and tool");

const toolFields = {
  tools: z.array(tool).max(128).optional().describe("The tools that the model can use. The output gives each tool_use block"),
  toolChoice: toolChoice.optional(),
  retries: z
    .number()
    .int()
    .min(0)
    .max(MAX_REQUEST_RETRIES)
    .optional()
    .describe("The new tries after a retryable error (429, 529, 5xx, a connection error), 0 to 10 (default: the option of the module, 2)"),
};

const toolUse = z.object({
  id: z.string().describe("The ID of the tool_use block"),
  name: z.string().describe("The name of the tool"),
  input: z.unknown().describe("The input of the call"),
});

const toolCall = z.object({
  id: z.string().describe("The ID of the tool_use block"),
  name: z.string().describe("The name of the tool"),
  procedure: z.string().describe("The key of the procedure"),
  input: z.unknown().describe("The input that the model gave"),
  isError: z.boolean().describe("True when the procedure failed: the model got the error"),
  output: z.unknown().optional().describe("The output of the procedure"),
  error: z.string().optional().describe("The error of the procedure"),
});

/** The fields of procedures as tools, for `llm.complete` and `llm.stream`. */
const procedureFields = {
  procedures: z
    .array(z.string().regex(/^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/, "A procedure key, for example weather.current"))
    .max(64)
    .optional()
    .describe("The procedures that the model can use as tools: the procedure calls them and sends the results back"),
  maxRounds: z.number().int().min(1).max(64).optional().describe("The most requests to the model in one call, 1 to 64 (default 8)"),
};

const LlmCompleteInputSchema = z.object({ ...requestFields, ...toolFields, ...procedureFields });

const LlmCompleteOutputSchema = z.object({
  text: z.string().describe("The text of the last answer"),
  model: z.string().describe("The model that answered"),
  stopReason: z.string().describe("Why the model stopped: end_turn, max_tokens, stop_sequence, tool_use or another reason"),
  usage,
  toolUses: z.array(toolUse).describe("The tool_use blocks of the last answer that no procedure ran"),
  toolCalls: z.array(toolCall).describe("The calls of the procedure tools, in their sequence"),
  rounds: z.number().int().describe("The number of requests to the model"),
  roundLimit: z.boolean().describe("True when maxRounds stopped the loop before the model stopped"),
});

const LlmStructuredInputSchema = z.object({
  ...requestFields,
  schema: z.record(z.string(), z.unknown()).describe("The JSON Schema of the value"),
  constrained: z.boolean().optional().describe("True (default): the API constrains the output to the schema. False: the system text gives the schema"),
  retries: z.number().int().min(0).max(MAX_RETRIES).optional().describe("The new tries after an answer that is not valid, 0 to 2 (default 2)"),
  requestRetries: toolFields.retries,
});

const LlmStructuredOutputSchema = z.object({
  value: z.unknown().describe("The value: the schema accepts it"),
  model: z.string().describe("The model that gave the value"),
  attempts: z.number().int().describe("The number of calls to the model"),
  usage,
  unchecked: z.array(z.string()).describe("The keywords of the schema that the check does not examine fully"),
});

const LlmStreamInputSchema = z.object({ ...requestFields, ...toolFields, ...procedureFields });

const index = z.number().int().describe("The index of the content block");

const round = z.number().int().describe("The number of the request whose answer asked for the tool");

const LlmStreamOutputSchema = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("start"), id: z.string().describe("The ID of the message"), model: z.string().describe("The model that answers"), usage }),
    z.object({ type: z.literal("text"), index, text: z.string().describe("The new text") }),
    z.object({
      type: z.literal("tool_use"),
      index,
      id: z.string().describe("The ID of the tool_use block"),
      name: z.string().describe("The name of the tool"),
      input: z.unknown().describe("The input of the call, or null when its JSON is not complete"),
      partialJson: z.string().optional().describe("The JSON text of an input that does not parse"),
    }),
    z.object({
      type: z.literal("tool_call"),
      round,
      id: z.string().describe("The ID of the tool_use block"),
      name: z.string().describe("The name of the tool"),
      procedure: z.string().describe("The key of the procedure"),
      input: z.unknown().describe("The input that the model gave"),
    }),
    toolCall.extend({ type: z.literal("tool_result"), round }),
    z.object({
      type: z.literal("stop"),
      model: z.string().describe("The model of the last answer"),
      stopReason: z.string().describe("Why the model stopped in the last answer"),
      usage: usage.describe("The tokens of all the requests, added together"),
      text: z.string().describe("The text of all the answers: all the text deltas, joined"),
      toolUses: z.array(toolUse).describe("The tool_use blocks of the last answer that no procedure ran"),
      toolCalls: z.array(toolCall).optional().describe("The calls of the procedure tools, in their sequence. Only with procedures"),
      rounds: z.number().int().optional().describe("The number of requests to the model. Only with procedures"),
      roundLimit: z.boolean().optional().describe("True when maxRounds stopped the loop before the model stopped. Only with procedures"),
    }),
  ])
  .describe("One item of the stream: start, text, tool_use, tool_call, tool_result or stop");

// =============================================================================
// Procedures
// =============================================================================

/**
 * The effects of each procedure: it sends data to a system outside the host and gets an answer.
 * A call costs money and can change the state of an account, so it declares a write. It deletes
 * nothing and a second call is a new call. The procedure tools of `llm.complete` and `llm.stream`
 * are nested calls: the admission of the host examines each one.
 */
const SENDS_TO_MODEL: Effects = Object.freeze({ reads: Object.freeze(["network"]), writes: Object.freeze(["network"]), destructive: false, idempotent: false });

/** The three procedures, with handlers that use the settings. */
function llmProcedures(settings: LlmSettings): AnyProcedure[] {
  const llmCompleteProcedure = createProcedure()
    .path(["llm", "complete"])
    .input(zodAdapter<LlmCompleteInput>(LlmCompleteInputSchema))
    .output(zodAdapter<LlmCompleteOutput>(LlmCompleteOutputSchema))
    .meta({
      description: "Send a prompt to a language model and give the text and the usage. The model can use tools and procedures",
      tags: ["llm", "anthropic", "tools"],
      args: ["prompt"],
      shorts: { model: "m", system: "s" },
      output: "json",
      effects: SENDS_TO_MODEL,
    })
    .handler(async (input: LlmCompleteInput, ctx: ProcedureContext): Promise<LlmCompleteOutput> => llmComplete(input, ctx, settings))
    .build();
  // The input names the procedures that the model can call, so the procedure is data-driven: the
  // host examines each nested call with its capability, and permits only the procedures that it
  // exposes. It is not "runs-refs": the refs of its input still run before the call.
  markDataDriven(llmCompleteProcedure);

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

  const llmStreamProcedure = createProcedure()
    .path(["llm", "stream"])
    .input(zodAdapter<LlmStreamInput>(LlmStreamInputSchema))
    .output(zodAdapter<LlmStreamOutput>(LlmStreamOutputSchema))
    .meta({
      description: "Send a prompt to a language model and stream the events of the answer. The model can use tools and procedures",
      tags: ["llm", "anthropic", "stream", "tools"],
      args: ["prompt"],
      shorts: { model: "m", system: "s" },
      output: "json",
      streaming: true,
      // The stream ends with the answer: maxTokens and timeoutMs limit it (roadmap R15)
      stream: { unbounded: false },
      effects: SENDS_TO_MODEL,
    })
    .handler(((input: LlmStreamInput, ctx: ProcedureContext) => llmStream(input, ctx, settings)) as ProcedureHandler<LlmStreamInput, LlmStreamOutput>)
    .build();
  // The same rule as for llm.complete: the input names the procedures that the model can call
  markDataDriven(llmStreamProcedure);

  return [llmCompleteProcedure, llmStructuredProcedure, llmStreamProcedure];
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
  /** The default number of new tries after a retryable error: 0 to 10. The default is 2. */
  readonly retries?: number | undefined;
  /** The backoff before a new try, in milliseconds. The default starts at 500 and stops at 8000. */
  readonly backoff?: Backoff | undefined;
}

/**
 * This function gives the module of this package with other settings. Without options, it gives
 * `llmModule`. A host gives it to `createRegistry()` before its bundles, so it replaces the
 * `llmModule` of a bundle (the first module of a name counts). A bad option throws here.
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
  const retries = options.retries ?? DEFAULT_LLM_SETTINGS.retries;
  if (!Number.isInteger(retries) || retries < 0 || retries > MAX_REQUEST_RETRIES) {
    throw new TypeError(`createLlmModule: retries must be a whole number from 0 to ${MAX_REQUEST_RETRIES}`);
  }
  const backoff = options.backoff ?? DEFAULT_LLM_SETTINGS.backoff;
  const problems = backoffProblems(backoff);
  if (problems.length > 0) throw new TypeError(`createLlmModule: the backoff is not valid: ${problems.join("; ")}`);
  const env = options.env;
  const settings: LlmSettings = {
    apiKeyEnv,
    env: env === undefined ? DEFAULT_LLM_SETTINGS.env : typeof env === "function" ? env : () => env,
    fetch: options.fetch ?? DEFAULT_LLM_SETTINGS.fetch,
    baseUrl,
    defaultModel: options.defaultModel ?? DEFAULT_LLM_SETTINGS.defaultModel,
    fallback: options.fallback ?? DEFAULT_LLM_SETTINGS.fallback,
    retries,
    backoff,
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
