/**
 * http.request procedure
 *
 * Send an HTTP request and give the status, the headers and the body. The procedure gives each
 * status: a status of 400 or more is not an error. The body of the response has a size limit.
 */

import { HttpError } from "../../errors.js";
import { DEFAULT_SETTINGS, DEFAULT_TIMEOUT_MS, exchange, isOk, prepare, readBody, responseHeaders, type HttpSettings } from "../../exchange.js";
import { CallScope, type ScopeContext } from "../../scope.js";
import type { HttpRequestInput, HttpRequestOutput } from "../../types.js";

const PATH = ["http", "request"];

/** The body of an input and its content type, or undefined. */
function bodyOf(input: HttpRequestInput): { body: Buffer; type: string } | undefined {
  const given = [input.body, input.json, input.bodyBase64].filter((value) => value !== undefined).length;
  if (given > 1) throw new Error("http.request: give only one of body, json and bodyBase64");
  if (input.body !== undefined) return { body: Buffer.from(input.body, "utf8"), type: "text/plain; charset=utf-8" };
  if (input.json !== undefined) return { body: Buffer.from(JSON.stringify(input.json), "utf8"), type: "application/json" };
  if (input.bodyBase64 !== undefined) return { body: Buffer.from(input.bodyBase64, "base64"), type: "application/octet-stream" };
  return undefined;
}

/** The body of the response in the form of `responseType`. */
function decode(bytes: Buffer, responseType: HttpRequestInput["responseType"], status: number): unknown {
  if (responseType === "bytes") return bytes.toString("base64");
  const text = bytes.toString("utf8");
  if (responseType !== "json") return text;
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError("BAD_JSON", `http.request: the body of the response is not JSON: ${text.slice(0, 200)}`, status);
  }
}

/**
 * Send an HTTP request and give the status, the headers and the body
 */
export async function httpRequest(input: HttpRequestInput, ctx: ScopeContext = {}, settings: HttpSettings = DEFAULT_SETTINGS): Promise<HttpRequestOutput> {
  const method = input.method ?? "GET";
  const body = bodyOf(input);
  if (body !== undefined && (method === "GET" || method === "HEAD")) {
    throw new Error(`http.request: a ${method} request has no body`);
  }
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = body.type;
  if (input.responseType === "json") headers["accept"] = "application/json";
  const prepared = prepare({ ...input, method }, PATH, settings, { headers, body: body?.body });
  const scope = new CallScope(PATH, ctx, { timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS });
  try {
    const opened = await exchange(prepared, settings.policy, scope);
    const limit = Math.min(input.maxResponseBytes ?? settings.maxResponseBytes, settings.maxResponseBytes);
    const bytes = await readBody(opened.body, limit, scope, opened.response);
    const status = opened.response.statusCode ?? 0;
    return {
      status,
      statusText: opened.response.statusMessage ?? "",
      ok: isOk(status),
      url: opened.url,
      redirected: opened.redirects.length > 0,
      headers: responseHeaders(opened.response.headers),
      body: decode(bytes, input.responseType, status),
      bytes: bytes.length,
    };
  } catch (error) {
    throw scope.translate(error);
  } finally {
    scope.dispose();
  }
}
