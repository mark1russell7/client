/**
 * The journey of one call, for the Architecture page.
 *
 * The page shows how one call goes through the layers of the ecosystem and how its items come
 * back. Nothing here is a drawing of an imagined flow: the journey runs the real parts of
 * `@procedures/client` and records each step when it happens.
 *
 * - The app calls a streaming procedure, `shop.receipt`, through a `Client` with the real retry
 *   and timeout middlewares (for MCP, Claude Code is the client).
 * - "In process": the real `LocalTransport` runs the procedure with `invokeProcedure`.
 * - HTTP, WebSocket and MCP: the page has no network, so a small transport encodes the request as
 *   the real transport writes it (the HTTP request, the WebSocket frame, the JSON-RPC message), and
 *   gives it to a real `ProcedureServer`. The server runs the procedure with `invokeProcedure` and
 *   its interceptors: the real tracing interceptor, and for MCP the real time limit of a tool call.
 * - The input and the output of `shop.receipt` have a Standard Schema validator that records each
 *   validation, so the journey shows where `invokeProcedure` validates.
 * - The handler calls `client.sum` and `client.multiply` as nested calls, then yields one line for
 *   each price and one for the total: a stream of items that goes up through each layer.
 */

import {
  LocalTransport,
  ProcedureRegistry,
  ProcedureServer,
  allCoreProcedures,
  defineProcedure,
  methodToPath,
  pathToMethod,
  timeoutInterceptor,
  tracingInterceptor,
  type Interceptor,
  type ProcedureContext,
} from "@procedures/client/browser";
import {
  Client,
  createRetryMiddleware,
  createTimeoutMiddleware,
  type ClientContext,
  type ClientMiddleware,
  type ClientRunner,
  type Message,
  type ResponseItem,
  type Transport,
} from "@procedures/client/client";

import { lanesOf, type Host, type Journey, type JourneyStep } from "./journey-info";
import { minutes, ms, seconds } from "@procedures/client/browser";

export { HOSTS, LANE_INFO, lanesOf } from "./journey-info";
export type { Host, Journey, JourneyStep, Lane } from "./journey-info";

/** The input of the call. */
export const JOURNEY_INPUT: { prices: number[]; taxRate: number } = { prices: [2.5, 5.5], taxRate: 0.25 };

// ---------------------------------------------------------------------------
// The procedure
// ---------------------------------------------------------------------------

interface ReceiptInput {
  prices: number[];
  taxRate: number;
}

type Record_ = (step: Omit<JourneyStep, "at">) => void;

/** A Standard Schema validator (no library) that records each validation. */
function recordingSchema<T>(
  check: (value: unknown) => string | null,
  onValidate: (value: unknown, problem: string | null) => void,
): { "~standard": { version: 1; vendor: string; validate: (value: unknown) => { value: T } | { issues: Array<{ message: string }> } } } {
  return {
    "~standard": {
      version: 1,
      vendor: "site-journey",
      validate: (value: unknown) => {
        const problem = check(value);
        onValidate(value, problem);
        return problem === null ? { value: value as T } : { issues: [{ message: problem }] };
      },
    },
  };
}

function money(value: number): string {
  return value.toFixed(2);
}

function receiptProcedure(record: Record_) {
  let itemCount = 0;
  const input = recordingSchema<ReceiptInput>(
    (value) => {
      const candidate = value as Partial<ReceiptInput> | null;
      if (!candidate || !Array.isArray(candidate.prices) || candidate.prices.length === 0) return "prices must be a list of numbers";
      if (!candidate.prices.every((price) => typeof price === "number" && Number.isFinite(price))) return "each price must be a number";
      if (typeof candidate.taxRate !== "number" || candidate.taxRate < 0 || candidate.taxRate > 1) return "taxRate must be from 0 to 1";
      return null;
    },
    (_value, problem) =>
      record({
        lane: "validation",
        direction: "down",
        title: problem ? `The input is not valid: ${problem}.` : "invokeProcedure validates the input with the input schema of the procedure.",
        detail: "input: { prices: number[] (one or more), taxRate: number from 0 to 1 }",
      }),
  );
  const output = recordingSchema<string>(
    (value) => (typeof value === "string" ? null : "an item must be a text"),
    (value, problem) => {
      itemCount++;
      record({
        lane: "validation",
        direction: "up",
        item: itemCount,
        title: problem ? `Item ${itemCount} is not valid: ${problem}.` : `invokeProcedure validates item ${itemCount} with the output schema.`,
        detail: JSON.stringify(value),
      });
    },
  );

  return defineProcedure({
    path: ["shop", "receipt"],
    input: input as never,
    output: output as never,
    metadata: {
      description: "The lines of a receipt: one for each price, then the total with tax",
      calls: ["client.sum", "client.multiply"],
    },
    handler: async function* (args: ReceiptInput, ctx: ProcedureContext): AsyncGenerator<string> {
      record({ lane: "handler", direction: "down", title: "The handler of shop.receipt starts.", detail: `handler(${JSON.stringify(args)}, ctx)` });

      const nested = async <T>(path: [string, string], nestedInput: unknown): Promise<T> => {
        // path-check: the name of the procedure in the text of the story.
        const key = path.join(".");
        record({ lane: "handler", direction: "down", title: `The handler calls ${key} through ctx.client.`, detail: `await ctx.client.call(["${path[0]}", "${path[1]}"], ${JSON.stringify(nestedInput)})` });
        const value = await ctx.client.call<unknown, T>(path, nestedInput);
        record({ lane: "handler", direction: "up", title: `${key} gives ${JSON.stringify(value)} to the handler.` });
        return value;
      };

      const subtotal = await nested<number>(["client", "sum"], { values: args.prices });
      const total = await nested<number>(["client", "multiply"], { a: subtotal, b: 1 + args.taxRate });

      let index = 0;
      for (const price of args.prices) {
        index++;
        const line = `Item ${index}: ${money(price)}`;
        record({ lane: "handler", direction: "up", item: index, title: `The handler yields item ${index}.`, detail: `yield ${JSON.stringify(line)}` });
        yield line;
      }
      const totalLine = `Total with tax: ${money(total)}`;
      record({ lane: "handler", direction: "up", item: index + 1, title: `The handler yields item ${index + 1}, the last one.`, detail: `yield ${JSON.stringify(totalLine)}` });
      yield totalLine;
      record({ lane: "handler", direction: "here", title: "The handler returns: the stream ends." });
    },
  });
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

/** A probe around a real client middleware: it records where the call and its items are. */
function probe(lane: "retry" | "timeout", middleware: ClientMiddleware, record: Record_, describe: string): ClientMiddleware {
  return <TReq, TRes>(next: ClientRunner<TReq, TRes>): ClientRunner<TReq, TRes> => {
    let attempts = 0;
    const tapped: ClientRunner<TReq, TRes> = (context: ClientContext<TReq>) => {
      attempts++;
      record({
        lane,
        direction: "down",
        title: attempts === 1 ? `The ${lane} middleware passes the request on.` : `The ${lane} middleware starts attempt ${attempts}.`,
      });
      return next(context);
    };
    const run = (middleware as ClientMiddleware<TReq, TRes>)(tapped);
    return async function* (context: ClientContext<TReq>) {
      record({ lane, direction: "down", title: `The ${lane} middleware gets the request.`, detail: describe });
      let item = 0;
      try {
        for await (const response of run(context)) {
          item++;
          record({
            lane,
            direction: "up",
            item,
            title: response.status.type === "success" ? `Item ${item} goes up through the ${lane} middleware.` : `An error item goes up through the ${lane} middleware.`,
          });
          yield response;
        }
      } catch (error) {
        record({ lane, direction: "up", title: `An error leaves the ${lane} middleware: ${error instanceof Error ? error.message : String(error)}.` });
        throw error;
      }
    };
  };
}

/** An interceptor that records each item of a stream when it leaves the interceptors. */
function itemProbe(record: Record_): Interceptor {
  return async (invocation, next) => {
    const output = await next();
    if (output.kind !== "stream" || invocation.depth > 0) return output;
    const items = output.items;
    return {
      kind: "stream",
      items: (async function* () {
        let item = 0;
        for await (const value of items) {
          item++;
          record({ lane: "interceptor", direction: "up", item, title: `Item ${item} leaves the interceptors.` });
          yield value;
        }
      })(),
    };
  };
}

function tracing(record: Record_): Interceptor {
  return tracingInterceptor({
    onStart: (span) =>
      record({
        lane: span.depth > 0 ? "nested" : "interceptor",
        direction: "down",
        title:
          span.depth > 0
            ? `The tracing interceptor opens a span for the nested call ${span.key}.`
            : `The tracing interceptor opens a span for ${span.key}.`,
        detail: `span ${span.id}${span.parentId ? `, parent ${span.parentId}` : ", no parent: a call of the host"}`,
      }),
    onSpan: (span) =>
      record({
        lane: span.depth > 0 ? "nested" : "interceptor",
        direction: span.depth > 0 ? "up" : "here",
        title:
          span.depth > 0
            ? `The nested call ${span.key} ends: its span closes (${span.status}).`
            : `The span of ${span.key} closes: ${span.status}, ${span.items ?? 0} items.`,
        detail: `${(span.durationMs ?? 0).toFixed(2)} ms`,
      }),
  });
}

// ---------------------------------------------------------------------------
// The wire
// ---------------------------------------------------------------------------

let wireId = 0;

function httpRequest(path: string[], payload: unknown): string {
  const method = pathToMethod(path);
  return [
    `POST /api/${method.service}/${method.operation} HTTP/1.1`,
    "Host: 127.0.0.1:3000",
    "Content-Type: application/json",
    "Accept: application/x-ndjson, application/json",
    "Authorization: Bearer <the token of the server>",
    "",
    JSON.stringify(payload),
  ].join("\n");
}

/**
 * A transport for the hosts with a wire. It encodes the request as the real transport writes it,
 * gives it to the real `ProcedureServer`, and encodes each item of the answer.
 */
class WireTransport implements Transport {
  readonly name = "wire";

  constructor(
    private readonly host: "http" | "websocket",
    private readonly server: ProcedureServer,
    private readonly record: Record_,
  ) {}

  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    const id = `${message.id}~${++wireId}`;
    const transportName = this.host === "http" ? "HttpTransport" : "WebSocketTransport";
    const request =
      this.host === "http"
        ? httpRequest(methodToPath(message.method), message.payload)
        : JSON.stringify({ id, type: "request", method: message.method, payload: message.payload, metadata: {}, credit: 64 }, null, 2);
    this.record({
      lane: "transport",
      direction: "down",
      title: `${transportName} turns the method ${message.method.service}.${message.method.operation} into ${this.host === "http" ? "a URL" : "a request frame"}.`,
      detail: `pathToMethod(["shop", "receipt"]) = ${JSON.stringify(message.method)}`,
    });
    this.record({
      lane: "wire",
      direction: "down",
      title: this.host === "http" ? "The request goes over the wire." : "The request frame goes over the WebSocket.",
      detail: request,
    });
    this.record({
      lane: "server",
      direction: "down",
      title: `${this.host === "http" ? "HttpServerTransport" : "WebSocketServerTransport"} checks the browser rules, reads the request and calls ProcedureServer.handle.`,
      detail: "checkBrowserRequest: Host, Origin, Sec-Fetch-Site" + (this.host === "http" ? ", the method (POST) and the JSON body" : ""),
    });

    const response = await this.server.handle<TReq, TRes>({ id: message.id, method: message.method, payload: message.payload, metadata: {} });
    if (response.status.type !== "success") {
      const status = response.status as { code?: string; message?: string };
      this.record({ lane: "wire", direction: "up", title: `The server answers with an error: ${status.code}.`, detail: status.message });
      yield { id: message.id, status: response.status, payload: null as TRes, metadata: {} };
      return;
    }
    if (this.host === "http") {
      this.record({ lane: "wire", direction: "up", title: "The server answers 200 with NDJSON: the client asked for it in Accept.", detail: "HTTP/1.1 200 OK\nContent-Type: application/x-ndjson" });
    }

    const values: AsyncIterable<unknown> = response.stream ?? (async function* () {
      yield response.payload;
    })();
    let item = 0;
    for await (const value of values) {
      item++;
      this.record({
        lane: "wire",
        direction: "up",
        item,
        title: this.host === "http" ? `Item ${item} goes over the wire as one NDJSON line.` : `Item ${item} goes over the WebSocket as a stream frame.`,
        detail:
          this.host === "http"
            ? JSON.stringify({ type: "item", seq: item, payload: value })
            : JSON.stringify({ id, type: "stream", seq: item, payload: value, stream: { done: false } }),
      });
      this.record({ lane: "transport", direction: "up", item, title: `${transportName} reads item ${item} and gives it to the middleware.` });
      yield { id: message.id, status: { type: "success", code: 200 }, payload: value as TRes, metadata: {} };
    }
    this.record({
      lane: "wire",
      direction: "up",
      title: this.host === "http" ? "The last line tells the client that the stream is done." : "The end frame tells the client that the stream is done.",
      detail: this.host === "http" ? JSON.stringify({ type: "done", seq: item + 1 }) : JSON.stringify({ id, type: "stream", seq: item + 1, stream: { done: true } }),
    });
  }

  async close(): Promise<void> {}
}

/** A probe around LocalTransport (the in-process host). */
class LocalProbe implements Transport {
  readonly name = "local-probe";

  constructor(
    private readonly inner: LocalTransport,
    private readonly record: Record_,
  ) {}

  async *send<TReq, TRes>(message: Message<TReq>): AsyncIterable<ResponseItem<TRes>> {
    this.record({
      lane: "transport",
      direction: "down",
      title: "LocalTransport finds shop.receipt in the registry and calls invokeProcedure. It encodes nothing.",
      detail: `registry.get(["shop", "receipt"])`,
    });
    let item = 0;
    for await (const response of this.inner.send<TReq, TRes>(message)) {
      item++;
      this.record({ lane: "transport", direction: "up", item, title: `LocalTransport gives item ${item} to the middleware.` });
      yield response;
    }
  }

  async close(): Promise<void> {}
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

function registryWith(record: Record_): ProcedureRegistry {
  const registry = new ProcedureRegistry();
  for (const procedure of allCoreProcedures) registry.register(procedure);
  registry.register(receiptProcedure(record) as never);
  return registry;
}

/** This function runs the journey of one call over a host, and gives each step. */
export async function runJourney(host: Host, input: unknown = JOURNEY_INPUT): Promise<Journey> {
  const steps: JourneyStep[] = [];
  const started = performance.now();
  const record: Record_ = (step) => steps.push({ ...step, at: Math.round((performance.now() - started) * 100) / 100 });
  const registry = registryWith(record);
  const items: string[] = [];

  if (host === "mcp") {
    return runMcp(registry, record, steps, started, input);
  }

  record({
    lane: "app",
    direction: "down",
    title: "The app calls client.stream: it wants each item as it arrives.",
    detail: `for await (const line of client.stream(["shop", "receipt"], ${JSON.stringify(input)})) …`,
  });

  let transport: Transport;
  if (host === "local") {
    transport = new LocalProbe(new LocalTransport({ registry }), record);
  } else {
    const server = new ProcedureServer({ registry, autoRegister: true, interceptors: [tracing(record), itemProbe(record)] });
    transport = new WireTransport(host, server, record);
  }

  // The first middleware that `use` adds is the outer one: retry outside, the timeout of each attempt inside it
  const client = new Client({ transport, throwOnError: true })
    .use(probe("retry", createRetryMiddleware({ maxRetries: 2, retryDelay: ms(100) }) as ClientMiddleware, record, "createRetryMiddleware({ maxRetries: 2, retryDelay: ms(100) })") as never)
    .use(probe("timeout", createTimeoutMiddleware({ perAttempt: seconds(5) }) as ClientMiddleware, record, "createTimeoutMiddleware({ perAttempt: seconds(5) })") as never);

  try {
    let item = 0;
    for await (const line of client.stream<unknown, string>({ service: "shop", operation: "receipt" }, input)) {
      item++;
      items.push(line);
      record({ lane: "app", direction: "up", item, title: `The app gets item ${item}.`, detail: JSON.stringify(line) });
    }
    record({ lane: "app", direction: "here", title: `The stream ends. The app has ${items.length} items.` });
    return { host, lanes: lanesOf(host), steps, items, ok: true, duration: performance.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record({ lane: "app", direction: "here", title: `The call fails: ${message}` });
    return { host, lanes: lanesOf(host), steps, items, ok: false, error: message, duration: performance.now() - started };
  }
}

/** The MCP host: Claude Code is the client, and the MCP server transport gives the call to ProcedureServer. */
async function runMcp(registry: ProcedureRegistry, record: Record_, steps: JourneyStep[], started: number, input: unknown): Promise<Journey> {
  const items: string[] = [];
  const toolName = "shop_receipt";
  const progressToken = "p1";
  record({
    lane: "app",
    direction: "down",
    title: `Claude Code calls the tool ${toolName}, with a progress token.`,
    detail: "The tool list gave the name and the JSON Schema of the input.",
  });
  record({
    lane: "wire",
    direction: "down",
    title: "The JSON-RPC request goes to the MCP server (stdio).",
    detail: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: toolName, arguments: input, _meta: { progressToken } } }, null, 2),
  });
  record({
    lane: "transport",
    direction: "down",
    title: `McpServerTransport turns the tool name ${toolName} into the method shop.receipt and calls ProcedureServer.handle.`,
    detail: `pathToMethod(["shop", "receipt"]) = ${JSON.stringify(pathToMethod(["shop", "receipt"]))}`,
  });
  record({
    lane: "server",
    direction: "down",
    title: "ProcedureServer finds shop.receipt. The MCP server serves only the exposed tools, and strictCalls limits their nested calls.",
  });

  const timeLimit = timeoutInterceptor({ limit: minutes(10) });
  const server = new ProcedureServer({ registry, autoRegister: true, interceptors: [timeLimit, tracing(record), itemProbe(record)] });
  const response = await server.handle<unknown, string>({ id: "1", method: pathToMethod(["shop", "receipt"]), payload: input, metadata: {} });
  if (response.status.type !== "success") {
    const status = response.status as { code?: string; message?: string };
    record({ lane: "app", direction: "here", title: `The tool call fails: ${status.code}.`, detail: status.message });
    return { host: "mcp", lanes: lanesOf("mcp"), steps, items, ok: false, error: status.message, duration: performance.now() - started };
  }
  const values: AsyncIterable<string> = response.stream ?? (async function* () {
    yield response.payload as string;
  })();
  let item = 0;
  for await (const value of values) {
    item++;
    items.push(value);
    record({
      lane: "transport",
      direction: "up",
      item,
      title: `McpServerTransport reads item ${item} and sends a progress notification.`,
    });
    record({
      lane: "wire",
      direction: "up",
      item,
      title: `Item ${item} goes to Claude Code as a progress notification.`,
      detail: JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress", params: { progressToken, progress: item, message: value } }),
    });
    record({ lane: "app", direction: "up", item, title: `Claude Code shows the progress of item ${item}.` });
  }
  record({
    lane: "wire",
    direction: "up",
    title: "The result goes to Claude Code: one text block for each item.",
    detail: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: items.map((text) => ({ type: "text", text })) } }, null, 2),
  });
  record({ lane: "app", direction: "here", title: `The tool call ends. Claude Code has ${items.length} text blocks.` });
  return { host: "mcp", lanes: lanesOf("mcp"), steps, items, ok: true, duration: performance.now() - started };
}
