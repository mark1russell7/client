/**
 * http.ndjson procedure
 *
 * Read an NDJSON response as a stream of parsed lines. The procedure sends a GET, or a POST with a
 * body of JSON or text. Each line that is not blank is one item: its JSON value. The stream can
 * run without an end, so the procedure declares an unbounded stream (roadmap R15). When the reader
 * stops, the connection closes.
 *
 * The call waits for the status of the response. A refused host, a failed connection and a status
 * outside 200 to 299 fail the call itself, before the first item.
 */

import { HttpError } from "../../errors.js";
import { DEFAULT_ITEM_BYTES, DEFAULT_SETTINGS, excerpt, exchange, isOk, prepareStream, statusError, touching, type Exchange, type HttpSettings } from "../../exchange.js";
import { ndjsonLines } from "../../parsers.js";
import { CallScope, type ScopeContext } from "../../scope.js";
import type { HttpNdjsonInput, HttpNdjsonOutput } from "../../types.js";

const PATH = ["http", "ndjson"];

/** The items of an open response. The end of the generator closes the connection. */
async function* items(opened: Exchange, scope: CallScope, maxLineBytes: number): AsyncGenerator<HttpNdjsonOutput, void, undefined> {
  try {
    scope.touch();
    for await (const line of ndjsonLines(touching(opened.body, scope), maxLineBytes, "http.ndjson")) {
      let value: unknown;
      try {
        value = JSON.parse(line.text) as unknown;
      } catch {
        throw new HttpError("BAD_JSON", `http.ndjson: line ${line.line} is not JSON: ${excerpt(line.text, 80)}`, opened.response.statusCode);
      }
      // The idle time does not run while the reader holds the item
      scope.pause();
      yield value;
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
 * Read an NDJSON response as a stream of parsed lines
 */
export async function httpNdjson(input: HttpNdjsonInput, ctx: ScopeContext = {}, settings: HttpSettings = DEFAULT_SETTINGS): Promise<AsyncGenerator<HttpNdjsonOutput, void, undefined>> {
  const headers = { accept: "application/x-ndjson, application/jsonl;q=0.9, application/json;q=0.8" };
  const prepared = prepareStream(input, PATH, settings, headers);
  const scope = new CallScope(PATH, ctx, { timeoutMs: input.timeoutMs, idleTimeoutMs: input.idleTimeoutMs });
  let opened: Exchange | undefined;
  try {
    opened = await exchange(prepared, settings.policy, scope);
    if (!isOk(opened.response.statusCode ?? 0)) throw await statusError(opened, scope);
  } catch (error) {
    opened?.close();
    scope.dispose();
    throw scope.translate(error);
  }
  // The idle time starts again when the reader asks for the first item
  scope.pause();
  return items(opened, scope, input.maxLineBytes ?? DEFAULT_ITEM_BYTES);
}
