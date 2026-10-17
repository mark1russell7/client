/**
 * llm.stream with procedures as tools: the tool loop of llm.complete over recorded event streams.
 * A fake procedure runs for the model, the stream gives a tool_call and a tool_result item, and
 * the next answer streams in the same output. The tests use the fake fetch: no test reaches the
 * network, and no test has a real API key.
 */

import { describe, expect, it } from "vitest";
import { defineModule, InvocationError, outputItems, type Interceptor, type ProcedureContext } from "@procedures/client";
import { DEFAULT_LLM_SETTINGS, type LlmSettings } from "./anthropic.js";
import { llmStream } from "./procedures/llm/stream.js";
import { MAX_TOOL_RESULT_CHARS } from "./tools.js";
import type { LlmStreamOutput, LlmStreamStop, LlmStreamToolResult } from "./types.js";
import { apiError, chunked, fakeFetch, KEY, procedure, setup, sseBody, streamResponse, text, toolProcedures, toolUse } from "../test/fakes.js";

type Events = Array<readonly [string, unknown]>;

const START_USAGE = { inputTokens: 10, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };

/**
 * The events of one answer: message_start, each block with its deltas, the stop reason and the
 * usage (10 tokens in, 5 tokens out). The input of a tool_use block comes in two parts.
 */
function answerEvents(id: string, blocks: Array<Record<string, unknown>>, stopReason: string): Events {
  const events: Events = [
    ["message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 1 } } }],
  ];
  blocks.forEach((block, index) => {
    if (block["type"] === "text") {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text: block["text"] } }]);
    } else {
      const json = JSON.stringify(block["input"]);
      const half = Math.floor(json.length / 2);
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: block["id"], name: block["name"], input: {} } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(0, half) } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: json.slice(half) } }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } }]);
  events.push(["message_stop", { type: "message_stop" }]);
  return events;
}

/** A recorded stream in chunks of 11 characters, so the events arrive in parts. */
const streamOf = (events: Events): Response => streamResponse(chunked(sseBody(events), 11));
/** An answer that asks for tools: a text block, then the tool_use blocks. */
const toolTurn = (id: string, ...uses: Array<Record<string, unknown>>): Response => streamOf(answerEvents(id, [text("Let me check."), ...uses], "tool_use"));
/** An answer with only text. */
const textTurn = (id: string, value: string): Response => streamOf(answerEvents(id, [text(value)], "end_turn"));

type Message = { role: string; content: unknown };
const messagesOf = (body: Record<string, unknown>): Message[] => body["messages"] as Message[];

describe("llm.stream with procedures as tools", () => {
  it("runs a tool, gives the tool_call and tool_result items, and streams the next answer in the same output", async () => {
    const { got, module } = toolProcedures();
    const { items, sent } = setup([toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: "Paris" })), textTurn("msg_2", "It is 21 degrees in Paris.")], {}, [module]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "Weather in Paris?", procedures: ["weather.current"] });

    const call = { id: "toolu_1", name: "weather_current", procedure: "weather.current", input: { city: "Paris" } };
    expect(result).toEqual([
      { type: "start", id: "msg_1", model: "claude-sonnet-5-5", usage: START_USAGE },
      { type: "text", index: 0, text: "Let me check." },
      { type: "tool_use", index: 1, id: "toolu_1", name: "weather_current", input: { city: "Paris" } },
      { type: "tool_call", round: 1, ...call },
      { type: "tool_result", round: 1, ...call, isError: false, output: { city: "Paris", celsius: 21 } },
      { type: "start", id: "msg_2", model: "claude-sonnet-5-5", usage: START_USAGE },
      { type: "text", index: 0, text: "It is 21 degrees in Paris." },
      {
        type: "stop",
        model: "claude-sonnet-5-5",
        stopReason: "end_turn",
        // The usage of the two requests, added together
        usage: { inputTokens: 20, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
        text: "Let me check.It is 21 degrees in Paris.",
        toolUses: [],
        toolCalls: [{ ...call, isError: false, output: { city: "Paris", celsius: 21 } }],
        rounds: 2,
        roundLimit: false,
      },
    ]);
    expect(got).toEqual([{ city: "Paris" }]);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.body["tools"]).toEqual([
      { name: "weather_current", description: "The current weather of a city", input_schema: expect.objectContaining({ type: "object", required: ["city"] }) },
    ]);
    // The second request streams too: it has the answer, put together from its events, and then the result
    expect(sent[1]!.body["stream"]).toBe(true);
    expect(sent[1]!.body["tools"]).toEqual(sent[0]!.body["tools"]);
    expect(messagesOf(sent[1]!.body)).toEqual([
      { role: "user", content: "Weather in Paris?" },
      { role: "assistant", content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "toolu_1", name: "weather_current", input: { city: "Paris" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: JSON.stringify({ city: "Paris", celsius: 21 }) }] },
    ]);
  });

  it("gives the stop item with the tool calls as the result of a call", async () => {
    const { module } = toolProcedures();
    const { call } = setup([toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: "Paris" })), textTurn("msg_2", "21")], {}, [module]);
    const stop = await call<LlmStreamStop>("llm.stream", { prompt: "x", procedures: ["weather.current"] });
    expect(stop).toMatchObject({ type: "stop", stopReason: "end_turn", rounds: 2, roundLimit: false, toolCalls: [{ id: "toolu_1", isError: false }] });
  });

  it("runs two tools of one answer one at a time, and sends both results in one message", async () => {
    const { got, module } = toolProcedures();
    const turn = toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: "Paris" }), toolUse("toolu_2", "weather_current", { city: "Rome" }));
    const { items, sent } = setup([turn, textTurn("msg_2", "Done")], {}, [module]);
    // A signal that does not abort changes nothing
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: ["weather.current"] }, { signal: new AbortController().signal });
    expect(result.map((item) => item.type)).toEqual(["start", "text", "tool_use", "tool_use", "tool_call", "tool_result", "tool_call", "tool_result", "start", "text", "stop"]);
    expect(result.filter((item) => item.type === "tool_call" || item.type === "tool_result").map((item) => `${item.type} ${(item as { id: string }).id}`)).toEqual([
      "tool_call toolu_1",
      "tool_result toolu_1",
      "tool_call toolu_2",
      "tool_result toolu_2",
    ]);
    expect(got).toEqual([{ city: "Paris" }, { city: "Rome" }]);
    expect(sent).toHaveLength(2);
    const results = messagesOf(sent[1]!.body)[2]!.content as Array<{ tool_use_id: string }>;
    expect(results.map((block) => block.tool_use_id)).toEqual(["toolu_1", "toolu_2"]);
  });

  it("uses a forced tool_choice for the first request only", async () => {
    const { module } = toolProcedures();
    const answers = [
      toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: "Paris" })),
      textTurn("msg_2", "ok"),
      toolTurn("msg_3", toolUse("toolu_2", "weather_current", { city: "Rome" })),
      textTurn("msg_4", "ok"),
      toolTurn("msg_5", toolUse("toolu_3", "weather_current", { city: "Oslo" })),
      textTurn("msg_6", "ok"),
    ];
    const { items, sent } = setup(answers, {}, [module]);
    await items("llm.stream", { prompt: "x", procedures: ["weather.current"], toolChoice: { type: "tool", name: "weather_current", disableParallelToolUse: true } });
    expect(sent[0]!.body["tool_choice"]).toEqual({ type: "tool", name: "weather_current", disable_parallel_tool_use: true });
    expect(sent[1]!.body["tool_choice"]).toEqual({ type: "auto", disable_parallel_tool_use: true });
    await items("llm.stream", { prompt: "x", procedures: ["weather.current"], toolChoice: { type: "any" } });
    expect(sent[2]!.body["tool_choice"]).toEqual({ type: "any" });
    expect(sent[3]!.body["tool_choice"]).toEqual({ type: "auto" });
    // A tool_choice that is not forced stays the same
    await items("llm.stream", { prompt: "x", procedures: ["weather.current"], toolChoice: { type: "auto", disableParallelToolUse: false } });
    expect(sent[4]!.body["tool_choice"]).toEqual({ type: "auto", disable_parallel_tool_use: false });
    expect(sent[5]!.body["tool_choice"]).toEqual({ type: "auto", disable_parallel_tool_use: false });
  });

  it("gives an error of a tool to the model with is_error, and the model goes on", async () => {
    const { got, module } = toolProcedures();
    const answers = [
      toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: 5 })),
      toolTurn("msg_2", toolUse("toolu_2", "weather_fail", { city: "Oslo" })),
      textTurn("msg_3", "I cannot get the weather."),
    ];
    const { items, sent } = setup(answers, {}, [module]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: ["weather.current", "weather.fail"] }, { signal: new AbortController().signal });
    expect(got).toEqual([]);
    const ends = result.filter((item): item is LlmStreamToolResult => item.type === "tool_result");
    expect(ends.map((item) => [item.round, item.isError])).toEqual([
      [1, true],
      [2, true],
    ]);
    expect(ends[0]!.error).toMatch(/^VALIDATION_ERROR: /);
    expect(ends[1]!.error).toBe("the weather service is down");
    expect(result.at(-1)).toMatchObject({ type: "stop", stopReason: "end_turn", rounds: 3, text: "Let me check.Let me check.I cannot get the weather." });
    expect(messagesOf(sent[1]!.body)[2]!.content).toEqual([{ type: "tool_result", tool_use_id: "toolu_1", content: expect.stringMatching(/^VALIDATION_ERROR: /), is_error: true }]);
    expect(messagesOf(sent[2]!.body)[4]!.content).toEqual([{ type: "tool_result", tool_use_id: "toolu_2", content: "the weather service is down", is_error: true }]);
  });

  it("stops at maxRounds, with the tool_use blocks that did not run", async () => {
    const { got, module } = toolProcedures();
    const ask = (id: string) => toolTurn(`msg_${id}`, toolUse(`toolu_${id}`, "weather_current", { city: "Paris" }));
    const { items, sent } = setup([ask("1"), ask("2"), ask("3")], {}, [module]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: ["weather.current"], maxRounds: 2 });
    expect(sent).toHaveLength(2);
    expect(got).toHaveLength(1);
    expect(result.filter((item) => item.type === "tool_call")).toHaveLength(1);
    expect(result.at(-1)).toMatchObject({
      type: "stop",
      stopReason: "tool_use",
      rounds: 2,
      roundLimit: true,
      toolUses: [{ id: "toolu_2", name: "weather_current", input: { city: "Paris" } }],
      toolCalls: [{ id: "toolu_1" }],
    });
  });

  it("cuts a long output in the tool_result of the model, and gives the full output in the item", async () => {
    const { module } = toolProcedures();
    const { items, sent } = setup([toolTurn("msg_1", toolUse("toolu_1", "any_value", {})), textTurn("msg_2", "ok")], {}, [module]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: ["any.value"] });
    const end = result.find((item): item is LlmStreamToolResult => item.type === "tool_result")!;
    expect((end.output as string).length).toBe(MAX_TOOL_RESULT_CHARS + 5);
    const content = (messagesOf(sent[1]!.body)[2]!.content as Array<{ content: string }>)[0]!.content;
    expect(content.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 200);
    expect(content).toMatch(/\[llm: the output has 200005 characters, and this result has the first 200000\]$/);
  });

  it("stops the stream and the tool in flight when the caller aborts in the middle of a tool", async () => {
    let started!: () => void;
    const toolStarted = new Promise<void>((resolve) => (started = resolve));
    let toolAborted = false;
    const waits = procedure(["slow", "wait"], (_input, ctx: ProcedureContext) => {
      return new Promise((_resolve, reject) => {
        ctx.signal?.addEventListener(
          "abort",
          () => {
            toolAborted = true;
            reject(new InvocationError("ABORTED", "aborted", ["slow", "wait"]));
          },
          { once: true },
        );
        started();
      });
    });
    const { invoke, sent } = setup([toolTurn("msg_1", toolUse("toolu_1", "slow_wait", { city: "x" })), textTurn("msg_2", "never")], {}, [defineModule("slow", [waits])]);
    const controller = new AbortController();
    void toolStarted.then(() => controller.abort());
    const seen: string[] = [];
    const reading = (async () => {
      for await (const item of outputItems(await invoke<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: ["slow.wait"] }, { signal: controller.signal }))) {
        seen.push(item.type);
      }
    })();
    const error = await reading.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvocationError);
    expect(error).toMatchObject({ code: "ABORTED" });
    expect(seen).toEqual(["start", "text", "tool_use", "tool_call"]);
    expect(toolAborted).toBe(true);
    // No request goes out after the abort
    expect(sent).toHaveLength(1);
  });

  it("stops the wait for a tool that does not read the signal, and for a signal that aborts as the tool starts", async () => {
    const { module } = toolProcedures();
    const { registry } = setup([], {}, [module]);
    const fake = fakeFetch([toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: "Paris" })), toolTurn("msg_2", toolUse("toolu_2", "weather_current", { city: "Rome" }))]);
    const settings: LlmSettings = { ...DEFAULT_LLM_SETTINGS, env: () => ({ ANTHROPIC_API_KEY: KEY }), fetch: fake.fetch };
    const input = { prompt: "x", procedures: ["weather.current"] };

    // The nested call never ends, and it does not read the signal
    const first = new AbortController();
    const never = { call: async <T>(): Promise<T> => new Promise<T>(() => undefined), stream: () => [] as never };
    const stream = llmStream(input, { client: never, registry, signal: first.signal, capability: {} }, settings);
    const types: string[] = [];
    for (let step = await stream.next(); !step.done; step = await stream.next()) {
      types.push(step.value.type);
      if (step.value.type === "tool_call") break;
    }
    expect(types).toEqual(["start", "text", "tool_use", "tool_call"]);
    const next = stream.next();
    first.abort();
    await expect(next).rejects.toMatchObject({ code: "ABORTED", path: ["weather", "current"] });

    // The signal aborts while the nested call starts
    const second = new AbortController();
    const aborts = { call: async <T>(): Promise<T> => (second.abort(), new Promise<T>(() => undefined)), stream: () => [] as never };
    const items: string[] = [];
    const reading = (async () => {
      for await (const item of llmStream(input, { client: aborts, registry, signal: second.signal, capability: {} }, settings)) items.push(item.type);
    })();
    await expect(reading).rejects.toMatchObject({ code: "ABORTED" });
    expect(items).toEqual(["start", "text", "tool_use", "tool_call"]);
    expect(fake.sent).toHaveLength(2);
  });

  it("tries a request of the loop again after a 529", async () => {
    const { module } = toolProcedures();
    const answers = [toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: "Paris" })), apiError(529, "overloaded_error"), textTurn("msg_2", "21")];
    const { items, sent } = setup(answers, {}, [module]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: ["weather.current"] });
    expect(result.map((item) => item.type)).toEqual(["start", "text", "tool_use", "tool_call", "tool_result", "start", "text", "stop"]);
    expect(sent).toHaveLength(3);
    expect(sent[2]!.body).toEqual(sent[1]!.body);
  });

  it("does not run procedures when the answer also asks for a tool of the caller", async () => {
    const { got, module } = toolProcedures();
    const tools = [{ name: "get_time", inputSchema: { type: "object" } }];
    const { items, sent } = setup([toolTurn("msg_1", toolUse("toolu_1", "weather_current", { city: "Paris" }), toolUse("toolu_2", "get_time", {}))], {}, [module]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", tools, procedures: ["weather.current"] });
    expect(got).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(result.map((item) => item.type)).toEqual(["start", "text", "tool_use", "tool_use", "stop"]);
    expect(result.at(-1)).toMatchObject({ stopReason: "tool_use", toolCalls: [], rounds: 1, roundLimit: false, toolUses: [{ name: "weather_current" }, { name: "get_time" }] });
  });

  it("sends back the thinking, the citations and the server tool blocks of a streamed answer unchanged", async () => {
    const { module } = toolProcedures();
    const citation = { type: "char_location", cited_text: "21 degrees", document_index: 0, start_char_index: 0, end_char_index: 10 };
    const events: Events = [
      ["message_start", { type: "message_start", message: { id: "msg_1", model: "claude-sonnet-5-5", usage: { input_tokens: 10, output_tokens: 1 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Let me " } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "think." } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-1" } }],
      // A delta for a block of another type, an unknown delta and a delta without a block change nothing
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "citations_delta", citation } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "future_delta", value: 1 } }],
      ["content_block_delta", { type: "content_block_delta", index: 7, delta: { type: "input_json_delta", partial_json: "{}" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "text" } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "citations_delta", citation } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "It is " } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "citations_delta", citation } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta" } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "21 degrees." } }],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      ["content_block_start", { type: "content_block_start", index: 2, content_block: { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '{"query":' } }],
      ["content_block_delta", { type: "content_block_delta", index: 2, delta: { type: "input_json_delta", partial_json: '"weather"}' } }],
      ["content_block_stop", { type: "content_block_stop", index: 2 }],
      ["content_block_start", { type: "content_block_start", index: 3, content_block: { type: "redacted_thinking", data: "abc" } }],
      ["content_block_stop", { type: "content_block_stop", index: 3 }],
      // A stop without a start changes nothing
      ["content_block_stop", { type: "content_block_stop", index: 9 }],
      ["content_block_start", { type: "content_block_start", index: 4, content_block: { type: "tool_use", id: "toolu_1", name: "any_value", input: { all: true } } }],
      ["content_block_stop", { type: "content_block_stop", index: 4 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } }],
      ["message_stop", { type: "message_stop" }],
    ];
    const { items, sent } = setup([streamOf(events), textTurn("msg_2", "ok")], {}, [module]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: ["any.value"] });
    expect(result.filter((item) => item.type === "text").map((item) => (item as { text: string }).text)).toEqual(["It is ", "21 degrees.", "ok"]);
    expect(result.find((item) => item.type === "tool_use")).toEqual({ type: "tool_use", index: 4, id: "toolu_1", name: "any_value", input: { all: true } });
    expect(messagesOf(sent[1]!.body)[1]).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Let me think.", signature: "sig-1" },
        { type: "text", text: "It is 21 degrees.", citations: [citation, citation] },
        { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "weather" } },
        { type: "redacted_thinking", data: "abc" },
        { type: "tool_use", id: "toolu_1", name: "any_value", input: { all: true } },
      ],
    });
  });

  it("keeps the stop item of a stream without procedures as it was", async () => {
    const { items } = setup([textTurn("msg_1", "Hello")]);
    const result = await items<LlmStreamOutput>("llm.stream", { prompt: "x", procedures: [] });
    expect(result.at(-1)).toEqual({ type: "stop", model: "claude-sonnet-5-5", stopReason: "end_turn", usage: { ...START_USAGE, outputTokens: 5 }, text: "Hello", toolUses: [] });
  });
});

describe("the admission of the host for llm.stream", () => {
  it("refuses a procedure that the host does not expose, or that the capability does not permit, before a request", async () => {
    const { got, module } = toolProcedures();
    const { items, sent } = setup([], {}, [module]);
    const expose = (path: readonly string[]) => path[0] === "llm";
    await expect(items("llm.stream", { prompt: "x", procedures: ["weather.current"] }, { expose })).rejects.toMatchObject({ code: "NOT_EXPOSED" });
    const capability = { effects: { reads: "any" as const, writes: ["network"] } };
    await expect(items("llm.stream", { prompt: "x", procedures: ["weather.current", "notes.write"] }, { capability })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "effects-exceeded",
      message: expect.stringContaining("notes.write changes fs"),
    });
    await expect(items("llm.stream", { prompt: "x", procedures: ["weather.nothing"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(items("llm.stream", { prompt: "x", procedures: ["any.follow"] })).rejects.toMatchObject({ code: "BAD_TOOL" });
    expect(sent).toHaveLength(0);
    expect(got).toEqual([]);
  });

  it("gives the nested call to the admission of the host: a narrower capability refuses the tool, and the stream stops", async () => {
    const { got, module } = toolProcedures();
    const { items, sent } = setup([toolTurn("msg_1", toolUse("toolu_1", "notes_write", { city: "x" })), textTurn("msg_2", "never")], {}, [module]);
    // The host narrows each nested call to a capability without writes
    const readOnlyNested: Interceptor = (invocation, next) => (invocation.depth > 0 ? next({ capability: { effects: { writes: [] } } }) : next());
    const capability = { effects: { reads: "any" as const, writes: ["network", "fs"] } };
    const error = await items("llm.stream", { prompt: "x", procedures: ["notes.write"] }, { capability, interceptors: [readOnlyNested] }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded", path: ["notes", "write"] });
    expect(got).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("needs the context of a procedure call for procedure tools", async () => {
    await expect(llmStream({ prompt: "x", procedures: ["weather.current"] }).next()).rejects.toMatchObject({ code: "BAD_TOOL", message: expect.stringContaining("llm.stream") });
  });
});
