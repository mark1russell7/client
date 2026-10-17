/**
 * Procedures as tools of the model (`llm.complete` with `procedures`).
 *
 * The caller names the procedures. `llm.complete` gives the model a tool for each one. The name
 * is the key with `_` in place of each `.`. The description and the input schema come from the
 * procedure. When the model asks for a tool, `llm.complete` calls the procedure through
 * `ctx.client` with the input of the model. The output goes back as a `tool_result`.
 *
 * The procedure `llm.complete` is data-driven (`markDataDriven`): its input chooses its callees.
 * Thus the admission of the host examines each nested call: its capability and its expose rule.
 * Before the first request, the same rules examine each named procedure, so a refused tool costs
 * no request.
 */

import {
  capabilityRefusal,
  InvocationError,
  jsonSchemaOf,
  PROCEDURE_REGISTRY,
  type AnyProcedure,
  type ProcedureContext,
  type ProcedurePath,
} from "@procedures/client";
import type { ContentBlock, ToolParam } from "./anthropic.js";
import { LlmError } from "./errors.js";
import { deadlineLeft } from "./retry.js";
import type { LlmToolCall, LlmToolUse } from "./types.js";

/** The context that procedure tools need: the nested client, the registry and the rules of the host. */
export type ToolContext = Pick<ProcedureContext, "signal" | "capability"> & Partial<Pick<ProcedureContext, "client" | "registry" | "expose">>;

/** A procedure that the model can use as a tool. */
export interface ProcedureTool {
  /** The key of the procedure, for example `weather.current`. */
  readonly key: string;
  readonly path: ProcedurePath;
  /** The definition of the tool, as the API gets it. */
  readonly param: ToolParam;
}

/** The default of `maxRounds`: the most requests to the model in one call of `llm.complete`. */
export const DEFAULT_MAX_ROUNDS = 8;
/** The most characters of the output of a tool that the model gets. */
export const MAX_TOOL_RESULT_CHARS = 200_000;
/** The names that the API accepts for a tool. */
const TOOL_NAME = /^[a-zA-Z0-9_-]{1,128}$/;

/** The reasons of a refusal of the capability. Such a refusal stops the call: the model cannot change it. */
const CAPABILITY_REASONS: ReadonlySet<string> = new Set(["effects-undeclared", "effects-exceeded", "clearance", "deadline"]);
/** The codes of a refusal of the host. Such a refusal stops the call. */
const HOST_REFUSALS: ReadonlySet<string> = new Set(["NOT_EXPOSED", "NOT_DECLARED", "NOT_FOUND", "NO_HANDLER"]);

/** The name of the tool of a procedure: the key with `_` in place of each `.`. */
export function toolNameOf(key: string): string {
  return key.split(".").join("_");
}

/** The input schema of a procedure as a tool: an object schema, or a `BAD_TOOL` error. */
function inputSchemaOf(procedure: AnyProcedure, key: string): Record<string, unknown> {
  const schema = jsonSchemaOf(procedure.input);
  if (schema === undefined || Object.keys(schema).length === 0) return { type: "object" };
  if (schema["type"] === "object") return schema;
  throw new LlmError("BAD_TOOL", `llm: the input of ${key} is not an object, so the model cannot use it as a tool`);
}

/**
 * This function gives the tools of the procedures that the input names. It throws before a
 * request goes out. It throws for a refusal of the expose rule or of the capability. It also
 * throws for a procedure that is not in the registry, and for a stream without an end.
 */
export function procedureTools(keys: readonly string[], ctx: ToolContext | undefined, caller: ProcedurePath): ProcedureTool[] {
  if (keys.length === 0) return [];
  if (ctx?.client === undefined) throw new LlmError("BAD_TOOL", `${caller.join(".")}: procedure tools need the context of a procedure call`);
  const registry = ctx.registry ?? PROCEDURE_REGISTRY;
  const seen = new Set<string>();
  return keys.map((key): ProcedureTool => {
    if (seen.has(key)) throw new LlmError("BAD_TOOL", `llm: the input names the procedure ${key} two times`);
    seen.add(key);
    const path = key.split(".");
    // The expose rule first: a refused path tells nothing about the procedure
    if (ctx.expose !== undefined && !ctx.expose(path)) {
      throw new InvocationError(
        "NOT_EXPOSED",
        `Procedure not exposed: ${key}. ${caller.join(".")} runs the procedures that its input names, so it can call only the procedures that this host exposes.`,
        path,
      );
    }
    const procedure = registry.get(path);
    if (procedure === undefined) throw new InvocationError("NOT_FOUND", `No procedure at ${key}`, path);
    if (procedure.handler === undefined) throw new InvocationError("NO_HANDLER", `The procedure ${key} has no handler`, path);
    const refusal = capabilityRefusal(procedure, ctx.capability);
    if (refusal?.reason === "deadline") throw new InvocationError("TIMEOUT", refusal.message, path);
    if (refusal) throw new InvocationError("FORBIDDEN", `${refusal.message}, so the model cannot use it as a tool`, path, refusal.reason);
    if ((procedure.metadata as { stream?: { unbounded?: unknown } } | undefined)?.stream?.unbounded === true) {
      throw new LlmError("BAD_TOOL", `llm: ${key} is a stream without an end, so the model cannot use it as a tool`);
    }
    const name = toolNameOf(key);
    if (!TOOL_NAME.test(name)) throw new LlmError("BAD_TOOL", `llm: the tool name ${name} of ${key} has characters that the API refuses`);
    const description = (procedure.metadata as { description?: unknown } | undefined)?.description;
    return {
      key,
      path,
      param: {
        name,
        description: typeof description === "string" && description !== "" ? description : `The procedure ${key}`,
        input_schema: inputSchemaOf(procedure, key),
      },
    };
  });
}

/** The `tool_use` blocks of the content of an answer. */
export function toolUsesOf(content: readonly ContentBlock[]): LlmToolUse[] {
  const uses: LlmToolUse[] = [];
  for (const block of content) {
    if (block.type === "tool_use" && typeof block["id"] === "string" && typeof block["name"] === "string") {
      uses.push({ id: block["id"], name: block["name"], input: block["input"] ?? {} });
    }
  }
  return uses;
}

/**
 * This function is true when an error of a nested call stops the whole call. The causes are a
 * refusal of the host, the abort of the caller and the deadline. The model gets each other error.
 */
function stopsTheCall(error: unknown, ctx: ToolContext): boolean {
  if (!(error instanceof InvocationError)) return false;
  if (HOST_REFUSALS.has(error.code)) return true;
  if (error.code === "FORBIDDEN") return error.reason !== undefined && CAPABILITY_REASONS.has(error.reason);
  if (error.code === "ABORTED") return ctx.signal?.aborted === true;
  if (error.code === "TIMEOUT") {
    const left = deadlineLeft(ctx);
    return left !== undefined && left <= 0;
  }
  return false;
}

/** The output of a tool as the text of its `tool_result`, at most `MAX_TOOL_RESULT_CHARS` characters. */
function resultText(output: unknown): string {
  let text: string;
  if (typeof output === "string") {
    text = output;
  } else {
    try {
      text = JSON.stringify(output) ?? "null";
    } catch {
      text = String(output);
    }
  }
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n[llm: the output has ${text.length} characters, and this result has the first ${MAX_TOOL_RESULT_CHARS}]`;
}

/**
 * This function runs one `tool_use` block with the procedure of its tool, through `ctx.client`.
 * It gives the record of the call and the `tool_result` block. An error of the procedure goes to
 * the model with `is_error: true`. A refusal of the host, the abort and the deadline stop the call.
 */
export async function runToolUse(use: LlmToolUse, tool: ProcedureTool, ctx: ToolContext): Promise<{ call: LlmToolCall; result: ContentBlock }> {
  const base = { id: use.id, name: use.name, procedure: tool.key, input: use.input };
  try {
    const output = await ctx.client!.call(tool.path, use.input);
    return {
      call: { ...base, isError: false, output },
      result: { type: "tool_result", tool_use_id: use.id, content: resultText(output) },
    };
  } catch (error) {
    if (stopsTheCall(error, ctx)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: unknown } | null)?.code;
    const content = typeof code === "string" ? `${code}: ${message}` : message;
    return {
      call: { ...base, isError: true, error: content },
      result: { type: "tool_result", tool_use_id: use.id, content: resultText(content), is_error: true },
    };
  }
}
