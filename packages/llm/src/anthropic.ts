/**
 * The Anthropic Messages API over `fetch` (roadmap R46).
 *
 * The procedures send each request with the `fetch` of the module settings, not through
 * `http.request`. The API key goes in a header. The input of a nested call is visible to the
 * interceptors and to the traces of the host. The key comes from an environment variable that the
 * module names. An input cannot give a key.
 *
 * A request stops at the earliest of its time limit, the deadline of its capability and the abort
 * of the caller. A stop is an `InvocationError` with the code `TIMEOUT` or `ABORTED`. A request
 * that fails with a retryable error gets new tries (`retry.ts`).
 */

import type { Backoff } from "@mark1russell7/service/backoff";
import { InvocationError, type ProcedureContext, type ProcedurePath } from "@procedures/client";
import { LlmError } from "./errors.js";
import { DEFAULT_BACKOFF, DEFAULT_REQUEST_RETRIES, deadlineLeft, retryAfterMs, withRetries } from "./retry.js";
import type { LlmEffort, LlmUsage } from "./types.js";

/** The variables that the module reads: a name and a value, or undefined for a variable that is not set. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

/** The `fetch` that the procedures use. A test gives a fake one. */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

/** The default model of the module. */
export const DEFAULT_MODEL = "claude-sonnet-5-5";
/** The default environment variable of the API key. */
export const DEFAULT_API_KEY_ENV = "ANTHROPIC_API_KEY";
/** The default base URL of the API. */
export const DEFAULT_BASE_URL = "https://api.anthropic.com";
/** The default of `maxTokens`. */
export const DEFAULT_MAX_TOKENS = 16_000;
/** The default time limit of a request: 10 minutes. */
export const DEFAULT_TIMEOUT_MS = 600_000;
/** The version header of the Messages API. */
export const ANTHROPIC_VERSION = "2023-06-01";
/** The beta header of the server-side fallback with `fallbacks: "default"`. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** The largest answer that the procedures read, in bytes. */
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

/** What the procedures of a module use. */
export interface LlmSettings {
  readonly apiKeyEnv: string;
  /** This function gives the variables at the time of a call. */
  readonly env: () => EnvSource;
  readonly fetch: FetchFunction;
  readonly baseUrl: string;
  readonly defaultModel: string;
  /** The default of the `fallback` input. */
  readonly fallback: boolean;
  /** The default number of new tries after a retryable error. */
  readonly retries: number;
  /** The backoff before each new try, when the API does not give `retry-after`. */
  readonly backoff: Backoff;
}

/** The settings of the default module. */
export const DEFAULT_LLM_SETTINGS: LlmSettings = Object.freeze({
  apiKeyEnv: DEFAULT_API_KEY_ENV,
  env: () => process.env,
  fetch: (url: string, init: RequestInit) => globalThis.fetch(url, init),
  baseUrl: DEFAULT_BASE_URL,
  defaultModel: DEFAULT_MODEL,
  fallback: true,
  retries: DEFAULT_REQUEST_RETRIES,
  backoff: DEFAULT_BACKOFF,
});

/** One content block of a message. The procedures read the text blocks and the `tool_use` blocks. */
export interface ContentBlock {
  readonly type: string;
  readonly text?: string;
  readonly [key: string]: unknown;
}

/** One message of a request. The content of an assistant turn is the content of the answer, unchanged. */
export interface MessageParam {
  readonly role: "user" | "assistant";
  readonly content: string | readonly ContentBlock[];
}

/** A tool definition as the API gets it. */
export interface ToolParam {
  readonly name: string;
  readonly description?: string;
  readonly input_schema: Record<string, unknown>;
  readonly strict?: boolean;
}

/** The `tool_choice` field as the API gets it. */
export interface ToolChoiceParam {
  readonly type: "auto" | "any" | "tool" | "none";
  readonly name?: string;
  readonly disable_parallel_tool_use?: boolean;
}

/** The request body of the Messages API, as the procedures send it. */
export interface MessagesRequest {
  model: string;
  max_tokens: number;
  messages: MessageParam[];
  system?: string;
  temperature?: number;
  output_config?: { effort?: LlmEffort; format?: { type: "json_schema"; schema: unknown } };
  fallbacks?: "default";
  tools?: ToolParam[];
  tool_choice?: ToolChoiceParam;
  stream?: true;
}

/** The parts of an answer that the procedures use. */
export interface MessagesResponse {
  readonly model: string;
  readonly content: readonly ContentBlock[];
  readonly stopReason: string;
  readonly stopDetails: { readonly category?: string | null; readonly explanation?: string | null } | undefined;
  readonly usage: LlmUsage;
}

/** The time limit and the stop of one procedure call. */
export interface CallLimits {
  readonly path: ProcedurePath;
  readonly ctx: Pick<ProcedureContext, "signal" | "capability"> | undefined;
  readonly timeoutMs: number;
}

/** The API key, or a `NO_API_KEY` error that names the variable. */
export function apiKey(settings: LlmSettings): string {
  const value = settings.env()[settings.apiKeyEnv];
  if (typeof value !== "string" || value.trim() === "") {
    throw new LlmError("NO_API_KEY", `llm: the environment variable ${settings.apiKeyEnv} has no API key`);
  }
  return value.trim();
}

/** The text blocks of an answer, joined. */
export function textOf(content: readonly ContentBlock[]): string {
  return content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("");
}

/** The sum of two usages. */
export function addUsage(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens: a.cacheCreationInputTokens + b.cacheCreationInputTokens,
  };
}

/** A usage of zero tokens. */
export const NO_USAGE: LlmUsage = Object.freeze({ inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 });

const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

/** The four fields of the usage of the API and their names in `LlmUsage`. */
const USAGE_FIELDS = [
  ["input_tokens", "inputTokens"],
  ["output_tokens", "outputTokens"],
  ["cache_read_input_tokens", "cacheReadInputTokens"],
  ["cache_creation_input_tokens", "cacheCreationInputTokens"],
] as const;

/**
 * This function gives the usage of a `usage` object of the API. A field that the object does not
 * have keeps its value of `base`: the usage of a `message_delta` event changes only some fields.
 */
export function usageOf(raw: unknown, base: LlmUsage = NO_USAGE): LlmUsage {
  const record = raw !== null && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const usage = { ...base };
  for (const [from, to] of USAGE_FIELDS) {
    if (typeof record[from] === "number") usage[to] = count(record[from]);
  }
  return usage;
}

/** The answer of the API, checked: an answer of another form is a `BAD_RESPONSE`. */
function parseResponse(text: string): MessagesResponse {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new LlmError("BAD_RESPONSE", `llm: the answer of the API is not JSON: ${text.slice(0, 200)}`);
  }
  const record = body as Record<string, unknown> | null;
  if (record === null || typeof record !== "object" || !Array.isArray(record["content"]) || typeof record["stop_reason"] !== "string") {
    throw new LlmError("BAD_RESPONSE", "llm: the answer of the API is not a message with content and stop_reason");
  }
  const details = record["stop_details"];
  return {
    model: typeof record["model"] === "string" ? record["model"] : "",
    content: (record["content"] as unknown[]).filter((block): block is ContentBlock => block !== null && typeof block === "object" && typeof (block as ContentBlock).type === "string"),
    stopReason: record["stop_reason"],
    stopDetails: details !== null && typeof details === "object" ? (details as MessagesResponse["stopDetails"]) : undefined,
    usage: usageOf(record["usage"]),
  };
}

/** True for a status that the same request can pass later: 408, 409, 429 and 5xx, as in the Anthropic SDKs. */
function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/**
 * The error of an answer with an error status. The message has the type and the message of the
 * API. The header `x-should-retry` of the API overrides the rule of the status.
 */
function apiError(response: Response, text: string, key: string): LlmError {
  const { status } = response;
  let detail = text.slice(0, 500);
  try {
    const error = (JSON.parse(text) as { error?: { type?: unknown; message?: unknown } }).error;
    if (error && typeof error.message === "string") detail = `${typeof error.type === "string" ? `${error.type}: ` : ""}${error.message}`;
  } catch {
    // The text of the answer stays the detail
  }
  // The API does not repeat the key, but the message must not carry it in any case
  const safe = detail.split(key).join("[key]");
  const should = response.headers.get("x-should-retry");
  const retryable = should === "true" ? true : should === "false" ? false : retryableStatus(status);
  return new LlmError("API_ERROR", `llm: the API answered ${status}: ${safe}`, { status, retryable, retryAfterMs: retryAfterMs(response.headers) });
}

/** The body of an answer as text, with a size limit. */
async function readText(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > MAX_RESPONSE_BYTES) throw new LlmError("BAD_RESPONSE", `llm: the answer of the API is larger than ${MAX_RESPONSE_BYTES} bytes`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new LlmError("BAD_RESPONSE", `llm: the answer of the API is larger than ${MAX_RESPONSE_BYTES} bytes`);
  return text;
}

/**
 * The scope of one request: the key, the signal of the `fetch` and the stop. The signal aborts at
 * the time limit, at the deadline and at the abort of the caller.
 */
export interface RequestScope {
  readonly key: string;
  readonly signal: AbortSignal;
  /** The reason of a stop, or undefined while the request runs. */
  readonly stopped: () => "timeout" | "caller" | undefined;
  /** This function gives the error of a stop for an error of the request, or the error unchanged. */
  readonly translate: (error: unknown) => unknown;
  /** This function stops the timer and removes the listener of the abort. */
  readonly close: () => void;
}

/**
 * This function opens the scope of one request. It throws `NO_API_KEY` without a key, `TIMEOUT`
 * when the deadline passed and `ABORTED` when the caller aborted, before a request goes out.
 */
export function openScope(settings: LlmSettings, limits: CallLimits): RequestScope {
  const key = apiKey(settings);
  const { path, ctx } = limits;
  const left = deadlineLeft(ctx);
  if (left !== undefined && left <= 0) throw new InvocationError("TIMEOUT", `The deadline of ${path.join(".")} passed before the call`, path);
  const timeoutMs = left === undefined ? limits.timeoutMs : Math.min(limits.timeoutMs, left);
  if (ctx?.signal?.aborted) throw new InvocationError("ABORTED", `Procedure was aborted: ${path.join(".")}`, path);

  const controller = new AbortController();
  let stop: "timeout" | "caller" | undefined;
  const timer = setTimeout(() => {
    stop ??= "timeout";
    controller.abort();
  }, timeoutMs);
  const onAbort = (): void => {
    stop ??= "caller";
    controller.abort();
  };
  ctx?.signal?.addEventListener("abort", onAbort, { once: true });
  return {
    key,
    signal: controller.signal,
    stopped: () => stop,
    translate: (error) => {
      if (stop === "timeout") return new InvocationError("TIMEOUT", `${path.join(".")} passed its time limit of ${timeoutMs} ms`, path);
      if (stop === "caller") return new InvocationError("ABORTED", `Procedure was aborted: ${path.join(".")}`, path);
      return error;
    },
    close: () => {
      clearTimeout(timer);
      ctx?.signal?.removeEventListener("abort", onAbort);
    },
  };
}

/** The message of an error, without the key. */
export function safeMessage(error: unknown, key: string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(key).join("[key]");
}

/**
 * This function sends a request to the Messages API in a scope, and gives the answer with a
 * status from 200 to 299. It throws `CONNECTION` for a failed connection and `API_ERROR` for an
 * error status.
 */
export async function postMessages(request: MessagesRequest, settings: LlmSettings, scope: RequestScope): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": scope.key,
    "anthropic-version": ANTHROPIC_VERSION,
  };
  if (request.fallbacks !== undefined) headers["anthropic-beta"] = FALLBACK_BETA;
  let response: Response;
  try {
    response = await settings.fetch(`${settings.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
      signal: scope.signal,
    });
  } catch (error) {
    if (scope.stopped() === undefined) {
      throw new LlmError("CONNECTION", `llm: the connection to the API failed: ${safeMessage(error, scope.key)}`, { retryable: true });
    }
    throw error;
  }
  if (!response.ok) throw apiError(response, await readText(response), scope.key);
  return response;
}

/**
 * This function sends one request to the Messages API and gives the checked answer. It throws a
 * `REFUSAL` error when a safety classifier declined the request.
 */
export async function sendMessages(request: MessagesRequest, settings: LlmSettings, limits: CallLimits): Promise<MessagesResponse> {
  const scope = openScope(settings, limits);
  try {
    const response = await postMessages(request, settings, scope);
    const answer = parseResponse(await readText(response));
    if (answer.stopReason === "refusal") {
      const category = answer.stopDetails?.category ?? "not given";
      throw new LlmError("REFUSAL", `llm: a safety classifier declined the request (category: ${category})`);
    }
    return answer;
  } catch (error) {
    throw scope.translate(error);
  } finally {
    scope.close();
  }
}

/**
 * This function sends a request with `sendMessages`, and sends it again after a retryable
 * error, at most `retries` more times.
 */
export function sendWithRetries(request: MessagesRequest, settings: LlmSettings, limits: CallLimits, retries: number): Promise<MessagesResponse> {
  return withRetries(() => sendMessages(request, settings, limits), { backoff: settings.backoff, retries }, limits);
}
