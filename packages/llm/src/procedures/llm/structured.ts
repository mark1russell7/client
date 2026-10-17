/**
 * llm.structured procedure
 *
 * Send a prompt and a JSON Schema to a language model and give a value that the schema accepts.
 * An answer that is not JSON, or that the schema refuses, gets a new try. The next request has
 * the answer (its content, unchanged) and a user turn with the problems. At most 2 new tries.
 */

import { validateJson, type JsonValue } from "@procedures/json";
import { LlmError } from "../../errors.js";
import { addUsage, DEFAULT_LLM_SETTINGS, NO_USAGE, sendWithRetries, textOf, type CallLimits, type LlmSettings, type MessagesRequest } from "../../anthropic.js";
import { baseRequest, retriesOf, timeoutOf } from "../../request.js";
import { constrainedSchema, parseAnswer } from "../../schema.js";
import type { LlmStructuredInput, LlmStructuredOutput, LlmUsage } from "../../types.js";

const PATH = ["llm", "structured"];

/** The most new tries after an answer that is not valid. */
export const MAX_RETRIES = 2;

/** The instruction of the system text: one JSON value and nothing else. */
function instruction(input: LlmStructuredInput, constrained: boolean): string {
  const lines = ["Answer with one JSON value that the JSON Schema below accepts. Give only the JSON value, with no other text and no code fence."];
  if (!constrained) lines.push("", "JSON Schema:", JSON.stringify(input.schema));
  return lines.join("\n");
}

/** The problems of a value against the schema, as one text, or undefined for a valid value. */
function problemsOf(value: unknown, schema: Record<string, unknown>): { problems: string | undefined; unchecked: string[] } {
  const result = validateJson(value as JsonValue, schema);
  if (result.valid) return { problems: undefined, unchecked: [...result.unchecked] };
  const problems = result.errors
    .slice(0, 20)
    .map((issue) => `${issue.pointer === "" ? "(root)" : issue.pointer}: ${issue.message}`)
    .join("; ");
  return { problems, unchecked: [...result.unchecked] };
}

/**
 * Send a prompt and a JSON Schema to a language model and give a value that the schema accepts
 */
export async function llmStructured(input: LlmStructuredInput, ctx?: CallLimits["ctx"], settings: LlmSettings = DEFAULT_LLM_SETTINGS): Promise<LlmStructuredOutput> {
  const constrained = input.constrained ?? true;
  const retries = Math.min(Math.max(input.retries ?? MAX_RETRIES, 0), MAX_RETRIES);
  const requestRetries = retriesOf(input.requestRetries, settings);
  const system = [input.system, instruction(input, constrained)].filter((part) => part !== undefined && part !== "").join("\n\n");
  const request: MessagesRequest = baseRequest(input, settings, system);
  if (constrained) {
    request.output_config = { ...request.output_config, format: { type: "json_schema", schema: constrainedSchema(input.schema) } };
  }

  let usage: LlmUsage = NO_USAGE;
  let lastProblem = "";
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    // A retryable error of the API gets new tries here: they do not count as attempts
    const answer = await sendWithRetries(request, settings, { path: PATH, ctx, timeoutMs: timeoutOf(input) }, requestRetries);
    usage = addUsage(usage, answer.usage);
    if (answer.stopReason === "max_tokens") {
      throw new LlmError("MAX_TOKENS", `llm.structured: the answer stopped at maxTokens (${request.max_tokens}), so the JSON is not complete`);
    }
    const parsed = parseAnswer(textOf(answer.content));
    let problem: string;
    if (parsed.ok) {
      const { problems, unchecked } = problemsOf(parsed.value, input.schema);
      if (problems === undefined) {
        return { value: parsed.value, model: answer.model || request.model, attempts: attempt, usage, unchecked };
      }
      problem = `the schema refuses the value: ${problems}`;
    } else {
      problem = parsed.problem;
    }
    lastProblem = problem;
    // The next request continues the conversation: the answer as it came, then the problems
    request.messages = [
      ...request.messages,
      { role: "assistant", content: answer.content },
      { role: "user", content: `That answer is not valid: ${problem}. Answer again with only the JSON value.` },
    ];
  }
  throw new LlmError("INVALID_OUTPUT", `llm.structured: no answer of ${retries + 1} gave a valid value. The last problem: ${lastProblem}`);
}
