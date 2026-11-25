/**
 * A `fetch` for GET and HEAD requests that goes through the host policy (audit pass 2, O55).
 * It also sends a POST that only reads, to a host that the options name.
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
 * - A POST goes only to a host of `readOnlyPost`: a service that takes a query only in the body of
 *   a POST, for example USDA Soil Data Access. The default list is empty, so the default fetch sends no POST.
 *   A POST follows no redirect: the response of a redirect is the result.
 *
 * A refusal is `FORBIDDEN` with the reason `host-not-allowed` (`isHostNotAllowed`). When the
 * signal of the caller aborts, the function throws the reason of the signal, as `fetch` does.
 */

import type { HttpModuleOptions } from "./module.js";
import { httpSettings } from "./module.js";
import { hostNotAllowed, portOf } from "./policy.js";
import { httpRequest } from "./procedures/http/request.js";

/** The longest time of a request of `http.request`: the signal of the caller is the real limit. */
const LONGEST_MS = 86_400_000;

/** The options of one request. */
export interface HostFetchInit {
  /**
   * The method of the request. The default is `GET`. A `POST` goes only to a host of
   * `readOnlyPost` of the options.
   */
  readonly method?: "GET" | "HEAD" | "POST" | undefined;
  /** The headers of the request. */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** The body of a `POST`, as text. The headers give its type, for example `content-type: application/json`. */
  readonly body?: string | undefined;
  /** The signal that stops the request. */
  readonly signal?: AbortSignal | undefined;
}

/** The options of `createHostFetch()`: the options of `createHttpModule()`, and the hosts of a POST that only reads. */
export interface HostFetchOptions extends HttpModuleOptions {
  /**
   * The hosts that take a POST that only reads, for example `sdmdataaccess.sc.egov.usda.gov`.
   * An entry is a host name or an IP address, with a port or without one (each port). It has no
   * wildcard and no range: each host is a rule of its own. The default is no host. The host
   * policy examines a host of this list as it examines each other host.
   */
  readonly readOnlyPost?: readonly string[] | undefined;
}

/** One entry of `readOnlyPost`. */
interface PostEntry {
  readonly hostname: string;
  readonly port: number | undefined;
}

/** This function gives the host name of a URL without brackets and without a final dot, in lowercase. */
function bareHostname(url: URL): string {
  const name = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  return name.toLowerCase().replace(/\.$/, "");
}

/** This function parses one entry of `readOnlyPost`. A bad entry throws, so a host finds it at the start. */
function parsePostEntry(text: string): PostEntry {
  const entry = text.trim().toLowerCase();
  const withPort = /^(.*[^:]):([0-9]{1,5})$/.exec(entry);
  const head = withPort && (!withPort[1]!.includes(":") || withPort[1]!.endsWith("]")) ? withPort[1]! : entry;
  const port = head === entry ? undefined : Number(withPort![2]);
  let url: URL | undefined;
  if (head !== "" && !/[*/@?#\\%\s]/.test(head)) {
    try {
      url = new URL(`http://${head.includes(":") && !head.startsWith("[") ? `[${head}]` : head}/`);
    } catch {
      url = undefined;
    }
  }
  if (url === undefined || (port !== undefined && (port < 1 || port > 65535))) {
    throw new Error(`The readOnlyPost entry "${text}" is not a host name or an IP address, with a port or without one`);
  }
  return { hostname: bareHostname(url), port };
}

/** True when an entry of the list names the host and the port of the URL. */
function takesPost(entries: readonly PostEntry[], url: URL): boolean {
  const hostname = bareHostname(url);
  const port = portOf(url);
  return entries.some((entry) => entry.hostname === hostname && (entry.port === undefined || entry.port === port));
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

/** A `fetch` for GET and HEAD requests, and for a POST that only reads, through the host policy. */
export type HostFetch = (url: string, init?: HostFetchInit) => Promise<HostFetchResponse>;

/**
 * This function gives a `fetch` for GET and HEAD requests through the host policy of the options. The
 * options are the options of `createHttpModule()`. Without options, the policy is the default
 * policy: each public host, and no other host. A POST goes only to a host of `readOnlyPost`. A bad
 * entry of `allow` or of `readOnlyPost` throws here.
 *
 * - The fetch throws `FORBIDDEN` with the reason `host-not-allowed` for a POST to a host that is not in `readOnlyPost`.
 * - The fetch throws an `Error` for a body with a method other than POST.
 *
 * ```ts
 * const forecast = createWeatherModule({ fetch: createHostFetch({ allow: ["localhost:8080"] }) });
 * const soil = createGeoModule({ fetch: createHostFetch({ readOnlyPost: ["sdmdataaccess.sc.egov.usda.gov"] }) });
 * ```
 */
export function createHostFetch(options: HostFetchOptions = {}): HostFetch {
  const settings = httpSettings(options);
  const postEntries = (options.readOnlyPost ?? []).map(parsePostEntry);
  return async (url, init = {}) => {
    const method = init.method ?? "GET";
    if (init.body !== undefined && method !== "POST") throw new Error(`A ${method} request of createHostFetch has no body: a body needs the method POST`);
    if (method === "POST") {
      let target: URL;
      try {
        target = new URL(url);
      } catch (error) {
        throw new Error(`The URL ${JSON.stringify(url)} of the POST is not a URL`, { cause: error });
      }
      if (!takesPost(postEntries, target)) {
        throw hostNotAllowed(["http", "request"], `the host ${bareHostname(target)}:${portOf(target)} takes no POST: it is not in readOnlyPost of createHostFetch`);
      }
    }
    let output;
    try {
      output = await httpRequest(
        {
          url,
          method,
          ...(init.headers !== undefined ? { headers: { ...init.headers } } : {}),
          ...(init.body !== undefined ? { body: init.body } : {}),
          // A POST stays on its host: the fetch gives the response of a redirect, and does not follow it
          ...(method === "POST" ? { redirect: "manual" as const } : {}),
          responseType: "text",
          timeoutMs: LONGEST_MS,
        },
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
