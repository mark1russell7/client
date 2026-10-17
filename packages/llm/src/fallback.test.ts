/**
 * The tool loop after a server-side fallback in the middle of an answer (tracker O34). The next
 * turn drops the blocks of the model that declined, as the API docs say ("Refusals and fallback",
 * "Continuing the conversation"), and the loop runs only the tool uses that it sends back.
 */

import { describe, expect, it } from "vitest";
import { continuationOf } from "./loop.js";
import type { ContentBlock } from "./anthropic.js";
import type { LlmCompleteOutput } from "./types.js";
import { message, setup, text, toolProcedures as fakes, toolUse } from "../test/fakes.js";

const fallback = { type: "fallback", from: { model: "claude-fable-5-1" }, to: { model: "claude-sonnet-5-5" } };

describe("continuationOf", () => {
  it("keeps an answer without a fallback block as it came, in a new array", () => {
    const content = [{ type: "thinking", thinking: "x", signature: "s" }, text("a"), toolUse("t1", "x", {})];
    const out = continuationOf(content as ContentBlock[]);
    expect(out).toEqual(content);
    expect(out).not.toBe(content);
  });

  it("drops the thinking, connector text, client tool uses and unpaired server tool uses before the final fallback", () => {
    const content = [
      { type: "thinking", thinking: "declined", signature: "s1" },
      { type: "redacted_thinking", data: "r" },
      { type: "connector_text", text: "c" },
      text("partial"),
      toolUse("t1", "weather_current", { city: "Paris" }),
      { type: "server_tool_use", id: "s1", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
      { type: "server_tool_use", id: "s2", name: "web_search", input: {} },
      fallback,
      { type: "thinking", thinking: "served", signature: "s3" },
      text("answer"),
      toolUse("t2", "weather_current", { city: "Rome" }),
    ];
    expect(continuationOf(content as ContentBlock[])).toEqual([
      text("partial"),
      { type: "server_tool_use", id: "s1", name: "web_search", input: {} },
      { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
      fallback,
      { type: "thinking", thinking: "served", signature: "s3" },
      text("answer"),
      toolUse("t2", "weather_current", { city: "Rome" }),
    ]);
  });

  it("drops only before the final fallback when an answer has two", () => {
    const second = { ...fallback, to: { model: "claude-haiku-5-5" } };
    const content = [{ type: "thinking", thinking: "a", signature: "1" }, fallback, { type: "thinking", thinking: "b", signature: "2" }, second, text("c")];
    expect(continuationOf(content as ContentBlock[])).toEqual([fallback, second, text("c")]);
  });

  it("keeps a server tool use whose result comes after the fallback", () => {
    const content = [{ type: "server_tool_use", id: "s1", name: "web_fetch", input: {} }, fallback, { type: "web_fetch_tool_result", tool_use_id: "s1", content: {} }];
    expect(continuationOf(content as ContentBlock[])).toEqual(content);
  });
});

describe("the tool loop after a fallback", () => {
  it("runs only the tool use after the fallback, and sends the answer back without the blocks of the declining model", async () => {
    const { got, module } = fakes();
    const first = message(
      [
        { type: "thinking", thinking: "declined", signature: "s1" },
        toolUse("toolu_old", "weather_current", { city: "Paris" }),
        fallback,
        text("Let me check."),
        toolUse("toolu_new", "weather_current", { city: "Rome" }),
      ],
      { stop_reason: "tool_use" },
    );
    const { call, sent } = setup([first, message([text("It is 21 degrees in Rome.")])], {}, [module]);
    const result = await call<LlmCompleteOutput>("llm.complete", { prompt: "Weather?", procedures: ["weather.current"] });

    expect(got).toEqual([{ city: "Rome" }]);
    expect(result.toolCalls.map((each) => each.id)).toEqual(["toolu_new"]);
    expect(sent[1]!.body["messages"]).toEqual([
      { role: "user", content: "Weather?" },
      { role: "assistant", content: [fallback, text("Let me check."), toolUse("toolu_new", "weather_current", { city: "Rome" })] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_new", content: JSON.stringify({ city: "Rome", celsius: 21 }) }] },
    ]);
  });
});
