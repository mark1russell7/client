/**
 * http.sse procedure
 *
 * Read a stream of server-sent events. The procedure sends a GET with
 * `accept: text/event-stream`, and each event is one item: its type, its data and the last event
 * ID. The procedure does not connect again after the end of the stream. To continue, a caller
 * sends the last ID in `lastEventId`. The stream can run without an end (roadmap R15).
 *
 * The call waits for the status of the response. A refused host, a failed connection, a status
 * outside 200 to 299 and another content type fail the call itself, before the first item.
 */

import { HttpError } from "../../errors.js";
import { DEFAULT_ITEM_BYTES, DEFAULT_SETTINGS, exchange, headerText, isOk, prepare, statusError, touching, type Exchange, type HttpSettings } from "../../exchange.js";
import { sseEvents } from "../../parsers.js";
import { CallScope, type ScopeContext } from "../../scope.js";
import type { HttpSseInput, HttpSseOutput } from "../../types.js";

const PATH = ["http", "sse"];

/** The events of an open response. The end of the generator closes the connection. */
async function* events(opened: Exchange, scope: CallScope, maxEventBytes: number): AsyncGenerator<HttpSseOutput, void, undefined> {
  try {
    scope.touch();
    for await (const event of sseEvents(touching(opened.body, scope), maxEventBytes, "http.sse")) {
      // The idle time does not run while the reader holds the item
      scope.pause();
      yield event;
      scope.touch();
    }
  } catch (error) {
    throw scope.translate(error);
  } finally {
    opened.body.destroy();
    opened.close();
    scope.dispose();
  }
}

/**
 * Read a stream of server-sent events
 */
export async function httpSse(input: HttpSseInput, ctx: ScopeContext = {}, settings: HttpSettings = DEFAULT_SETTINGS): Promise<AsyncGenerator<HttpSseOutput, void, undefined>> {
  const headers: Record<string, string> = { accept: "text/event-stream", "cache-control": "no-cache" };
  if (input.lastEventId !== undefined) headers["last-event-id"] = input.lastEventId;
  const prepared = prepare({ ...input, method: "GET" }, PATH, settings, { headers });
  const scope = new CallScope(PATH, ctx, { timeoutMs: input.timeoutMs, idleTimeoutMs: input.idleTimeoutMs });
  let opened: Exchange | undefined;
  try {
    opened = await exchange(prepared, settings.policy, scope);
    const status = opened.response.statusCode ?? 0;
    if (!isOk(status)) throw await statusError(opened, scope);
    const type = headerText(opened.response.headers["content-type"]) ?? "";
    if (!type.toLowerCase().startsWith("text/event-stream")) {
      throw new HttpError("BAD_CONTENT_TYPE", `http.sse: the content type of the response is ${JSON.stringify(type)}, not text/event-stream`, status);
    }
  } catch (error) {
    opened?.close();
    scope.dispose();
    throw scope.translate(error);
  }
  // The idle time starts again when the reader asks for the first event
  scope.pause();
  return events(opened, scope, input.maxEventBytes ?? DEFAULT_ITEM_BYTES);
}
