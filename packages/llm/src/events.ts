/**
 * The streaming Messages API (`"stream": true`): the server-sent events of an answer as stream items.
 *
 * `sseEvents` of `@procedures/http` parses the event stream. The first event of the API is
 * `message_start`. Then each content block comes (`content_block_start`, its
 * `content_block_delta` events, `content_block_stop`), then one or more `message_delta` events, and
 * at the end `message_stop`. A `ping` event can come at each time, and an `error` event stops the
 * stream. The usage of a `message_delta` event is cumulative. Other event types are ignored, as
 * the versioning policy of the API asks.
 *
 * A stream gets a new try only before its first item. After the first item, an error goes to the
 * caller.
 */

import { HttpError, sseEvents, type ServerSentEvent } from "@procedures/http";
import { InvocationError } from "@procedures/client";
import { openScope, postMessages, safeMessage, usageOf, NO_USAGE, type CallLimits, type LlmSettings, type MessagesRequest } from "./anthropic.js";
import { LlmError } from "./errors.js";
import { waitToRetry } from "./retry.js";
import type { LlmStreamOutput, LlmToolUse, LlmUsage } from "./types.js";

/** The largest event of a stream, in bytes. */
const MAX_EVENT_BYTES = 8 * 1024 * 1024;

/** The error types of an `error` event that the same request can pass later. */
const RETRYABLE_ERROR_TYPES: ReadonlySet<string> = new Set(["overloaded_error", "api_error", "rate_limit_error", "timeout_error"]);

/** The chunks of a body. A stop of the reader cancels the body. */
async function* chunksOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array, void, undefined> {
  const reader = body.getReader();
  let done = false;
  try {
    for (;;) {
      const step = await reader.read();
      if (step.done) {
        done = true;
        return;
      }
      yield step.value;
    }
  } finally {
    if (!done) reader.cancel().catch(() => undefined);
  }
}

/** The data of an event as an object, or a `BAD_RESPONSE` error. */
function eventData(event: ServerSentEvent): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(event.data);
  } catch {
    throw new LlmError("BAD_RESPONSE", `llm: the data of the event ${event.event} is not JSON: ${event.data.slice(0, 200)}`);
  }
  if (data === null || typeof data !== "object") throw new LlmError("BAD_RESPONSE", `llm: the data of the event ${event.event} is not an object`);
  return data as Record<string, unknown>;
}

const recordOf = (value: unknown): Record<string, unknown> => (value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {});
const stringOf = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

/** The error of an `error` event. An overload, a rate limit or a server error is retryable. */
function streamError(data: Record<string, unknown>): LlmError {
  const error = recordOf(data["error"]);
  const type = stringOf(error["type"]) ?? "error";
  const message = stringOf(error["message"]) ?? "no message";
  return new LlmError("API_ERROR", `llm: the API sent an error event: ${type}: ${message}`, { retryable: RETRYABLE_ERROR_TYPES.has(type) });
}

/** One content block of a stream while its deltas come. */
interface OpenBlock {
  readonly type: string;
  readonly id: string;
  readonly name: string;
  json: string;
}

/** The state of one stream: it turns each event into the items of the procedure. */
class StreamState {
  private model: string;
  private id = "";
  private usage: LlmUsage = NO_USAGE;
  private stopReason: string | undefined;
  private category: string | undefined;
  private text = "";
  private readonly blocks = new Map<number, OpenBlock>();
  private readonly toolUses: LlmToolUse[] = [];
  /** True after the event `message_stop`. */
  stopped = false;

  constructor(model: string) {
    this.model = model;
  }

  /** The items of one event. The event `error` and a refusal at the end throw. */
  apply(event: ServerSentEvent): LlmStreamOutput[] {
    if (event.event === "ping") return [];
    const data = eventData(event);
    const index = typeof data["index"] === "number" ? data["index"] : -1;
    switch (stringOf(data["type"]) ?? event.event) {
      case "message_start": {
        const message = recordOf(data["message"]);
        this.id = stringOf(message["id"]) ?? "";
        this.model = stringOf(message["model"]) || this.model;
        this.usage = usageOf(message["usage"]);
        return [{ type: "start", id: this.id, model: this.model, usage: this.usage }];
      }
      case "content_block_start": {
        const block = recordOf(data["content_block"]);
        const type = stringOf(block["type"]) ?? "";
        // A server-side fallback puts a fallback block at the change of the model
        const to = stringOf(recordOf(block["to"])["model"]);
        if (type === "fallback" && to) this.model = to;
        this.blocks.set(index, { type, id: stringOf(block["id"]) ?? "", name: stringOf(block["name"]) ?? "", json: "" });
        const text = stringOf(block["text"]);
        if (type === "text" && text) {
          this.text += text;
          return [{ type: "text", index, text }];
        }
        return [];
      }
      case "content_block_delta": {
        const delta = recordOf(data["delta"]);
        const deltaType = stringOf(delta["type"]);
        if (deltaType === "text_delta") {
          const text = stringOf(delta["text"]) ?? "";
          this.text += text;
          return text === "" ? [] : [{ type: "text", index, text }];
        }
        if (deltaType === "input_json_delta") {
          const block = this.blocks.get(index);
          if (block) block.json += stringOf(delta["partial_json"]) ?? "";
        }
        return [];
      }
      case "content_block_stop": {
        const block = this.blocks.get(index);
        this.blocks.delete(index);
        if (block?.type !== "tool_use") return [];
        let input: unknown = {};
        let partialJson: string | undefined;
        if (block.json.trim() !== "") {
          try {
            input = JSON.parse(block.json);
          } catch {
            input = null;
            partialJson = block.json;
          }
        }
        this.toolUses.push({ id: block.id, name: block.name, input });
        return [{ type: "tool_use", index, id: block.id, name: block.name, input, ...(partialJson !== undefined ? { partialJson } : {}) }];
      }
      case "message_delta": {
        const delta = recordOf(data["delta"]);
        this.stopReason = stringOf(delta["stop_reason"]) ?? this.stopReason;
        this.category = stringOf(recordOf(delta["stop_details"] ?? data["stop_details"])["category"]) ?? this.category;
        this.usage = usageOf(data["usage"], this.usage);
        return [];
      }
      case "message_stop": {
        if (this.stopReason === undefined) throw new LlmError("BAD_RESPONSE", "llm: the stream stopped without a stop reason");
        if (this.stopReason === "refusal") {
          throw new LlmError("REFUSAL", `llm: a safety classifier declined the request (category: ${this.category ?? "not given"})`);
        }
        this.stopped = true;
        return [{ type: "stop", model: this.model, stopReason: this.stopReason, usage: this.usage, text: this.text, toolUses: [...this.toolUses] }];
      }
      case "error":
        throw streamError(data);
      default:
        return [];
    }
  }
}

/** The items of one try of a stream, in one request scope. */
async function* streamOnce(request: MessagesRequest, settings: LlmSettings, limits: CallLimits): AsyncGenerator<LlmStreamOutput, void, undefined> {
  const scope = openScope(settings, limits);
  try {
    const response = await postMessages(request, settings, scope);
    if (response.body === null) throw new LlmError("BAD_RESPONSE", "llm: the answer of the API has no body");
    const state = new StreamState(request.model);
    try {
      for await (const event of sseEvents(chunksOf(response.body), MAX_EVENT_BYTES, limits.path.join("."))) {
        for (const item of state.apply(event)) yield item;
        if (state.stopped) return;
      }
    } catch (error) {
      if (error instanceof LlmError || error instanceof InvocationError || scope.stopped() !== undefined) throw error;
      if (error instanceof HttpError) throw new LlmError("BAD_RESPONSE", `llm: ${error.message}`);
      throw new LlmError("CONNECTION", `llm: the stream of the API failed: ${safeMessage(error, scope.key)}`, { retryable: true });
    }
    throw new LlmError("CONNECTION", "llm: the stream of the API ended before the event message_stop", { retryable: true });
  } catch (error) {
    throw scope.translate(error);
  } finally {
    scope.close();
  }
}

/**
 * This function sends a request with `"stream": true` and gives each item of the answer. Before
 * the first item, a retryable error gets a new try, at most `retries` times.
 */
export async function* streamMessages(request: MessagesRequest, settings: LlmSettings, limits: CallLimits, retries: number): AsyncGenerator<LlmStreamOutput, void, undefined> {
  const body: MessagesRequest = { ...request, stream: true };
  for (let retry = 1; ; retry++) {
    let started = false;
    try {
      for await (const item of streamOnce(body, settings, limits)) {
        started = true;
        yield item;
      }
      return;
    } catch (error) {
      if (started || !(await waitToRetry(error, retry, { backoff: settings.backoff, retries }, limits))) throw error;
    }
  }
}
