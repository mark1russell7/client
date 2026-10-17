/**
 * The tools of llm.complete: the tool fields of the request, the tool_use blocks of the output,
 * and procedures as tools. A fake procedure runs for the model, its output goes back as a
 * tool_result, the loop stops at maxRounds, and the host refuses a tool that its capability or
 * its expose rule does not permit.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createProcedure, defineModule, InvocationError, zodAdapter, type AnyProcedure, type Effects, type Interceptor, type ProcedureContext } from "@procedures/client";
import { llmComplete } from "./procedures/llm/complete.js";
import { MAX_TOOL_RESULT_CHARS, toolNameOf } from "./tools.js";
import type { LlmCompleteOutput } from "./types.js";
import { message, setup, text, toolUse } from "../test/fakes.js";

const READS_WEATHER: Effects = { reads: ["weather"], writes: [], destructive: false, idempotent: true };
const WRITES_FS: Effects = { reads: ["fs"], writes: ["fs"], destructive: true };

/** A fake procedure of a test: its path, its input schema, its effects and its handler. */
function procedure(path: string[], handler: (input: never, ctx: ProcedureContext) => Promise<unknown>, options: { input?: z.ZodType; effects?: Effects; description?: string; meta?: Record<string, unknown> } = {}): AnyProcedure {
  return createProcedure()
    .path(path)
    .input(zodAdapter(options.input ?? z.object({ city: z.string().describe("The city") })))
    .output(zodAdapter(z.unknown()))
    .meta({ ...(options.description !== undefined ? { description: options.description } : {}), effects: options.effects ?? READS_WEATHER, ...options.meta })
    .handler(handler as never)
    .build() as AnyProcedure;
}

/** The fake procedures and the inputs that they got. */
function fakes() {
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

const toolAnswer = (...uses: Array<Record<string, unknown>>) => message([text("Let me check."), ...uses], { stop_reason: "tool_use" });

describe("procedures as tools", () => {
  it("runs a procedure for the model, sends its output back as a tool_result, and asks again until the model stops", async () => {
    const { got, module } = fakes();
    const first = toolAnswer(toolUse("toolu_1", "weather_current", { city: "Paris" }));
    const { call, sent } = setup([first, message([text("It is 21 degrees in Paris.")])], {}, [module]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "Weather in Paris?", procedures: ["weather.current"] });

    expect(result).toEqual({
      text: "It is 21 degrees in Paris.",
      model: "claude-sonnet-5-5",
      stopReason: "end_turn",
      usage: { inputTokens: 20, outputTokens: 10, cacheReadInputTokens: 4, cacheCreationInputTokens: 2 },
      toolUses: [],
      toolCalls: [{ id: "toolu_1", name: "weather_current", procedure: "weather.current", input: { city: "Paris" }, isError: false, output: { city: "Paris", celsius: 21 } }],
      rounds: 2,
      roundLimit: false,
    });
    expect(got).toEqual([{ city: "Paris" }]);
    expect(sent).toHaveLength(2);
    const tools = sent[0]!.body["tools"] as Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({ name: "weather_current", description: "The current weather of a city", input_schema: { type: "object", properties: { city: { type: "string" } }, required: ["city"] } });
    // The second request has the answer unchanged and then the result
    expect(sent[1]!.body["messages"]).toEqual([
      { role: "user", content: "Weather in Paris?" },
      { role: "assistant", content: first["content"] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: JSON.stringify({ city: "Paris", celsius: 21 }) }] },
    ]);
    expect(sent[1]!.body["tools"]).toEqual(sent[0]!.body["tools"]);
  });

  it("runs the tools of one answer one at a time and sends all the results in one message", async () => {
    const { got, module } = fakes();
    const answer = toolAnswer(toolUse("toolu_1", "weather_current", { city: "Paris" }), toolUse("toolu_2", "weather_current", { city: "Rome" }));
    const { call, sent } = setup([answer, message([text("Done")])], {}, [module]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "x", procedures: ["weather.current"] });
    expect(got).toEqual([{ city: "Paris" }, { city: "Rome" }]);
    expect(result.toolCalls.map((each) => each.id)).toEqual(["toolu_1", "toolu_2"]);
    const results = (sent[1]!.body["messages"] as Array<{ content: Array<{ tool_use_id: string }> }>)[2]!.content;
    expect(results.map((block) => block.tool_use_id)).toEqual(["toolu_1", "toolu_2"]);
  });

  it("gives an error of the procedure to the model with is_error, and the model goes on", async () => {
    const { got, module } = fakes();
    const answers = [
      toolAnswer(toolUse("toolu_1", "weather_current", { city: 5 })),
      toolAnswer(toolUse("toolu_2", "weather_fail", { city: "Oslo" })),
      message([text("I cannot get the weather.")]),
    ];
    const { call, sent } = setup(answers, {}, [module]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "x", procedures: ["weather.current", "weather.fail"] });
    expect(got).toEqual([]);
    expect(result.rounds).toBe(3);
    expect(result.toolCalls.map((each) => each.isError)).toEqual([true, true]);
    expect(result.toolCalls[0]!.error).toMatch(/^VALIDATION_ERROR: /);
    expect(result.toolCalls[1]!.error).toBe("the weather service is down");
    const second = (sent[1]!.body["messages"] as Array<{ content: unknown }>)[2]!.content as Array<Record<string, unknown>>;
    expect(second[0]).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1", is_error: true });
    const third = (sent[2]!.body["messages"] as Array<{ content: unknown }>)[4]!.content as Array<Record<string, unknown>>;
    expect(third[0]).toEqual({ type: "tool_result", tool_use_id: "toolu_2", content: "the weather service is down", is_error: true });
  });

  it("stops at maxRounds, with the tool_use blocks that did not run", async () => {
    const { got, module } = fakes();
    const ask = () => toolAnswer(toolUse(`toolu_${Math.random()}`, "weather_current", { city: "Paris" }));
    const { call, sent } = setup([ask(), ask(), ask()], {}, [module]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "x", procedures: ["weather.current"], maxRounds: 2 });
    expect(sent).toHaveLength(2);
    expect(got).toHaveLength(1);
    expect(result).toMatchObject({ rounds: 2, roundLimit: true, stopReason: "tool_use" });
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolUses).toEqual([{ id: expect.any(String), name: "weather_current", input: { city: "Paris" } }]);
  });

  it("stops at the default of 8 rounds", async () => {
    const { module } = fakes();
    const answers = Array.from({ length: 10 }, (_, i) => toolAnswer(toolUse(`toolu_${i}`, "weather_current", { city: "Paris" })));
    const { call, sent } = setup(answers, {}, [module]);
    expect(await call<LlmCompleteOutput>("llm.complete", { prompt: "x", procedures: ["weather.current"] })).toMatchObject({ rounds: 8, roundLimit: true });
    expect(sent).toHaveLength(8);
  });

  it("refuses a procedure that the capability does not permit, before a request and before the procedure runs", async () => {
    const { got, module } = fakes();
    const { call, sent } = setup([], {}, [module]);
    const capability = { effects: { reads: "any" as const, writes: ["network"] } };
    const error = await call("llm.complete", { prompt: "x", procedures: ["weather.current", "notes.write"] }, { capability }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvocationError);
    expect(error).toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded", message: expect.stringContaining("notes.write changes fs") });
    expect(sent).toHaveLength(0);
    expect(got).toEqual([]);
  });

  it("gives the nested call to the admission of the host: a narrower capability refuses the tool, and the call stops", async () => {
    const { got, module } = fakes();
    const { call, sent } = setup([toolAnswer(toolUse("toolu_1", "notes_write", { city: "x" })), message([text("never")])], {}, [module]);
    // The host narrows each nested call to a capability without writes
    const readOnlyNested: Interceptor = (invocation, next) => (invocation.depth > 0 ? next({ capability: { effects: { writes: [] } } }) : next());
    const capability = { effects: { reads: "any" as const, writes: ["network", "fs"] } };
    const error = await call("llm.complete", { prompt: "x", procedures: ["notes.write"] }, { capability, interceptors: [readOnlyNested] }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "FORBIDDEN", reason: "effects-exceeded", path: ["notes", "write"] });
    expect(got).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("permits a read-only tool under a capability that permits only the writes of the model", async () => {
    const { got, module } = fakes();
    const { call } = setup([toolAnswer(toolUse("toolu_1", "weather_current", { city: "Paris" })), message([text("21")])], {}, [module]);
    const capability = { effects: { reads: "any" as const, writes: ["network"] } };
    expect(await call<LlmCompleteOutput>("llm.complete", { prompt: "x", procedures: ["weather.current"] }, { capability })).toMatchObject({ text: "21" });
    expect(got).toEqual([{ city: "Paris" }]);
  });

  it("refuses a procedure that the host does not expose, and tells nothing about it", async () => {
    const { module } = fakes();
    const { call, sent } = setup([], {}, [module]);
    const expose = (path: readonly string[]) => path[0] === "llm";
    await expect(call("llm.complete", { prompt: "x", procedures: ["weather.current"] }, { expose })).rejects.toMatchObject({ code: "NOT_EXPOSED" });
    await expect(call("llm.complete", { prompt: "x", procedures: ["weather.nothing"] }, { expose })).rejects.toMatchObject({ code: "NOT_EXPOSED" });
    expect(sent).toHaveLength(0);
  });

  it("refuses a procedure that is not registered, a key given two times, a stream without an end, an input that is not an object and a long name", async () => {
    const { module } = fakes();
    const { call, sent } = setup([], {}, [module]);
    await expect(call("llm.complete", { prompt: "x", procedures: ["weather.nothing"] })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(call("llm.complete", { prompt: "x", procedures: ["weather.current", "weather.current"] })).rejects.toMatchObject({ code: "BAD_TOOL" });
    await expect(call("llm.complete", { prompt: "x", procedures: ["any.follow"] })).rejects.toMatchObject({ code: "BAD_TOOL", message: expect.stringContaining("without an end") });
    await expect(call("llm.complete", { prompt: "x", procedures: ["any.number"] })).rejects.toMatchObject({ code: "BAD_TOOL", message: expect.stringContaining("not an object") });
    await expect(call("llm.complete", { prompt: "x", procedures: [`long.${"n".repeat(130)}`] })).rejects.toMatchObject({ code: "BAD_TOOL" });
    await expect(call("llm.complete", { prompt: "x", procedures: ["bad key"] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(sent).toHaveLength(0);
  });

  it("refuses a tool name of the caller that a procedure tool has too", async () => {
    const { module } = fakes();
    const { call, sent } = setup([], {}, [module]);
    const tools = [{ name: "weather_current", inputSchema: { type: "object" } }];
    await expect(call("llm.complete", { prompt: "x", tools, procedures: ["weather.current"] })).rejects.toMatchObject({ code: "BAD_TOOL", message: expect.stringContaining("two tools") });
    expect(sent).toHaveLength(0);
  });

  it("gives an object schema for an input of any value, a default description, and cuts a long output", async () => {
    const { module } = fakes();
    const { call, sent } = setup([toolAnswer(toolUse("toolu_1", "any_value", {})), message([text("ok")])], {}, [module]);
    await call("llm.complete", { prompt: "x", procedures: ["any.value"] });
    expect((sent[0]!.body["tools"] as unknown[])[0]).toEqual({ name: "any_value", description: "The procedure any.value", input_schema: { type: "object" } });
    const result = ((sent[1]!.body["messages"] as Array<{ content: unknown }>)[2]!.content as Array<{ content: string }>)[0]!.content;
    expect(result.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 200);
    expect(result).toMatch(/\[llm: the output has 200005 characters, and this result has the first 200000\]$/);
  });

  it("uses a forced tool_choice for the first request only", async () => {
    const { module } = fakes();
    const { call, sent } = setup([toolAnswer(toolUse("toolu_1", "weather_current", { city: "Paris" })), message([text("ok")])], {}, [module]);
    await call("llm.complete", { prompt: "x", procedures: ["weather.current"], toolChoice: { type: "any", disableParallelToolUse: true } });
    expect(sent[0]!.body["tool_choice"]).toEqual({ type: "any", disable_parallel_tool_use: true });
    expect(sent[1]!.body["tool_choice"]).toEqual({ type: "auto", disable_parallel_tool_use: true });
  });

  it("stops the call when the caller aborts during a tool, and when the deadline passes during a tool", async () => {
    const waits = procedure(["slow", "wait"], (_input, ctx) => {
      return new Promise((_resolve, reject) => {
        ctx.signal?.addEventListener("abort", () => reject(new InvocationError("ABORTED", "aborted", ["slow", "wait"])), { once: true });
      });
    });
    const late = procedure(["slow", "late"], async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      throw new InvocationError("TIMEOUT", "the deadline passed", ["slow", "late"]);
    });
    const module = defineModule("slow", [waits, late]);
    const { call } = setup([toolAnswer(toolUse("toolu_1", "slow_wait", { city: "x" })), toolAnswer(toolUse("toolu_2", "slow_late", { city: "x" }))], {}, [module]);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30);
    await expect(call("llm.complete", { prompt: "x", procedures: ["slow.wait"] }, { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    await expect(call("llm.complete", { prompt: "x", procedures: ["slow.late"] }, { capability: { deadline: Date.now() + 40 } })).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("gives a TIMEOUT or an ABORTED of a tool to the model when the call itself goes on", async () => {
    const timeout = procedure(["own", "timeout"], async () => {
      throw new InvocationError("TIMEOUT", "the tool passed its own limit", ["own", "timeout"]);
    });
    const aborted = procedure(["own", "aborted"], async () => {
      throw new InvocationError("ABORTED", "the tool stopped", ["own", "aborted"]);
    });
    const module = defineModule("own", [timeout, aborted]);
    const answers = [toolAnswer(toolUse("toolu_1", "own_timeout", { city: "x" }), toolUse("toolu_2", "own_aborted", { city: "x" })), message([text("ok")])];
    const { call } = setup(answers, {}, [module]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "x", procedures: ["own.timeout", "own.aborted"] }, { capability: { deadline: Date.now() + 60_000 } });
    expect(result.toolCalls.map((each) => each.error)).toEqual(["TIMEOUT: the tool passed its own limit", "ABORTED: the tool stopped"]);
  });

  it("needs the context of a procedure call for procedure tools, and checks the deadline before a request", async () => {
    await expect(llmComplete({ prompt: "x", procedures: ["weather.current"] })).rejects.toMatchObject({ code: "BAD_TOOL" });
    const { module } = fakes();
    const { registry } = setup([], {}, [module]);
    const ctx = { client: { call: async <T>(): Promise<T> => undefined as T }, registry, capability: { deadline: Date.now() - 1 } };
    await expect(llmComplete({ prompt: "x", procedures: ["weather.current"] }, ctx)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("tools of the caller", () => {
  it("sends the tools and the tool_choice, and gives the tool_use blocks without a run", async () => {
    const tools = [{ name: "get_weather", description: "The weather", inputSchema: { type: "object", properties: { city: { type: "string" } } } }];
    const { call, sent } = setup([toolAnswer(toolUse("toolu_1", "get_weather", { city: "Paris" }))]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "x", tools, toolChoice: { type: "tool", name: "get_weather" } });
    expect(sent[0]!.body["tools"]).toEqual([{ name: "get_weather", description: "The weather", input_schema: tools[0]!.inputSchema }]);
    expect(sent[0]!.body["tool_choice"]).toEqual({ type: "tool", name: "get_weather" });
    expect(result).toMatchObject({ stopReason: "tool_use", toolUses: [{ id: "toolu_1", name: "get_weather", input: { city: "Paris" } }], toolCalls: [], rounds: 1, roundLimit: false });
  });

  it("does not run procedures when the answer also asks for a tool of the caller", async () => {
    const { got, module } = fakes();
    const tools = [{ name: "get_time", inputSchema: { type: "object" } }];
    const answer = toolAnswer(toolUse("toolu_1", "weather_current", { city: "Paris" }), toolUse("toolu_2", "get_time", {}));
    const { call, sent } = setup([answer], {}, [module]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "x", tools, procedures: ["weather.current"] });
    expect(got).toEqual([]);
    expect(sent).toHaveLength(1);
    expect(result.toolUses.map((use) => use.name)).toEqual(["weather_current", "get_time"]);
  });

  it("sends tool_choice none, and refuses a toolChoice without tools or with an unknown tool", async () => {
    const tools = [{ name: "get_weather", inputSchema: { type: "object" } }];
    const { call, sent } = setup([message([text("no tools")])]);
    await call("llm.complete", { prompt: "x", tools, toolChoice: { type: "none" } });
    expect(sent[0]!.body["tool_choice"]).toEqual({ type: "none" });
    await expect(call("llm.complete", { prompt: "x", toolChoice: { type: "auto" } })).rejects.toMatchObject({ code: "BAD_TOOL" });
    await expect(call("llm.complete", { prompt: "x", tools, toolChoice: { type: "tool", name: "other" } })).rejects.toMatchObject({ code: "BAD_TOOL" });
    await expect(call("llm.complete", { prompt: "x", tools, toolChoice: { type: "tool" } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(sent).toHaveLength(1);
  });

  it("names the tool of a procedure with _ in place of each dot", () => {
    expect(toolNameOf("weather.current")).toBe("weather_current");
    expect(toolNameOf("a.b.c")).toBe("a_b_c");
  });
});
