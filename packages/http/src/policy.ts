/**
 * The host policy of the HTTP procedures (roadmap R38): the hosts that a request can reach.
 *
 * - The default policy allows each public host and refuses the other addresses: loopback,
 *   private, link-local, shared, multicast and reserved (see `address.ts`).
 * - `allow` names more hosts: a host name (`api.example.com`), a wildcard (`*.example.com`), an
 *   IP address (`127.0.0.1`, `::1`) or a CIDR range (`10.0.0.0/8`). An entry can end with a port:
 *   `localhost:8080`, `[::1]:8080`, `10.0.0.0/8:443`. Without a port, an entry allows each port.
 * - `publicHosts: false` refuses the public hosts too: only the entries of `allow` stay.
 *
 * The check resolves the host name and examines each address. The connection uses only the
 * addresses that the check allowed, so a second answer of the DNS cannot change the address
 * (DNS rebinding). A redirect goes through the same check. A refusal is `FORBIDDEN` with the
 * reason `host-not-allowed`.
 */

import { lookup } from "node:dns/promises";
import { InvocationError, type ProcedurePath } from "@procedures/client";
import { formatAddress, parseAddress, parseRange, rangeHas, specialClass, type AddressBytes, type AddressRange } from "./address.js";

/** The reason of the `FORBIDDEN` error for a host that the policy does not allow. */
export const HOST_NOT_ALLOWED = "host-not-allowed";

/** One address of a host name. */
export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/**
 * A resolver: it gives the addresses of a host name. The default uses the resolver of the
 * operating system (`dns.lookup`), so it reads the hosts file too. A test gives its own resolver.
 */
export type HostResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

/** The options of the host policy: the options of `createHttpModule()`. */
export interface HostPolicyOptions {
  /**
   * More hosts that the procedures can reach: host names, wildcards (`*.example.com`), IP
   * addresses and CIDR ranges, each with an optional port. An entry that names a private or a
   * loopback address allows it.
   */
  readonly allow?: readonly string[] | undefined;
  /** False: only the hosts of `allow`. The default is true: each public host too. */
  readonly publicHosts?: boolean | undefined;
  /** The resolver of host names. The default is `dns.lookup` with all the addresses. */
  readonly resolve?: HostResolver | undefined;
}

/** One entry of `allow`. */
type AllowEntry =
  | { readonly kind: "name"; readonly name: string; readonly port: number | undefined; readonly text: string }
  | { readonly kind: "wildcard"; readonly suffix: string; readonly port: number | undefined; readonly text: string }
  | { readonly kind: "range"; readonly range: AddressRange; readonly port: number | undefined; readonly text: string };

/** A host policy: the parsed options. */
export interface HostPolicy {
  readonly entries: readonly AllowEntry[];
  readonly publicHosts: boolean;
  readonly resolve: HostResolver;
}

/** The resolver of the operating system: each address of the name, in the order of the system. */
export const systemResolver: HostResolver = async (hostname) => {
  const found = await lookup(hostname, { all: true, verbatim: true });
  return found.map((entry) => ({ address: entry.address, family: entry.family === 6 ? 6 : 4 }));
};

/** A host name in the form of a comparison: lowercase, without a final dot. */
function normalName(name: string): string {
  return name.toLowerCase().replace(/\.$/, "");
}

const NAME = /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/;

/** This function parses one entry of `allow`. A bad entry throws, so a host finds it at the start. */
function parseEntry(text: string): AllowEntry {
  let head = text.trim();
  let port: number | undefined;
  // A port: "host:80", "[::1]:80", "10.0.0.0/8:80". A bare IPv6 address has no port.
  const withPort = /^(.*[^:]):([0-9]{1,5})$/.exec(head);
  if (withPort && (!withPort[1]!.includes(":") || withPort[1]!.endsWith("]"))) {
    head = withPort[1]!;
    port = Number(withPort[2]);
    if (port < 1 || port > 65535) throw new Error(`The port of the allow entry "${text}" is not in 1 to 65535`);
  }
  const range = parseRange(head);
  if (range) return { kind: "range", range, port, text };
  const name = normalName(head);
  if (name.startsWith("*.") && NAME.test(name.slice(2))) return { kind: "wildcard", suffix: name.slice(1), port, text };
  if (NAME.test(name)) return { kind: "name", name, port, text };
  throw new Error(`The allow entry "${text}" is not a host name, a wildcard, an IP address or a CIDR range`);
}

/** This function makes a host policy from the options. A bad entry of `allow` throws. */
export function createHostPolicy(options: HostPolicyOptions = {}): HostPolicy {
  return {
    entries: (options.allow ?? []).map(parseEntry),
    publicHosts: options.publicHosts ?? true,
    resolve: options.resolve ?? systemResolver,
  };
}

/** The default policy: each public host, and no other host. */
export const DEFAULT_HOST_POLICY: HostPolicy = createHostPolicy();

/** The host of a URL to connect to, after the check. */
export interface AllowedTarget {
  /** The host name of the URL, or the IP address without brackets. */
  readonly hostname: string;
  readonly port: number;
  /** The addresses that the connection can use: each one passed the check. */
  readonly addresses: readonly ResolvedAddress[];
}

/** The `FORBIDDEN` error for a host that the policy does not allow. */
export function hostNotAllowed(procedure: ProcedurePath, message: string): InvocationError {
  return new InvocationError("FORBIDDEN", `${procedure.join(".")}: ${message}`, procedure, HOST_NOT_ALLOWED);
}

/** True for the `FORBIDDEN` error of a host that the policy does not allow. */
export function isHostNotAllowed(error: unknown): boolean {
  return error instanceof InvocationError && error.code === "FORBIDDEN" && error.reason === HOST_NOT_ALLOWED;
}

function portMatches(entry: AllowEntry, port: number): boolean {
  return entry.port === undefined || entry.port === port;
}

function nameAllowed(policy: HostPolicy, hostname: string, port: number): boolean {
  const name = normalName(hostname);
  return policy.entries.some(
    (entry) =>
      portMatches(entry, port) &&
      ((entry.kind === "name" && entry.name === name) || (entry.kind === "wildcard" && name.endsWith(entry.suffix) && name.length > entry.suffix.length)),
  );
}

/** Undefined when the policy allows the address, or the reason of the refusal. */
function addressRefusal(policy: HostPolicy, address: AddressBytes, port: number): string | undefined {
  if (policy.entries.some((entry) => entry.kind === "range" && portMatches(entry, port) && rangeHas(entry.range, address))) return undefined;
  const special = specialClass(address);
  if (special !== undefined) return `${formatAddress(address)} is a ${special} address`;
  return policy.publicHosts ? undefined : `${formatAddress(address)} is not in the allowed hosts`;
}

/** The default port of a URL protocol. */
export function portOf(url: URL): number {
  if (url.port !== "") return Number(url.port);
  return url.protocol === "https:" ? 443 : 80;
}

/**
 * This function examines the host of a URL. It gives the addresses that the connection can use,
 * or it throws `FORBIDDEN` with the reason `host-not-allowed`. A name that `allow` names keeps
 * each address. For another name, each address must be public or in a range of `allow`. The
 * connection uses only the addresses that pass, and the check fails when none passes.
 */
export async function checkHost(policy: HostPolicy, url: URL, procedure: ProcedurePath, what = "the URL"): Promise<AllowedTarget> {
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  const port = portOf(url);
  const literal = parseAddress(hostname);
  if (literal) {
    const refusal = addressRefusal(policy, literal, port);
    if (refusal !== undefined) throw hostNotAllowed(procedure, `the host of ${what} is not allowed: ${refusal}`);
    return { hostname, port, addresses: [{ address: formatAddress(literal), family: literal.length === 4 ? 4 : 6 }] };
  }
  if (!policy.publicHosts && !nameAllowed(policy, hostname, port) && !policy.entries.some((entry) => entry.kind === "range")) {
    throw hostNotAllowed(procedure, `the host ${hostname}:${port} of ${what} is not in the allowed hosts`);
  }
  let resolved: readonly ResolvedAddress[];
  try {
    resolved = await policy.resolve(hostname);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    throw new Error(`${procedure.join(".")}: the host ${hostname} of ${what} has no address${code ? ` (${code})` : ""}`, { cause: error });
  }
  if (resolved.length === 0) throw new Error(`${procedure.join(".")}: the host ${hostname} of ${what} has no address`);
  if (nameAllowed(policy, hostname, port)) return { hostname, port, addresses: resolved };
  const allowed: ResolvedAddress[] = [];
  const refusals: string[] = [];
  for (const entry of resolved) {
    const bytes = parseAddress(entry.address);
    const refusal = bytes ? addressRefusal(policy, bytes, port) : `${entry.address} is not an IP address`;
    if (refusal === undefined) allowed.push(entry);
    else refusals.push(refusal);
  }
  if (allowed.length === 0) {
    throw hostNotAllowed(procedure, `the host ${hostname} of ${what} is not allowed: ${refusals.join(", ")}`);
  }
  return { hostname, port, addresses: allowed };
}
