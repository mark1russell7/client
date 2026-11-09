/**
 * The frame rules of a response. A page can refuse to show in a frame of another page. Two headers tell the
 * refusal: `Content-Security-Policy` with the directive `frame-ancestors` (CSP3), and `X-Frame-Options` (the HTML
 * standard). These functions read the headers and give the decision of a browser. They use no network.
 */

/** A policy of `Content-Security-Policy`: the source list of each directive, by its name in lower case. */
export type CspPolicy = ReadonlyMap<string, readonly string[]>;

/** The headers of a response: a `Headers` object, or a record of header values as Node gives them. */
export type HeaderSource = Headers | Readonly<Record<string, string | readonly string[] | undefined>>;

/** The decision of `frameRefusal`. `by` names the header that refuses the frame, or it is `null`. */
export interface FrameRefusal {
  readonly refused: boolean;
  readonly by: "csp" | "x-frame-options" | null;
  readonly detail: string;
}

/** The two origins of a frame: the page in the frame, and the page that holds the frame. */
export interface FrameOrigins {
  /** The origin of the page that holds the frame, for example `https://a.example`. */
  readonly ancestor: string | URL;
  /** The address of the page in the frame, after each redirect. Its origin is `'self'`. */
  readonly page: string | URL;
}

const ASCII_WHITESPACE = /[\t\n\f\r ]+/;
const DIRECTIVE_NAME = /^[a-z0-9-]+$/;
const SCHEME_SOURCE = /^([a-z][a-z0-9+.-]*):$/i;
const HOST_SOURCE = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*|(?:\*\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?)(?::(\*|[0-9]+))?(\/[^;,]*)?$/i;
const DEFAULT_PORTS: Readonly<Record<string, number>> = { http: 80, https: 443, ws: 80, wss: 443, ftp: 21 };

/**
 * This function gives the policies of the values of `Content-Security-Policy` headers. A comma divides the policies
 * of one value. The first copy of a directive in a policy wins, as in a browser. A policy with no directive is not
 * in the result.
 */
export function parseCsp(values: readonly string[]): CspPolicy[] {
  const policies: CspPolicy[] = [];
  for (const value of values) {
    for (const serialized of value.split(",")) {
      const policy = new Map<string, readonly string[]>();
      for (const token of serialized.split(";")) {
        const [name, ...list] = token.trim().split(ASCII_WHITESPACE);
        const directive = (name ?? "").toLowerCase();
        if (!DIRECTIVE_NAME.test(directive) || policy.has(directive)) continue;
        policy.set(directive, list);
      }
      if (policy.size > 0) policies.push(policy);
    }
  }
  return policies;
}

/** The parts of an origin that the rules compare. A port is `null` when it is the default port of the scheme. */
interface OriginParts {
  readonly scheme: string;
  readonly host: string | null;
  readonly port: number | null;
}

function partsOf(origin: string | URL): OriginParts | undefined {
  let url: URL;
  try {
    url = typeof origin === "string" ? new URL(origin) : origin;
  } catch {
    return undefined;
  }
  return { scheme: url.protocol.slice(0, -1).toLowerCase(), host: url.hostname === "" ? null : url.hostname.toLowerCase(), port: url.port === "" ? null : Number(url.port) };
}

/** This function is the scheme-part match of CSP3: the same scheme, or a secure upgrade of it. */
function schemeMatches(expression: string, scheme: string): boolean {
  const a = expression.toLowerCase();
  if (a === scheme) return true;
  if (a === "http") return scheme === "https";
  if (a === "ws") return scheme === "wss" || scheme === "http" || scheme === "https";
  if (a === "wss") return scheme === "https";
  return false;
}

/** This function is the host-part match of CSP3. `*.example.com` matches each subdomain, but not `example.com`. */
function hostMatches(pattern: string, host: string): boolean {
  const lower = pattern.toLowerCase();
  if (lower.startsWith("*")) return host.endsWith(lower.slice(1));
  return lower === host;
}

/** This function is the port-part match of CSP3. No port in the expression matches the default port of the scheme. */
function portMatches(input: string | undefined, url: OriginParts): boolean {
  if (input === "*") return true;
  const port = input === undefined ? null : Number(input);
  if (port === url.port) return true;
  return url.port === null && port === (DEFAULT_PORTS[url.scheme] ?? null);
}

function partsAllow(source: string, url: OriginParts | undefined, self: OriginParts | undefined): boolean {
  if (url === undefined) return false;
  const keyword = source.toLowerCase();
  if (keyword === "*") return url.scheme === "http" || url.scheme === "https" || url.scheme === self?.scheme;
  if (keyword === "'self'") {
    if (self === undefined || self.host === null || self.host !== url.host) return false;
    if (self.scheme === url.scheme && self.port === url.port) return true;
    // CSP3 lets 'self' match a secure upgrade of the scheme, with the same port or the default ports
    if (self.port !== url.port) return false;
    return url.scheme === "https" || url.scheme === "wss" || (self.scheme === "http" && (url.scheme === "http" || url.scheme === "ws"));
  }
  const scheme = SCHEME_SOURCE.exec(source);
  if (scheme !== null) return schemeMatches(scheme[1] ?? "", url.scheme);
  const host = HOST_SOURCE.exec(source);
  if (host === null || url.host === null) return false;
  const [, hostScheme, hostPart = "", port] = host;
  if (hostScheme === undefined ? self === undefined || !schemeMatches(self.scheme, url.scheme) : !schemeMatches(hostScheme, url.scheme)) return false;
  // An origin has no path, so the path part of the expression changes nothing
  return hostMatches(hostPart, url.host) && portMatches(port, url);
}

/**
 * This function tells if one source expression of CSP3 accepts an origin. `self` is the origin of the protected page.
 * The function compares origins, so it ignores the path part of an expression, as `frame-ancestors` does.
 * A nonce, a hash and each other keyword accept no origin.
 */
export function sourceAllows(source: string, origin: string | URL, self: string | URL): boolean {
  return partsAllow(source, partsOf(origin), partsOf(self));
}

/**
 * This function tells if a source list of CSP3 accepts an origin. An empty list and the list `'none'` accept no origin.
 * Thus `frame-ancestors` with no value refuses each frame.
 */
export function sourceListAllows(list: readonly string[], origin: string | URL, self: string | URL): boolean {
  if (list.length === 1 && list[0]?.toLowerCase() === "'none'") return false;
  const url = partsOf(origin);
  const own = partsOf(self);
  return list.some((source) => partsAllow(source, url, own));
}

/** This function gives the values of a header, as a list. */
function valuesOf(headers: HeaderSource, name: string): string[] {
  if (typeof (headers as Headers).get === "function" && typeof (headers as Headers).forEach === "function") {
    const value = (headers as Headers).get(name);
    return value === null ? [] : [value];
  }
  const values: string[] = [];
  for (const [key, value] of Object.entries(headers as Readonly<Record<string, string | readonly string[] | undefined>>)) {
    if (key.toLowerCase() !== name || value === undefined) continue;
    if (typeof value === "string") values.push(value);
    else values.push(...value);
  }
  return values;
}

const sameOrigin = (a: OriginParts | undefined, b: OriginParts | undefined): boolean =>
  a !== undefined && b !== undefined && a.host !== null && a.scheme === b.scheme && a.host === b.host && a.port === b.port;

const serialize = (origin: string | URL): string => (typeof origin === "string" ? origin : origin.origin);

/**
 * This function tells if a browser refuses to show a page in a frame of the ancestor. It obeys these rules:
 *
 * - An enforced policy with `frame-ancestors` decides, and the function ignores `X-Frame-Options`. Each such policy must accept the ancestor.
 * - Else `X-Frame-Options` decides, by the rules of the HTML standard. `DENY` refuses, and `SAMEORIGIN` refuses an ancestor of another origin.
 * - Two or more different values, with `DENY`, `SAMEORIGIN` or `ALLOWALL` in them, refuse each frame. `ALLOW-FROM` and unknown values do not refuse.
 * - A header `Content-Security-Policy-Report-Only` does not refuse.
 *
 * A browser examines each ancestor of a nested frame. To do the same, give each ancestor to this function.
 */
export function frameRefusal(headers: HeaderSource, { ancestor, page }: FrameOrigins): FrameRefusal {
  const policies = parseCsp(valuesOf(headers, "content-security-policy")).filter((policy) => policy.has("frame-ancestors"));
  if (policies.length > 0) {
    const index = policies.findIndex((policy) => !sourceListAllows(policy.get("frame-ancestors") ?? [], ancestor, page));
    if (index === -1) return { refused: false, by: null, detail: `Each frame-ancestors directive allows ${serialize(ancestor)}.` };
    const list = (policies[index]?.get("frame-ancestors") ?? []).join(" ") || "(empty)";
    return { refused: true, by: "csp", detail: `The frame-ancestors directive "${list}" does not allow ${serialize(ancestor)}.` };
  }
  const options = new Set(
    valuesOf(headers, "x-frame-options")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim().toLowerCase()),
  );
  const values = [...options].join(", ");
  if (options.size > 1) {
    if (options.has("deny") || options.has("sameorigin") || options.has("allowall")) {
      return { refused: true, by: "x-frame-options", detail: `X-Frame-Options has values that do not agree: ${values}.` };
    }
    return { refused: false, by: null, detail: `X-Frame-Options has no value that a browser uses: ${values}.` };
  }
  if (options.has("deny")) return { refused: true, by: "x-frame-options", detail: "X-Frame-Options is DENY." };
  if (options.has("sameorigin") && !sameOrigin(partsOf(ancestor), partsOf(page))) {
    return { refused: true, by: "x-frame-options", detail: `X-Frame-Options is SAMEORIGIN, and ${serialize(ancestor)} is another origin.` };
  }
  return { refused: false, by: null, detail: options.size === 0 ? "No header refuses a frame." : `X-Frame-Options allows ${serialize(ancestor)}.` };
}
