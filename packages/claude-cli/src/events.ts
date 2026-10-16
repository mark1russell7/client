/**
 * The normaliser of the output of `claude -p --output-format stream-json --verbose`.
 *
 * Each line of that output is one JSON object. The normaliser turns one line into zero or more
 * events of a small, stable set. It is pure: it reads no file and keeps no state.
 */

/** The start of a session: the `system` line of the CLI. */
export interface ClaudeMetaEvent {
  readonly type: "meta";
  /** The subtype of the `system` line, for example `init`. */
  readonly subtype?: string;
  readonly sessionId?: string;
  readonly model?: string;
  readonly cwd?: string;
  readonly tools?: readonly string[];
  readonly permissionMode?: string;
}

/** A text block of the assistant. */
export interface ClaudeTextEvent {
  readonly type: "text";
  readonly text: string;
}

/** A part of a text block, with `--include-partial-messages`. */
export interface ClaudeTextDeltaEvent {
  readonly type: "text-delta";
  readonly text: string;
}

/** A thinking block of the assistant. The CLI gives an empty block in `-p` mode, and the normaliser drops it. */
export interface ClaudeThinkingEvent {
  readonly type: "thinking";
  readonly text: string;
}

/** A tool call of the assistant. */
export interface ClaudeToolUseEvent {
  readonly type: "tool-use";
  readonly id?: string;
  readonly name: string;
  readonly input: unknown;
}

/** The result of a tool call, as text. */
export interface ClaudeToolResultEvent {
  readonly type: "tool-result";
  readonly toolUseId?: string;
  readonly output: string;
  readonly isError: boolean;
}

/** The last line of a turn: the final text, the session, the cost and the duration. */
export interface ClaudeResultEvent {
  readonly type: "result";
  /** The subtype, for example `success` or `error_max_turns`. */
  readonly subtype?: string;
  readonly isError: boolean;
  /** The final text of the assistant. */
  readonly text?: string;
  /** The session. Give it to `--resume` for the next turn. */
  readonly sessionId?: string;
  /** The cost of the turn, in US dollars. */
  readonly costUsd?: number;
  readonly durationMs?: number;
  /** The number of model turns. */
  readonly turns?: number;
  readonly usage?: Readonly<Record<string, unknown>>;
  readonly errors?: readonly string[];
}

/** A line that is not JSON. The CLI writes its errors and warnings as text. */
export interface ClaudeLogEvent {
  readonly type: "log";
  readonly text: string;
}

/** An error of the turn, for example a process that ended without a result. The normaliser does not make it. */
export interface ClaudeErrorEvent {
  readonly type: "error";
  readonly message: string;
}

/** One normalised event of a turn. */
export type ClaudeEvent =
  | ClaudeMetaEvent
  | ClaudeTextEvent
  | ClaudeTextDeltaEvent
  | ClaudeThinkingEvent
  | ClaudeToolUseEvent
  | ClaudeToolResultEvent
  | ClaudeResultEvent
  | ClaudeLogEvent
  | ClaudeErrorEvent;

/** The types of the events. */
export type ClaudeEventType = ClaudeEvent["type"];

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** The fields of `T`: a field that can be `undefined` becomes optional. */
type Optional<T> = { [K in keyof T as undefined extends T[K] ? never : K]: T[K] } & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<T[K], undefined>;
};

/** This function gives the fields whose value is not `undefined`. */
function defined<T extends Json>(fields: T): Optional<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Optional<T>;
}

/**
 * This function gives a value as text with a maximum length. It adds `…` when it cuts the text.
 * The normaliser does not cut. A caller uses this function for a short preview.
 */
export function preview(value: unknown, max = 400): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text === undefined) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** This function gives the content of a tool result as text. A block that is not text gives `[type]`. */
export function toolResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block: unknown) => {
        if (typeof block === "string") return block;
        if (isObject(block)) return typeof block["text"] === "string" ? block["text"] : `[${str(block["type"]) ?? "block"}]`;
        return "";
      })
      .join("\n");
  }
  return content === undefined || content === null ? "" : JSON.stringify(content);
}

function metaEvent(line: Json): ClaudeMetaEvent {
  const tools = Array.isArray(line["tools"]) ? line["tools"].filter((tool): tool is string => typeof tool === "string") : undefined;
  return defined({
    type: "meta" as const,
    subtype: str(line["subtype"]),
    sessionId: str(line["session_id"]),
    model: str(line["model"]),
    cwd: str(line["cwd"]),
    tools,
    permissionMode: str(line["permissionMode"]),
  });
}

function messageEvents(line: Json): ClaudeEvent[] {
  const message = line["message"];
  const content = isObject(message) && Array.isArray(message["content"]) ? (message["content"] as unknown[]) : [];
  const fromAssistant = line["type"] === "assistant";
  const events: ClaudeEvent[] = [];
  for (const block of content) {
    if (!isObject(block)) continue;
    const kind = block["type"];
    if (fromAssistant && kind === "text") {
      const text = str(block["text"]);
      if (text) events.push({ type: "text", text });
    } else if (fromAssistant && kind === "thinking") {
      const text = str(block["thinking"]);
      if (text) events.push({ type: "thinking", text });
    } else if (kind === "tool_use") {
      const id = str(block["id"]);
      events.push({ type: "tool-use", ...(id !== undefined ? { id } : {}), name: str(block["name"]) ?? "tool", input: block["input"] ?? {} });
    } else if (kind === "tool_result") {
      events.push(
        defined({
          type: "tool-result" as const,
          toolUseId: str(block["tool_use_id"]),
          output: toolResultText(block["content"]),
          isError: block["is_error"] === true,
        })
      );
    }
  }
  return events;
}

function resultEvent(line: Json): ClaudeResultEvent {
  const errors = Array.isArray(line["errors"]) ? line["errors"].filter((error): error is string => typeof error === "string") : undefined;
  return defined({
    type: "result" as const,
    subtype: str(line["subtype"]),
    isError: line["is_error"] === true,
    text: str(line["result"]),
    sessionId: str(line["session_id"]),
    costUsd: num(line["total_cost_usd"]) ?? num(line["cost_usd"]),
    durationMs: num(line["duration_ms"]),
    turns: num(line["num_turns"]),
    usage: isObject(line["usage"]) ? line["usage"] : undefined,
    errors: errors !== undefined && errors.length > 0 ? errors : undefined,
  });
}

function streamEvents(line: Json): ClaudeEvent[] {
  const event = line["event"];
  if (!isObject(event) || event["type"] !== "content_block_delta") return [];
  const delta = event["delta"];
  if (!isObject(delta) || delta["type"] !== "text_delta") return [];
  const text = str(delta["text"]);
  return text ? [{ type: "text-delta", text }] : [];
}

/**
 * This function normalises one line of `claude -p --output-format stream-json --verbose`. An
 * empty line or an unknown JSON object gives no event. A line that is not JSON gives a `log` event.
 */
export function normalizeLine(line: string): ClaudeEvent[] {
  const trimmed = line.trim();
  if (trimmed.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [{ type: "log", text: trimmed }];
  }
  if (!isObject(parsed)) return [];
  switch (parsed["type"]) {
    case "system":
      return [metaEvent(parsed)];
    case "assistant":
    case "user":
      return messageEvents(parsed);
    case "result":
      return [resultEvent(parsed)];
    case "stream_event":
      return streamEvents(parsed);
    default:
      return [];
  }
}

/** This function normalises each line of a text. */
export function normalizeText(text: string): ClaudeEvent[] {
  return text.split("\n").flatMap((line) => normalizeLine(line));
}
