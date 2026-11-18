/**
 * The one call of an HTTP API through a fetch that the caller gives, with a time limit. The entries
 * of each notification service (`./pushover`, `./twilio`) use it. This file imports no Node built-in.
 */

/** The part of `fetch` that a call uses. `globalThis.fetch` fits this type. */
export type ApiFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect?: "follow" | "manual" | "error" },
) => Promise<{ readonly status: number; text(): Promise<string>; readonly headers: { get(name: string): string | null } }>;

/** One request of an API. Its fields fit the `init` of `fetch`. */
export interface ApiRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  /** The rule of a redirect. Without it, the fetch follows a redirect. */
  readonly redirect?: "follow" | "manual" | "error";
}

/** The parts of an HTTP response that an extractor reads. */
export interface ApiResponse {
  readonly status: number;
  readonly text: string;
  readonly headers?: { get(name: string): string | null } | undefined;
}

/**
 * This function sends one request through the fetch and reads the response with the extractor. When
 * no answer comes, or the time limit ends first, it gives the failure of `lost`. It throws only the
 * reason of `signal`, when the caller aborts. It does not send a request again.
 */
export async function callApi<Result, Failure>(
  fetch: ApiFetch,
  request: ApiRequest,
  extract: (response: ApiResponse) => Result | Failure,
  options: { readonly timeoutMs: number; readonly signal?: AbortSignal | undefined },
  lost: (kind: "network" | "timeout") => Failure,
): Promise<Result | Failure> {
  const signals = [AbortSignal.timeout(options.timeoutMs), ...(options.signal ? [options.signal] : [])];
  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: { ...request.headers },
      ...(request.body === undefined ? {} : { body: request.body }),
      ...(request.redirect === undefined ? {} : { redirect: request.redirect }),
      signal: AbortSignal.any(signals),
    });
    return extract({ status: response.status, text: await response.text(), headers: response.headers });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    return lost((error as { name?: string } | undefined)?.name === "TimeoutError" ? "timeout" : "network");
  }
}

/**
 * This function gives the wait of a `Retry-After` header: a count of seconds, or an HTTP date after `nowMs`. It gives
 * `undefined` for no header or for a value of another form. A date before `nowMs` gives 0.
 */
export function retryAfterMs(value: string | null | undefined, nowMs: number): number | undefined {
  const text = value?.trim();
  if (text === undefined || text.length === 0) return undefined;
  if (/^\d+$/u.test(text)) return Number(text) * 1000;
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(at - nowMs, 0) : undefined;
}
