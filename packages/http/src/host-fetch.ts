/**
 * A `fetch` for GET and HEAD requests that goes through the host policy (audit pass 2, O55).
 *
 * A procedure of another package uses this function in place of the global `fetch` for a URL of
 * its caller. `weather.forecast` uses it, and so do the modules of `@procedures/geo` and
 * `@procedures/ics` that a host makes with it. The request has the same checks as `http.request`:
 *
 * - The host of the URL and of each redirect must pass the host policy. The default policy
 *   refuses loopback, private, link-local and the other special addresses.
 * - The connection uses only the addresses that passed the check (DNS rebinding).
 * - The body of the response has the size limit of the settings.
 * - A `HEAD` request reads only the headers. Thus a caller that needs the headers of a large page,
 *   for example for `frameRefusal`, does not read its body.
 *
 * A refusal is `FORBIDDEN` with the reason `host-not-allowed` (`isHostNotAllowed`). When the
 * signal of the caller aborts, the function throws the reason of the signal, as `fetch` does.
 */

import type { HttpModuleOptions } from "./module.js";
import { httpSettings } from "./module.js";
import { httpRequest } from "./procedures/http/request.js";

/** The longest time of a request of `http.request`: the signal of the caller is the real limit. */
const LONGEST_MS = 86_400_000;

/** The options of one request. */
export interface HostFetchInit {
  /** The method of the request. The default is `GET`. */
  readonly method?: "GET" | "HEAD" | undefined;
  /** The headers of the request. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** The signal that stops the request. */
  readonly signal?: AbortSignal | undefined;
}

/** The response of a request: the parts of a `Response` of `fetch` that the procedures use. */
export interface HostFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  /** The URL of the response: the last URL after the redirects. */
  readonly url: string;
  /** The headers of the response, with names in lowercase. A header that repeats, for example `set-cookie`, is a list. */
  readonly headers: Readonly<Record<string, string | readonly string[]>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** A `fetch` for GET and HEAD requests through the host policy. */
export type HostFetch = (url: string, init?: HostFetchInit) => Promise<HostFetchResponse>;

/**
 * This function gives a `fetch` for GET and HEAD requests through the host policy of the options. The
 * options are the options of `createHttpModule()`. Without options, the policy is the default
 * policy: each public host, and no other host. A bad entry of `allow` throws here.
 *
 * ```ts
 * const forecast = createWeatherModule({ fetch: createHostFetch({ allow: ["localhost:8080"] }) });
 * ```
 */
export function createHostFetch(options: HttpModuleOptions = {}): HostFetch {
  const settings = httpSettings(options);
  return async (url, init = {}) => {
    let output;
    try {
      output = await httpRequest(
        { url, method: init.method ?? "GET", ...(init.headers !== undefined ? { headers: { ...init.headers } } : {}), responseType: "text", timeoutMs: LONGEST_MS },
        { signal: init.signal },
        settings,
      );
    } catch (error) {
      if (init.signal?.aborted) throw init.signal.reason;
      throw error;
    }
    const text = typeof output.body === "string" ? output.body : "";
    return {
      ok: output.ok,
      status: output.status,
      url: output.url,
      headers: output.headers,
      text: async () => text,
      json: async () => JSON.parse(text) as unknown,
    };
  };
}
