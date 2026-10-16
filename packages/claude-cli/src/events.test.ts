/**
 * The normaliser, with made-up lines in the form of `claude -p --output-format stream-json --verbose`.
 */

import { describe, expect, it } from "vitest";
import { normalizeLine, normalizeText, preview, toolResultText } from "./events.js";

const line = (value: unknown): string => JSON.stringify(value);

const INIT = line({
  type: "system",
  subtype: "init",
  session_id: "00000000-0000-4000-8000-000000000001",
  model: "example-model",
  cwd: "/work/example",
  tools: ["Read", "Bash", 7],
  permissionMode: "default",
});

describe("normalizeLine", () => {
  it("gives a meta event for the system line", () => {
    expect(normalizeLine(INIT)).toEqual([
      {
        type: "meta",
        subtype: "init",
        sessionId: "00000000-0000-4000-8000-000000000001",
        model: "example-model",
        cwd: "/work/example",
        tools: ["Read", "Bash"],
        permissionMode: "default",
      },
    ]);
    expect(normalizeLine(line({ type: "system", subtype: "compact_boundary" }))).toEqual([{ type: "meta", subtype: "compact_boundary" }]);
  });

  it("gives the text, thinking and tool calls of an assistant line, in order", () => {
    const events = normalizeLine(
      line({
        type: "assistant",
        message: {
          content: [
            { type: "thinking", thinking: "First, read the file." },
            { type: "text", text: "I read the file." },
            { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "/work/example/a.txt" } },
            { type: "tool_use" },
          ],
        },
      })
    );
    expect(events).toEqual([
      { type: "thinking", text: "First, read the file." },
      { type: "text", text: "I read the file." },
      { type: "tool-use", id: "tool-1", name: "Read", input: { file_path: "/work/example/a.txt" } },
      { type: "tool-use", name: "tool", input: {} },
    ]);
  });

  it("drops an empty thinking block, an empty text and a block that is not an object", () => {
    const events = normalizeLine(
      line({
        type: "assistant",
        message: { content: [{ type: "thinking", thinking: "", signature: "abc" }, { type: "text", text: "" }, "loose", null, { type: "redacted_thinking" }] },
      })
    );
    expect(events).toEqual([]);
    expect(normalizeLine(line({ type: "assistant" }))).toEqual([]);
    expect(normalizeLine(line({ type: "assistant", message: { content: "text" } }))).toEqual([]);
  });

  it("gives the tool results of a user line as text, and ignores its text blocks", () => {
    const events = normalizeLine(
      line({
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "tool-1", content: "line one\nline two" },
            { type: "tool_result", tool_use_id: "tool-2", content: [{ type: "text", text: "part" }, { type: "image", source: {} }, "raw", 3], is_error: true },
            { type: "tool_result" },
            { type: "text", text: "Text that the CLI adds" },
          ],
        },
      })
    );
    expect(events).toEqual([
      { type: "tool-result", toolUseId: "tool-1", output: "line one\nline two", isError: false },
      { type: "tool-result", toolUseId: "tool-2", output: "part\n[image]\nraw\n", isError: true },
      { type: "tool-result", output: "", isError: false },
    ]);
  });

  it("gives the result with the session, the cost and the duration", () => {
    const usage = { input_tokens: 12, output_tokens: 34 };
    expect(
      normalizeLine(
        line({
          type: "result",
          subtype: "success",
          is_error: false,
          result: "Done.",
          session_id: "00000000-0000-4000-8000-000000000001",
          total_cost_usd: 0.0123,
          duration_ms: 4567,
          num_turns: 3,
          usage,
        })
      )
    ).toEqual([
      {
        type: "result",
        subtype: "success",
        isError: false,
        text: "Done.",
        sessionId: "00000000-0000-4000-8000-000000000001",
        costUsd: 0.0123,
        durationMs: 4567,
        turns: 3,
        usage,
      },
    ]);
  });

  it("gives an error result, and reads cost_usd of older versions", () => {
    expect(normalizeLine(line({ type: "result", subtype: "error_max_turns", is_error: true, cost_usd: 0.5, errors: ["Too many turns", 1] }))).toEqual([
      { type: "result", subtype: "error_max_turns", isError: true, costUsd: 0.5, errors: ["Too many turns"] },
    ]);
    expect(normalizeLine(line({ type: "result", total_cost_usd: Number.NaN, errors: [] }))).toEqual([{ type: "result", isError: false }]);
  });

  it("gives the text deltas of partial messages", () => {
    expect(normalizeLine(line({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Hel" } } }))).toEqual([
      { type: "text-delta", text: "Hel" },
    ]);
    expect(normalizeLine(line({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "input_json_delta" } } }))).toEqual([]);
    expect(normalizeLine(line({ type: "stream_event", event: { type: "message_start" } }))).toEqual([]);
    expect(normalizeLine(line({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "" } } }))).toEqual([]);
  });

  it("gives a log event for a line that is not JSON, and nothing for other lines", () => {
    expect(normalizeLine("Error: an example message\r")).toEqual([{ type: "log", text: "Error: an example message" }]);
    expect(normalizeLine("   ")).toEqual([]);
    expect(normalizeLine("42")).toEqual([]);
    expect(normalizeLine("[1, 2]")).toEqual([]);
    expect(normalizeLine(line({ type: "mystery" }))).toEqual([]);
  });
});

describe("normalizeText", () => {
  it("normalises each line of a text", () => {
    const text = [INIT, line({ type: "assistant", message: { content: [{ type: "text", text: "Hi" }] } }), "", line({ type: "result", result: "Hi" })].join("\n");
    expect(normalizeText(text).map((event) => event.type)).toEqual(["meta", "text", "result"]);
  });
});

describe("preview and toolResultText", () => {
  it("cuts a long text and writes a value as JSON", () => {
    expect(preview("abcdef", 3)).toBe("abc…");
    expect(preview("abc", 3)).toBe("abc");
    expect(preview({ a: 1 })).toBe('{"a":1}');
    expect(preview(undefined)).toBe("");
  });

  it("gives the content of a tool result as text", () => {
    expect(toolResultText(null)).toBe("");
    expect(toolResultText({ a: 1 })).toBe('{"a":1}');
    expect(toolResultText([{ text: "x" }, {}])).toBe("x\n[block]");
  });
});
