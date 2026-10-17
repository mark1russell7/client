/**
 * llm.stream with a fake fetch that sends recorded event streams of the Messages API: the text
 * deltas, the start and the stop, a tool_use block, the errors, the time limit and the abort.
 */

import { describe, expect, it } from "vitest";
import { InvocationError, outputItems } from "@procedures/client";
import { LlmError } from "./errors.js";
import { llmStream } from "./procedures/llm/stream.js";
import type { LlmStreamOutput, LlmStreamStop } from "./types.js";
import { apiError, chunked, hang, setup, sseBody, streamResponse, textStreamEvents } from "../test/fakes.js";

const USAGE_AT_START = { inputTokens: 25, outputTokens: 1, cacheReadInputTokens: 4, cacheCreationInputTokens: 0 };
const USAGE_AT_STOP = { inputTokens: 25, outputTokens: 12, cacheReadInputTokens: 4, cacheCreationInputTokens: 0 };

/** The recorded stream of a tool use: a text block, then a tool_use block with its input in parts. */
function toolStreamEvents(): Array<readonly [string, unknown]> {
  return [
    ["message_start", { type: "message_start", message: { id: "msg_t1", type: "message", role: "assistant", model: "claude-opus-5", content: [], stop_reason: null, usage: { input_tokens: 472, output_tokens: 2 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Okay, let's check:" } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_01", name: "get_weather", input: {} } }],
    ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"location":' } }],
    ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: ' "San Francisco, CA"}' } }],
    ["content_block_stop", { type: "content_block_stop", index: 1 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 89 } }],
    ["message_stop", { type: "message_stop" }],
  ];
}

const stream = (events: Array<readonly [string, unknown]>, size = 7) => streamResponse(chunked(sseBody(events), size));

describe("llm.stream", () => {
  it("gives the start, the text deltas and the stop of a recorded stream, in chunks of 7 characters", async () => {
    const { items, sent } = setup([stream(textStreamEvents())]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "Say hello", maxTokens: 100 });
    expect(result).toEqual([
      { type: "start", id: "msg_s1", model: "claude-sonnet-5-5", usage: USAGE_AT_START },
      { type: "text", index: 0, text: "Hello" },
      { type: "text", index: 0, text: ", world" },
      { type: "stop", model: "claude-sonnet-5-5", stopReason: "end_turn", usage: USAGE_AT_STOP, text: "Hello, world", toolUses: [] },
    ]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 100,
      messages: [{ role: "user", content: "Say hello" }],
      fallbacks: "default",
      stream: true,
    });
  });

  it("gives the stop item, with the full text, as the result of a call", async () => {
    const { call } = setup([stream(textStreamEvents(), 3)]);
    const stop = await call<LlmStreamStop>("llm.stream", { prompt: "Say hello" });
    expect(stop).toMatchObject({ type: "stop", text: "Hello, world", stopReason: "end_turn" });
  });

  it("sends the tools and the tool_choice, and gives each complete tool_use block", async () => {
    const { items, sent } = setup([stream(toolStreamEvents())]);
    const tools = [{ name: "get_weather", description: "The weather of a city", inputSchema: { type: "object", properties: { location: { type: "string" } }, required: ["location"] }, strict: true }];
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "Weather in SF?", tools, toolChoice: { type: "auto", disableParallelToolUse: true } });
    expect(sent[0]!.body["tools"]).toEqual([{ name: "get_weather", description: "The weather of a city", input_schema: tools[0]!.inputSchema, strict: true }]);
    expect(sent[0]!.body["tool_choice"]).toEqual({ type: "auto", disable_parallel_tool_use: true });
    const input = { location: "San Francisco, CA" };
    expect(result.filter((item) => item.type === "tool_use")).toEqual([{ type: "tool_use", index: 1, id: "toolu_01", name: "get_weather", input }]);
    expect(result.at(-1)).toEqual({
      type: "stop",
      model: "claude-opus-5",
      stopReason: "tool_use",
      usage: { inputTokens: 472, outputTokens: 89, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      text: "Okay, let's check:",
      toolUses: [{ id: "toolu_01", name: "get_weather", input }],
    });
  });

  it("gives the JSON text of a tool input that stopped at max_tokens", async () => {
    const events = toolStreamEvents().filter(([, data]) => (data as { delta?: { partial_json?: string } }).delta?.partial_json !== ' "San Francisco, CA"}');
    const end = events.findIndex(([name]) => name === "message_delta");
    events[end] = ["message_delta", { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 30 } }];
    const { items } = setup([stream(events)]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x" });
    expect(result.find((item) => item.type === "tool_use")).toEqual({ type: "tool_use", index: 1, id: "toolu_01", name: "get_weather", input: null, partialJson: '{"location":' });
    expect(result.at(-1)).toMatchObject({ stopReason: "max_tokens", toolUses: [{ id: "toolu_01", input: null }] });
  });

  it("follows the model of a fallback block, and ignores the events and deltas that it does not know", async () => {
    const events = textStreamEvents();
    events.splice(1, 0,
      ["content_block_start", { type: "content_block_start", index: 9, content_block: { type: "fallback", from: { model: "claude-sonnet-5-5" }, to: { model: "claude-sonnet-5" } } }],
      ["content_block_stop", { type: "content_block_stop", index: 9 }],
      ["content_block_start", { type: "content_block_start", index: 8, content_block: { type: "thinking", thinking: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 8, delta: { type: "thinking_delta", thinking: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 8, delta: { type: "signature_delta", signature: "sig" } }],
      ["content_block_delta", { type: "content_block_delta", index: 8, delta: { type: "text_delta", text: "" } }],
      ["content_block_stop", { type: "content_block_stop", index: 8 }],
      ["future_event", { type: "future_event", value: 1 }],
    );
    const { items } = setup([stream(events)]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x" });
    expect(result.map((item) => item.type)).toEqual(["start", "text", "text", "stop"]);
    expect(result.at(-1)).toMatchObject({ model: "claude-sonnet-5", text: "Hello, world" });
  });

  it("gives the text of a text block that starts with text", async () => {
    const events = textStreamEvents();
    events[1] = ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "Oh. " } }];
    const { call } = setup([stream(events)]);
    expect(await call<LlmStreamStop>("llm.stream", { prompt: "x" })).toMatchObject({ text: "Oh. Hello, world" });
  });

  it("stops at an abort in the middle of the stream with ABORTED, and aborts the request", async () => {
    const start = sseBody(textStreamEvents().slice(0, 4));
    const { invoke, sent } = setup([async (init: RequestInit) => streamResponse([start], { hang: true, signal: init.signal })]);
    const controller = new AbortController();
    const seen: string[] = [];
    const reading = (async () => {
      for await (const item of outputItems(await invoke<LlmStreamOutput>("llm.stream", { prompt: "x" }, { signal: controller.signal }))) {
        seen.push(item.type);
        if (item.type === "text") controller.abort();
      }
    })();
    const error = await reading.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvocationError);
    expect(error).toMatchObject({ code: "ABORTED" });
    expect(seen).toEqual(["start", "text"]);
    expect(sent[0]!.signal?.aborted).toBe(true);
    // A stream does not try again after its first item
    expect(sent).toHaveLength(1);
  });

  it("stops a stream that passes its time limit with TIMEOUT", async () => {
    const start = sseBody(textStreamEvents().slice(0, 2));
    const { items } = setup([async (init: RequestInit) => streamResponse([start], { hang: true, signal: init.signal })]);
    await expect(items("llm.stream", { prompt: "x", timeoutMs: 30 })).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("stops at the abort of the caller before the answer, with ABORTED", async () => {
    const { invoke } = setup([hang]);
    const controller = new AbortController();
    const output = await invoke<LlmStreamOutput>("llm.stream", { prompt: "x" }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(outputItems(output).next()).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("gives REFUSAL with the category when the stream stops with a refusal", async () => {
    const events = textStreamEvents();
    events[6] = ["message_delta", { type: "message_delta", delta: { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } }, usage: { output_tokens: 3 } }];
    const { items } = setup([stream(events)]);
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "REFUSAL", message: expect.stringContaining("cyber") });
  });

  it("gives an error event after the first item to the caller, without a new try", async () => {
    const events: Array<readonly [string, unknown]> = [
      ...textStreamEvents().slice(0, 4),
      ["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }],
    ];
    const { items, sent } = setup([stream(events), stream(textStreamEvents())]);
    const error = (await items("llm.stream", { prompt: "x" }).catch((caught: unknown) => caught)) as LlmError;
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code: "API_ERROR", retryable: true, message: expect.stringContaining("overloaded_error: Overloaded") });
    expect(sent).toHaveLength(1);
  });

  it("tries again after an error event before the first item, and after a 529", async () => {
    const overloaded = sseBody([["error", { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]]);
    const { call, sent } = setup([streamResponse([overloaded]), apiError(529, "overloaded_error"), stream(textStreamEvents())]);
    expect(await call<LlmStreamStop>("llm.stream", { prompt: "x" })).toMatchObject({ text: "Hello, world" });
    expect(sent).toHaveLength(3);
  });

  it("gives an error event of an invalid request without a new try", async () => {
    const invalid = sseBody([["error", { type: "error", error: { type: "invalid_request_error" } }]]);
    const { items, sent } = setup([streamResponse([invalid])]);
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "API_ERROR", retryable: false, message: expect.stringContaining("no message") });
    expect(sent).toHaveLength(1);
  });

  it("gives an error status without a new try for a 400", async () => {
    const { items, sent } = setup([apiError(400, "invalid_request_error")]);
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "API_ERROR", status: 400, retryable: false });
    expect(sent).toHaveLength(1);
  });

  it("gives CONNECTION for a stream that ends before message_stop, and for a failed body", async () => {
    const failing = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new TypeError("terminated"));
      },
    });
    const { items } = setup([stream(textStreamEvents().slice(0, 4)), new Response(failing, { status: 200 })], { retries: 0 });
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "CONNECTION", retryable: true, message: expect.stringContaining("message_stop") });
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "CONNECTION", message: expect.stringContaining("terminated") });
  });

  it("gives BAD_RESPONSE for data that is not JSON, data that is not an object, a body that is missing and a stop without a reason", async () => {
    const stopOnly = textStreamEvents().filter(([name]) => name !== "message_delta");
    const { items } = setup([
      streamResponse(["event: message_start\ndata: {not json\n\n"]),
      streamResponse(["event: message_start\ndata: 42\n\n"]),
      new Response(null, { status: 200 }),
      stream(stopOnly),
    ]);
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "BAD_RESPONSE", message: expect.stringContaining("not JSON") });
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "BAD_RESPONSE", message: expect.stringContaining("not an object") });
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "BAD_RESPONSE", message: expect.stringContaining("no body") });
    await expect(items("llm.stream", { prompt: "x" })).rejects.toMatchObject({ code: "BAD_RESPONSE", message: expect.stringContaining("without a stop reason") });
  });

  it("refuses an input with tools that the API refuses, before a request", async () => {
    const { items, sent } = setup();
    await expect(items("llm.stream", { prompt: "x", tools: [{ name: "a b", inputSchema: { type: "object" } }] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(items("llm.stream", { prompt: "x", toolChoice: { type: "any" } })).rejects.toMatchObject({ code: "BAD_TOOL" });
    expect(sent).toHaveLength(0);
  });

  it("runs as a function with the default settings, and gives NO_API_KEY without a key in the environment", async () => {
    const saved = process.env["ANTHROPIC_API_KEY"];
    delete process.env["ANTHROPIC_API_KEY"];
    try {
      await expect(llmStream({ prompt: "x" }).next()).rejects.toMatchObject({ code: "NO_API_KEY" });
    } finally {
      if (saved !== undefined) process.env["ANTHROPIC_API_KEY"] = saved;
    }
  });
});
