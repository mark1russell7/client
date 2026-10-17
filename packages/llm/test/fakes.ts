/**
 * The fakes of the llm tests: a fake fetch that records each request and gives recorded answers
 * of the Messages API, as JSON or as server-sent events. No test reaches the network. The fake
 * procedures are the procedure tools of the tests.
 */

import { z } from "zod";
import {
  createProcedure,
  createRegistry,
  defineModule,
  invokePath,
  outputItems,
  outputValue,
  zodAdapter,
  type AnyProcedure,
  type Capability,
  type Effects,
  type Interceptor,
  type ProcedureContext,
  type ProcedureModule,
} from "@procedures/client";
import { createLlmModule, type LlmModuleOptions } from "../src/module.js";
import { MAX_TOOL_RESULT_CHARS } from "../src/tools.js";

export const KEY = "sk-ant-test-key";

/** A request that the fake fetch got. */
export interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  signal: AbortSignal | null | undefined;
}

/** An answer of the fake fetch: a JSON body, a Response, a function of the request, or an Error that the fetch throws. */
export type FakeAnswer = unknown | Response | Error | ((init: RequestInit) => Promise<Response>);

/** An answer of the Messages API. */
export function message(content: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content,
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 },
    ...extra,
  };
}

export const text = (value: string): Record<string, unknown> => ({ type: "text", text: value });

export const toolUse = (id: string, name: string, input: unknown): Record<string, unknown> => ({ type: "tool_use", id, name, input });

/** A JSON error answer of the API with a status and headers. */
export function apiError(status: number, type: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: "error", error: { type, message: `${type} message` }, request_id: "req_1" }), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** The text of an event stream: each event as `event:` and `data:` lines and a blank line. */
export function sseBody(events: ReadonlyArray<readonly [string, unknown]>): string {
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

/** The text in chunks of `size` characters, so an event arrives in parts. */
export function chunked(body: string, size: number): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < body.length; start += size) chunks.push(body.slice(start, start + size));
  return chunks;
}

/**
 * An answer with an event stream. With `hang`, the body sends its chunks and then waits until the
 * signal of the request aborts, as the body of a real fetch does.
 */
export function streamResponse(chunks: readonly string[], options: { hang?: boolean; signal?: AbortSignal | null | undefined } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      if (!options.hang) {
        controller.close();
        return;
      }
      const fail = (): void => controller.error(new DOMException("This operation was aborted", "AbortError"));
      if (options.signal?.aborted) fail();
      else options.signal?.addEventListener("abort", fail, { once: true });
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

/** The events of a recorded text stream: "Hello, world", then the stop reason end_turn. */
export function textStreamEvents(model = "claude-sonnet-5-5"): Array<readonly [string, unknown]> {
  return [
    ["message_start", { type: "message_start", message: { id: "msg_s1", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 25, output_tokens: 1, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["ping", { type: "ping" }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: ", world" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 12 } }],
    ["message_stop", { type: "message_stop" }],
  ];
}

/** A fake fetch that records each request and gives the next answer. Without answers, it gives a message "ok". */
export function fakeFetch(answers: FakeAnswer[]): { fetch: (url: string, init: RequestInit) => Promise<Response>; sent: Sent[] } {
  const sent: Sent[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown>, signal: init.signal });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    if (typeof next === "function") return (next as (init: RequestInit) => Promise<Response>)(init);
    if (next instanceof Response) return next;
    return new Response(JSON.stringify(next ?? message([text("ok")])), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, sent };
}

/** The options of one call of a test. */
export interface CallOptions {
  signal?: AbortSignal;
  capability?: Capability;
  expose?: (path: readonly string[]) => boolean;
  interceptors?: Interceptor[];
}

/**
 * A registry with the llm module (a fake fetch, the key in its env, a backoff of 1 ms) and the
 * other modules of a test. `call` gives the output of a call, `items` gives each item of a stream.
 */
export function setup(answers: FakeAnswer[] = [], options: LlmModuleOptions = {}, modules: ProcedureModule[] = []) {
  const fake = fakeFetch(answers);
  const registry = createRegistry(createLlmModule({ env: { ANTHROPIC_API_KEY: KEY }, fetch: fake.fetch, backoff: { base: 1, cap: 2 }, ...options }), ...modules);
  const invoke = <T>(key: string, input: unknown, extra: CallOptions) => invokePath<T>(key.split("."), input, { registry, ...extra });
  const call = async <T>(key: string, input: unknown, extra: CallOptions = {}): Promise<T> => outputValue(await invoke<T>(key, input, extra), key.split("."));
  const items = async <T>(key: string, input: unknown, extra: CallOptions = {}): Promise<T[]> => {
    const all: T[] = [];
    for await (const item of outputItems(await invoke<T>(key, input, extra))) all.push(item);
    return all;
  };
  return { ...fake, registry, call, items, invoke };
}

/** A fetch answer that waits until the request is aborted. */
export const hang = (init: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

export const READS_WEATHER: Effects = { reads: ["weather"], writes: [], destructive: false, idempotent: true };
export const WRITES_FS: Effects = { reads: ["fs"], writes: ["fs"], destructive: true };

/** A fake procedure of a test: its path, its input schema, its effects and its handler. */
export function procedure(
  path: string[],
  handler: (input: never, ctx: ProcedureContext) => Promise<unknown>,
  options: { input?: z.ZodType; effects?: Effects; description?: string; meta?: Record<string, unknown> } = {},
): AnyProcedure {
  return createProcedure()
    .path(path)
    .input(zodAdapter(options.input ?? z.object({ city: z.string().describe("The city") })))
    .output(zodAdapter(z.unknown()))
    .meta({ ...(options.description !== undefined ? { description: options.description } : {}), effects: options.effects ?? READS_WEATHER, ...options.meta })
    .handler(handler as never)
    .build() as AnyProcedure;
}

/** The fake procedure tools of the tests, and the inputs that they got. */
export function toolProcedures() {
  const got: unknown[] = [];
  const weather = procedure(
    ["weather", "current"],
    async (input: { city: string }) => {
      got.push(input);
      return { city: input.city, celsius: 21 };
    },
    { description: "The current weather of a city" },
  );
  const notes = procedure(
    ["notes", "write"],
    async (input) => {
      got.push(input);
      return "written";
    },
    { effects: WRITES_FS },
  );
  const failing = procedure(["weather", "fail"], async () => {
    throw new Error("the weather service is down");
  });
  const anything = procedure(["any", "value"], async () => "x".repeat(MAX_TOOL_RESULT_CHARS + 5), { input: z.any() });
  const number = procedure(["any", "number"], async () => 1, { input: z.number() });
  const endless = procedure(["any", "follow"], async () => 1, { meta: { stream: { unbounded: true } } });
  const long = procedure(["long", "n".repeat(130)], async () => 1);
  const module = defineModule("test-tools", [weather, notes, failing, anything, number, endless, long]);
  return { got, module };
}
