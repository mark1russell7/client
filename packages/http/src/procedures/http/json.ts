/**
 * http.json procedure
 *
 * Send a GET or a POST of JSON and give the parsed JSON response. By default, a status outside
 * 200 to 299 is an error (`HTTP_STATUS`) with the start of the body in its message.
 */

import { HttpError } from "../../errors.js";
import { DEFAULT_SETTINGS, DEFAULT_TIMEOUT_MS, excerpt, exchange, isOk, prepare, readBody, responseHeaders, type HttpSettings } from "../../exchange.js";
import { CallScope, type ScopeContext } from "../../scope.js";
import type { HttpJsonInput, HttpJsonOutput } from "../../types.js";

const PATH = ["http", "json"];

/**
 * Send a GET or a POST of JSON and give the parsed JSON response
 */
export async function httpJson(input: HttpJsonInput, ctx: ScopeContext = {}, settings: HttpSettings = DEFAULT_SETTINGS): Promise<HttpJsonOutput> {
  const method = input.method ?? (input.json !== undefined ? "POST" : "GET");
  if (method === "GET" && input.json !== undefined) throw new Error("http.json: a GET request has no body: use the method POST");
  const body = input.json !== undefined ? Buffer.from(JSON.stringify(input.json), "utf8") : undefined;
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  const prepared = prepare({ ...input, method }, PATH, settings, { headers, body });
  const scope = new CallScope(PATH, ctx, { timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  try {
    const opened = await exchange(prepared, settings.policy, scope);
    const status = opened.response.statusCode ?? 0;
    const limit = Math.min(input.maxResponseBytes ?? settings.maxResponseBytes, settings.maxResponseBytes);
    const bytes = await readBody(opened.body, limit, scope, opened.response);
    const text = bytes.toString("utf8");
    if (!isOk(status) && (input.failOnStatus ?? true)) {
      const reason = opened.response.statusMessage ? ` ${opened.response.statusMessage}` : "";
      throw new HttpError("HTTP_STATUS", `http.json: the server answered ${status}${reason}${text ? `: ${excerpt(text)}` : ""}`, status);
    }
    let data: unknown = null;
    if (text.trim() !== "") {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        // An error page is often HTML: with failOnStatus: false, the output keeps its text
        if (!isOk(status)) data = text;
        else throw new HttpError("BAD_JSON", `http.json: the body of the response is not JSON: ${excerpt(text)}`, status);
      }
    }
    return { status, ok: isOk(status), url: opened.url, headers: responseHeaders(opened.response.headers), data };
  } catch (error) {
    throw scope.translate(error);
  } finally {
    scope.dispose();
  }
}
