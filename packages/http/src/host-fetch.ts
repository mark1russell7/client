/**
 * A `fetch` for GET requests that goes through the host policy (audit pass 2, O55).
 *
 * A procedure of another package that reads a URL of its caller uses this function in place of
 * the global `fetch`: `weather.forecast`, and the modules of `@procedures/geo` and
 * `@procedures/ics` that a host makes with it. The request has the same checks as `http.request`:
 *
 * - The host of the URL and of each redirect must pass the host policy. The default policy
 *   refuses loopback, private, link-local and the other special addresses.
 * - The connection uses only the addresses that the check allowed (DNS rebinding).
 * - The body of the response has the size limit of the settings.
 *
 * A refusal is `FORBIDDEN` with the reason `host-not-allowed` (`isHostNotAllowed`). When the
 * signal of the caller aborts, the function throws the reason of the signal, as `fetch` does.
 *
 * The option `warnOnRefusal` keeps the behavior before the host policy, for the default modules
 * of 0.28: a refused host gets a deprecation notice and the global `fetch`. Version 0.29.0 removes it.
 */

import type { HttpModuleOptions } from "./module.js";
import { httpSettings } from "./module.js";
import { isHostNotAllowed } from "./policy.js";
import { httpRequest } from "./procedures/http/request.js";

/** The longest time of a request of `http.request`: the signal of the caller is the real limit. */
const LONGEST_MS = 86_400_000;

/** The options of one request. */
export interface HostFetchInit {
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
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** A `fetch` for GET requests through the host policy. */
export type HostFetch = (url: string, init?: HostFetchInit) => Promise<HostFetchResponse>;

/** A deprecation notice: the code and the text of a `DeprecationWarning` of Node. */
export interface DeprecationNotice {
  /** The code of the warning, for example `PROCEDURES_WEATHER_PRIVATE_HOST`. The process emits each code one time. */
  readonly code: string;
  /** The text of the warning. It names the change that removes the notice. */
  readonly message: string;
}

/** The options of `createHostFetch()`: the options of `createHttpModule()`, and the notice of a refused host. */
export interface HostFetchOptions extends HttpModuleOptions {
  /**
   * The notice of a refused host. With this option, a refused host does not throw. The function
   * emits the notice one time in each process. Then it sends the request with the global `fetch`,
   * as before the host policy. Without this option, a refused host throws `FORBIDDEN`.
   *
   * @deprecated The default modules of `weather`, `geo` and `ics` use it in 0.28 only. Version
   * 0.29.0 removes it. Then a refused host always throws.
   */
  readonly warnOnRefusal?: DeprecationNotice | undefined;
}

/** The codes of the notices that this process emitted. */
const emitted = new Set<string>();

/** This function emits a deprecation notice one time in each process, with its code. */
function emitOnce(notice: DeprecationNotice): void {
  if (emitted.has(notice.code)) return;
  emitted.add(notice.code);
  if (typeof process !== "undefined" && typeof process.emitWarning === "function") {
    process.emitWarning(notice.message, { type: "DeprecationWarning", code: notice.code });
  } else {
    console.warn(`[${notice.code}] ${notice.message}`);
  }
}

/** This function gives the parts of a `Response` of the global `fetch` that the procedures use. */
async function globalFetch(url: string, init: HostFetchInit): Promise<HostFetchResponse> {
  const response = await fetch(url, { ...(init.headers !== undefined ? { headers: { ...init.headers } } : {}), ...(init.signal !== undefined ? { signal: init.signal } : {}) });
  return response;
}

/**
 * This function gives a `fetch` for GET requests through the host policy of the options. The
 * options are the options of `createHttpModule()`. Without options, the policy is the default
 * policy: each public host, and no other host. A bad entry of `allow` throws here.
 *
 * ```ts
 * const forecast = createWeatherModule({ fetch: createHostFetch({ allow: ["localhost:8080"] }) });
 * ```
 */
export function createHostFetch(options: HostFetchOptions = {}): HostFetch {
  const { warnOnRefusal, ...policyOptions } = options;
  const settings = httpSettings(policyOptions);
  return async (url, init = {}) => {
    let output;
    try {
      output = await httpRequest(
        { url, method: "GET", ...(init.headers !== undefined ? { headers: { ...init.headers } } : {}), responseType: "text", timeoutMs: LONGEST_MS },
        { signal: init.signal },
        settings,
      );
    } catch (error) {
      if (init.signal?.aborted) throw init.signal.reason;
      // Before the host policy, the request went to each host (O55). The notice names the change.
      if (warnOnRefusal !== undefined && isHostNotAllowed(error)) {
        emitOnce(warnOnRefusal);
        return globalFetch(url, init);
      }
      throw error;
    }
    const text = typeof output.body === "string" ? output.body : "";
    return {
      ok: output.ok,
      status: output.status,
      url: output.url,
      text: async () => text,
      json: async () => JSON.parse(text) as unknown,
    };
  };
}
