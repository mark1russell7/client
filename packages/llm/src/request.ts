/**
 * The request of the fields that both procedures take (`LlmRequestInput`).
 */

import { DEFAULT_MAX_TOKENS, DEFAULT_TIMEOUT_MS, type LlmSettings, type MessagesRequest } from "./anthropic.js";
import type { LlmRequestInput } from "./types.js";

/** This function gives the body of a request: the model, the limits, the system text and the user text. */
export function baseRequest(input: LlmRequestInput, settings: LlmSettings, system: string | undefined): MessagesRequest {
  const request: MessagesRequest = {
    model: input.model ?? settings.defaultModel,
    max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: [{ role: "user", content: input.prompt }],
  };
  if (system !== undefined && system !== "") request.system = system;
  if (input.temperature !== undefined) request.temperature = input.temperature;
  if (input.effort !== undefined) request.output_config = { effort: input.effort };
  if (input.fallback ?? settings.fallback) request.fallbacks = "default";
  return request;
}

/** The time limit of a call. */
export function timeoutOf(input: LlmRequestInput): number {
  return input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}
