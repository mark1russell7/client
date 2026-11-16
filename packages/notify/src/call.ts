/**
 * The one call of an HTTP API through a fetch that the caller gives, with a time limit. The entries
 * of each notification service (`./pushover`, `./twilio`) use it. This file imports no Node built-in.
 */

/** The part of `fetch` that a call uses. `globalThis.fetch` fits this type. */
export type ApiFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal: AbortSignal },
) => Promise<{ readonly status: number; text(): Promise<string>; readonly headers: { get(name: string): string | null } }>;

/** One request of an API. Its fields fit the `init` of `fetch`. */
export interface ApiRequest {
  readonly url: string;
  readonly method: "GET" | "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
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
      signal: AbortSignal.any(signals),
    });
    return extract({ status: response.status, text: await response.text(), headers: response.headers });
  } catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    return lost((error as { name?: string } | undefined)?.name === "TimeoutError" ? "timeout" : "network");
  }
}
