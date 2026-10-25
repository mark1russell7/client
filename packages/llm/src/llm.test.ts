/**
 * The llm procedures (roadmap R46) with a fake fetch: the request of the Messages API, the key
 * from the environment, the errors, the time limit, the deadline, the abort, and the new tries
 * of llm.structured. No test reaches the network.
 */

import { describe, expect, it } from "vitest";
import { createRegistry, effectsOf, InvocationError, invokePath, isDataDriven, outputValue, takesRawInput, type Capability } from "@procedures/client";
import { createLlmModule, llmModule, type LlmModuleOptions } from "./module.js";
import { LlmError } from "./errors.js";
import { constrainedSchema, parseAnswer } from "./schema.js";
import { FALLBACK_BETA, messagesUrl } from "./anthropic.js";
import type { LlmCompleteOutput, LlmStructuredOutput } from "./types.js";

const KEY = "sk-ant-test-key";

interface Sent {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** An answer of the Messages API. */
function message(content: unknown[], extra: Record<string, unknown> = {}) {
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

const text = (value: string) => ({ type: "text", text: value });

/** A fake fetch that records each request and gives the next answer: a body, or a Response, or a function. */
function fakeFetch(answers: Array<unknown | Response | ((init: RequestInit) => Promise<Response>)>) {
  const sent: Sent[] = [];
  const fetch = async (url: string, init: RequestInit): Promise<Response> => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    const next = answers.shift();
    if (typeof next === "function") return (next as (init: RequestInit) => Promise<Response>)(init);
    if (next instanceof Response) return next;
    return new Response(JSON.stringify(next ?? message([text("ok")])), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, sent };
}

function setup(answers: Parameters<typeof fakeFetch>[0] = [], options: LlmModuleOptions = {}) {
  const fake = fakeFetch(answers);
  const registry = createRegistry(createLlmModule({ env: { ANTHROPIC_API_KEY: KEY }, fetch: fake.fetch, backoff: { base: 1, cap: 2 }, ...options }));
  const call = async <T>(key: string, input: unknown, extra: { signal?: AbortSignal; capability?: Capability } = {}): Promise<T> => {
    const path = key.split(".");
    return outputValue(await invokePath<T>(path, input, { registry, ...extra }), path);
  };
  return { ...fake, call };
}

/** A fetch answer that waits until the request is aborted. */
const hang = (init: RequestInit): Promise<Response> =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
  });

describe("llm.complete", () => {
  it("sends a request of the Messages API and gives the text, the model, the stop reason and the usage", async () => {
    const { call, sent } = setup([message([{ type: "thinking", thinking: "" }, text("Hello"), text(", world")])]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "Say hello", system: "Be brief", temperature: 0.5, effort: "low" });
    expect(result).toEqual({
      text: "Hello, world",
      model: "claude-sonnet-5-5",
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 2, cacheCreationInputTokens: 1 },
      toolUses: [],
      toolCalls: [],
      rounds: 1,
      roundLimit: false,
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(sent[0]!.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": FALLBACK_BETA,
    });
    expect(sent[0]!.body).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      messages: [{ role: "user", content: "Say hello" }],
      system: "Be brief",
      temperature: 0.5,
      output_config: { effort: "low" },
      fallbacks: "default",
    });
  });

  it("uses the model and the limit of the input, and sends no fallback when the input or the module turns it off", async () => {
    const { call, sent } = setup([message([text("a")]), message([text("b")])], { fallback: false, baseUrl: "http://proxy.test/", defaultModel: "claude-haiku-5-5" });
    await call("llm.complete", { prompt: "x" });
    await call("llm.complete", { prompt: "y", model: "claude-opus-5-5", maxTokens: 100, fallback: true });
    expect(sent[0]!.url).toBe("http://proxy.test/v1/messages");
    expect(sent[0]!.body).toEqual({ model: "claude-haiku-5-5", max_tokens: 16000, messages: [{ role: "user", content: "x" }] });
    expect(sent[0]!.headers["anthropic-beta"]).toBeUndefined();
    expect(sent[1]!.body).toMatchObject({ model: "claude-opus-5-5", max_tokens: 100, fallbacks: "default" });
    expect(sent[1]!.headers["anthropic-beta"]).toBe(FALLBACK_BETA);
  });

  it("gives the stop reason max_tokens with the text that came", async () => {
    const { call } = setup([message([text("Once upon")], { stop_reason: "max_tokens" })]);
    expect(await call<LlmCompleteOutput>("llm.complete", { prompt: "story", maxTokens: 3 })).toMatchObject({ text: "Once upon", stopReason: "max_tokens" });
  });

  it("gives the model of the answer after a fallback", async () => {
    const { call } = setup([message([{ type: "fallback", from: { model: "claude-sonnet-5-5" }, to: { model: "claude-sonnet-5" } }, text("ok")], { model: "claude-sonnet-5" })]);
    expect(await call<LlmCompleteOutput>("llm.complete", { prompt: "x" })).toMatchObject({ text: "ok", model: "claude-sonnet-5" });
  });
});

describe("the API key", () => {
  it("comes from the variable that the module names, never from the input", async () => {
    const fake = fakeFetch([message([text("ok")])]);
    const registry = createRegistry(createLlmModule({ apiKeyEnv: "WORK_KEY", env: () => ({ WORK_KEY: " work-key \n", ANTHROPIC_API_KEY: "other" }), fetch: fake.fetch }));
    const output = await invokePath(["llm", "complete"], { prompt: "x", apiKey: "from-the-input", headers: { "x-api-key": "evil" } }, { registry });
    await outputValue(output);
    expect(fake.sent[0]!.headers["x-api-key"]).toBe("work-key");
    expect(JSON.stringify(fake.sent[0]!.body)).not.toContain("from-the-input");
    expect(JSON.stringify(fake.sent[0]!.body)).not.toContain("evil");
  });

  it("gives NO_API_KEY with the name of the variable, and sends nothing, when the variable is empty", async () => {
    const fake = fakeFetch([]);
    const registry = createRegistry(createLlmModule({ env: { ANTHROPIC_API_KEY: "  " }, fetch: fake.fetch }));
    const error = await invokePath(["llm", "complete"], { prompt: "x" }, { registry }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ code: "NO_API_KEY", message: expect.stringContaining("ANTHROPIC_API_KEY") });
    expect(fake.sent).toHaveLength(0);
  });

  it("refuses a bad option of the module", () => {
    expect(() => createLlmModule({ apiKeyEnv: "A B" })).toThrow(/apiKeyEnv/);
    expect(() => createLlmModule({ baseUrl: "file:///etc" })).toThrow(/baseUrl/);
    expect(createLlmModule()).toBe(llmModule);
  });
});

describe("the errors", () => {
  it("give API_ERROR with the status, the type and the message of the API, and not the key", async () => {
    const body = JSON.stringify({ type: "error", error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` } });
    const { call } = setup([new Response(body, { status: 401 })]);
    const error = (await call("llm.complete", { prompt: "x" }).catch((caught: unknown) => caught)) as LlmError;
    expect(error).toMatchObject({ code: "API_ERROR", status: 401, retryable: false });
    expect(error.message).toContain("authentication_error: invalid x-api-key [key]");
    expect(error.message).not.toContain(KEY);
  });

  it("mark a rate limit, an overload and a server error as retryable", async () => {
    const overloaded = JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
    const { call } = setup([new Response("{}", { status: 429 }), new Response(overloaded, { status: 529 }), new Response("<html>", { status: 500 })], { retries: 0 });
    for (const status of [429, 529, 500]) {
      await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ code: "API_ERROR", status, retryable: true });
    }
  });

  it("give REFUSAL with the category when a safety classifier declines", async () => {
    const { call } = setup([message([], { stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "no" } })]);
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ code: "REFUSAL", message: expect.stringContaining("cyber") });
  });

  it("give BAD_RESPONSE for an answer that is not a message, and CONNECTION for a failed fetch", async () => {
    const { call } = setup([
      new Response("not json", { status: 200 }),
      new Response(JSON.stringify({ hello: 1 }), { status: 200 }),
      async () => {
        throw new TypeError("fetch failed");
      },
    ], { retries: 0 });
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ code: "BAD_RESPONSE" });
    await expect(call("llm.complete", { prompt: "x" })).rejects.toMatchObject({ code: "CONNECTION", retryable: true });
  });

  it("refuse an input without a prompt or with a temperature above 1", async () => {
    const { call, sent } = setup();
    await expect(call("llm.complete", { prompt: "" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(call("llm.complete", { prompt: "x", temperature: 2 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(sent).toHaveLength(0);
  });
});

describe("the time limit, the deadline and the abort", () => {
  it("stop a call at timeoutMs with TIMEOUT", async () => {
    const { call } = setup([hang]);
    const error = await call("llm.complete", { prompt: "x", timeoutMs: 20 }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(InvocationError);
    expect(error).toMatchObject({ code: "TIMEOUT" });
  });

  it("stop a call at the deadline of the capability with TIMEOUT", async () => {
    const { call } = setup([hang]);
    await expect(call("llm.complete", { prompt: "x" }, { capability: { deadline: Date.now() + 30 } })).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("stop a call when the caller aborts, with ABORTED", async () => {
    const { call } = setup([hang]);
    const controller = new AbortController();
    const pending = call("llm.complete", { prompt: "x" }, { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  });

  it("send nothing when the deadline passed or the caller aborted before the call", async () => {
    const { call, sent } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(call("llm.complete", { prompt: "x" }, { signal: controller.signal })).rejects.toMatchObject({ code: "ABORTED" });
    await expect(call("llm.complete", { prompt: "x" }, { capability: { deadline: Date.now() - 1 } })).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(sent).toHaveLength(0);
  });
});

describe("llm.structured", () => {
  const schema = {
    type: "object",
    properties: {
      name: { type: "string", minLength: 2 },
      age: { type: "integer", minimum: 0, maximum: 150 },
      tags: { type: "array", items: { type: "string" }, maxItems: 3 },
    },
    required: ["name", "age"],
  };

  it("sends the schema as a constraint without the unsupported keywords, and gives the value", async () => {
    const { call, sent } = setup([message([text('{"name":"Ada","age":36}')])]);
    const result = await call<LlmStructuredOutput>("llm.structured", { prompt: "Who?", system: "Be exact", schema });
    expect(result).toEqual({
      value: { name: "Ada", age: 36 },
      model: "claude-sonnet-5-5",
      attempts: 1,
      usage: { inputTokens: 10, outputTokens: 5, cacheReadInputTokens: 2, cacheCreationInputTokens: 1 },
      unchecked: [],
    });
    const body = sent[0]!.body as { system: string; output_config: { format: { type: string; schema: unknown } } };
    expect(body.system.startsWith("Be exact\n\nAnswer with one JSON value")).toBe(true);
    expect(body.output_config.format).toEqual({
      type: "json_schema",
      schema: {
        type: "object",
        properties: { name: { type: "string" }, age: { type: "integer" }, tags: { type: "array", items: { type: "string" } } },
        required: ["name", "age"],
        additionalProperties: false,
      },
    });
  });

  it("tries again after an answer that is not JSON and after a value that the schema refuses, with the answer and the problem", async () => {
    const first = [{ type: "thinking", thinking: "", signature: "sig-1" }, text("Sure! Here it is")];
    const { call, sent } = setup([message(first), message([text('{"name":"A","age":-1}')]), message([text('{"name":"Ada","age":36}')])]);
    const result = await call<LlmStructuredOutput>("llm.structured", { prompt: "Who?", schema, effort: "medium" });
    expect(result.value).toEqual({ name: "Ada", age: 36 });
    expect(result.attempts).toBe(3);
    expect(result.usage).toEqual({ inputTokens: 30, outputTokens: 15, cacheReadInputTokens: 6, cacheCreationInputTokens: 3 });
    expect(sent).toHaveLength(3);
    const second = sent[1]!.body as { messages: Array<{ role: string; content: unknown }>; output_config: Record<string, unknown> };
    // The assistant turn is the content of the answer, unchanged, with its thinking block
    expect(second.messages[1]).toEqual({ role: "assistant", content: first });
    expect(second.messages[2]!.role).toBe("user");
    expect(String(second.messages[2]!.content)).toContain("not JSON");
    expect(second.output_config["effort"]).toBe("medium");
    const third = sent[2]!.body as { messages: Array<{ role: string; content: unknown }> };
    expect(third.messages).toHaveLength(5);
    expect(String(third.messages[4]!.content)).toMatch(/schema refuses the value: \/name: .*\/age: /s);
  });

  it("gives INVALID_OUTPUT after 3 answers that are not valid, and makes no fourth call", async () => {
    const bad = () => message([text("no")]);
    const { call, sent } = setup([bad(), bad(), bad(), bad()]);
    await expect(call("llm.structured", { prompt: "x", schema })).rejects.toMatchObject({ code: "INVALID_OUTPUT", message: expect.stringContaining("3") });
    expect(sent).toHaveLength(3);
  });

  it("makes one call with retries: 0, and refuses more than 2 retries", async () => {
    const { call, sent } = setup([message([text("no")])]);
    await expect(call("llm.structured", { prompt: "x", schema, retries: 0 })).rejects.toMatchObject({ code: "INVALID_OUTPUT" });
    expect(sent).toHaveLength(1);
    await expect(call("llm.structured", { prompt: "x", schema, retries: 3 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("puts the schema in the system text without the constraint, and removes a code fence", async () => {
    const { call, sent } = setup([message([text('```json\n{"name":"Ada","age":36}\n```')])]);
    const result = await call<LlmStructuredOutput>("llm.structured", { prompt: "Who?", schema, constrained: false });
    expect(result.value).toEqual({ name: "Ada", age: 36 });
    const body = sent[0]!.body as { system: string; output_config?: unknown };
    expect(body.output_config).toBeUndefined();
    expect(body.system).toContain(JSON.stringify(schema));
  });

  it("gives MAX_TOKENS when the answer stopped at the limit, without a new try", async () => {
    const { call, sent } = setup([message([text('{"name":"Ad')], { stop_reason: "max_tokens" })]);
    await expect(call("llm.structured", { prompt: "x", schema, maxTokens: 5 })).rejects.toMatchObject({ code: "MAX_TOKENS" });
    expect(sent).toHaveLength(1);
  });

  it("lists the keywords that the check does not examine", async () => {
    const { call } = setup([message([text("[1,2]")])]);
    const result = await call<LlmStructuredOutput>("llm.structured", { prompt: "x", schema: { type: "array", uniqueItems: true } });
    expect(result.unchecked).toEqual(["uniqueItems"]);
  });
});

describe("the schema helpers", () => {
  it("constrainedSchema closes each object, also in lists, maps and definitions", () => {
    const schema = {
      $defs: { point: { type: "object", properties: { x: { type: "number", multipleOf: 1 } } } },
      anyOf: [{ type: ["object", "null"], properties: {} }, { type: "string", maxLength: 3 }],
      additionalProperties: { type: "string" },
      properties: { list: { type: "array", prefixItems: [{ type: "object" }], minItems: 2 } },
    };
    expect(constrainedSchema(schema)).toEqual({
      $defs: { point: { type: "object", properties: { x: { type: "number" } }, additionalProperties: false } },
      anyOf: [{ type: ["object", "null"], properties: {}, additionalProperties: false }, { type: "string" }],
      additionalProperties: false,
      properties: { list: { type: "array", prefixItems: [{ type: "object", additionalProperties: false }] } },
    });
    expect(constrainedSchema(true)).toBe(true);
  });

  it("parseAnswer reads JSON, a fenced value and reports an empty answer", () => {
    expect(parseAnswer(' {"a":1} ')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseAnswer("```\n[1]\n```")).toEqual({ ok: true, value: [1] });
    expect(parseAnswer("")).toEqual({ ok: false, problem: "the answer is empty" });
    expect(parseAnswer("{").ok).toBe(false);
    expect(parseAnswer('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseAnswer('```json \r\n\n  {"a":1}```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseAnswer("```\n```")).toEqual({ ok: false, problem: "the answer is empty" });
    expect(parseAnswer("```json[1]```").ok).toBe(false);
    expect(parseAnswer("```json x\n[1]\n```").ok).toBe(false);
  });

  it("parseAnswer and the URL of the API read a long adversarial text in linear time", () => {
    const started = performance.now();
    expect(parseAnswer(`\`\`\`\n${"\n ".repeat(25_000)}x`).ok).toBe(false);
    expect(messagesUrl(`http://proxy.test${"/".repeat(50_000)}x`)).toBe(`http://proxy.test${"/".repeat(50_000)}x/v1/messages`);
    expect(messagesUrl("http://proxy.test///")).toBe("http://proxy.test/v1/messages");
    expect(performance.now() - started).toBeLessThan(100);
  });
});

describe("the module", () => {
  it("declares that each procedure reads and writes the network, deletes nothing and is not idempotent", () => {
    expect(llmModule.procedures.map((procedure) => procedure.path.join("."))).toEqual(["llm.complete", "llm.structured", "llm.stream"]);
    for (const procedure of llmModule.procedures) {
      expect(effectsOf(procedure)).toEqual({ reads: ["network"], writes: ["network"], destructive: false, idempotent: false });
    }
  });

  it("marks llm.complete and llm.stream as data-driven, and llm.stream as a stream with an end", () => {
    const [complete, structured, stream] = llmModule.procedures;
    expect(isDataDriven(complete!)).toBe(true);
    expect(isDataDriven(stream!)).toBe(true);
    expect(isDataDriven(structured!)).toBe(false);
    // The registry keeps a copy of each procedure: the copy is data-driven too
    expect(isDataDriven(createRegistry(createLlmModule({ retries: 1 })).get(["llm", "complete"])!)).toBe(true);
    expect(isDataDriven(createRegistry(createLlmModule({ retries: 1 })).get(["llm", "stream"])!)).toBe(true);
    expect(takesRawInput(complete!)).toBe(false);
    expect(takesRawInput(stream!)).toBe(false);
    expect(stream!.metadata).toMatchObject({ streaming: true, stream: { unbounded: false } });
  });

  it("refuses bad retries and a bad backoff", () => {
    expect(() => createLlmModule({ retries: 11 })).toThrow(/retries/);
    expect(() => createLlmModule({ retries: 1.5 })).toThrow(/retries/);
    expect(() => createLlmModule({ backoff: { base: -1 } })).toThrow(/backoff/);
  });
});
