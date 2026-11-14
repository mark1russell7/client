/**
 * A local forward proxy that applies the host policy to each request of another program, for
 * example a headless browser. The program sends each request to the proxy. Thus a redirect, a
 * resource of a page and a second DNS answer go through the same check as the first request.
 *
 * - The proxy listens on `127.0.0.1`, on a free port.
 * - A `CONNECT` request opens a tunnel to `host:port`. A browser uses it for `https:`, `wss:` and
 *   `ws:` URLs.
 * - A plain request has an absolute `http:` URL, for example `GET http://a.example/page`. The proxy
 *   sends the request to the host, and gives the response back.
 * - For each request, the proxy examines the host with `checkHost`. The connection uses only the
 *   addresses that the check allowed, so a second DNS answer cannot change the address (DNS
 *   rebinding).
 * - A host that the policy refuses gets the status 403. The proxy records each refusal and gives
 *   it to `onRefusal`.
 * - A host with no address, and a connection that fails, get the status 502.
 * - Each other request gets the status 400.
 */

import { createServer, request as plainRequest, STATUS_CODES, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http";
import { connect, type AddressInfo, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { pinnedLookup } from "./exchange.js";
import { checkHost, DEFAULT_HOST_POLICY, isHostNotAllowed, type AllowedTarget, type HostPolicy } from "./policy.js";

/** The address of the listener of the proxy. */
export const PROXY_HOST = "127.0.0.1";

/** The largest number of refusals that `PolicyProxy.refusals` keeps. `onRefusal` gets each refusal. */
export const MAX_PROXY_REFUSALS = 1000;

/** The path of the proxy in the messages of the host check. */
const PROXY_PATH = ["http", "proxy"];

/** One request that the proxy refused. */
export interface ProxyRefusal {
  /** The method of the request: `CONNECT`, or the method of a plain request. */
  readonly method: string;
  /** The target of the request: `host:port` for `CONNECT`, else the URL. */
  readonly target: string;
  /** The reason of the refusal: the message of the host check. */
  readonly reason: string;
}

/** The options of `startPolicyProxy()`. */
export interface PolicyProxyOptions {
  /** The host policy of each request. The default is `DEFAULT_HOST_POLICY`: each public host, and no other host. */
  readonly policy?: HostPolicy | undefined;
  /** This function gets each refusal at the time of the refusal. An error of the function does not stop the proxy. */
  readonly onRefusal?: ((refusal: ProxyRefusal) => void) | undefined;
}

/** A proxy that runs. */
export interface PolicyProxy {
  /** The address of the listener: `127.0.0.1`. */
  readonly host: string;
  /** The port of the listener. */
  readonly port: number;
  /** The URL of the proxy, for example `http://127.0.0.1:41234`. A browser gets it in `--proxy-server`. */
  readonly url: string;
  /** The refusals until now, in their order. The list keeps the first `MAX_PROXY_REFUSALS` refusals. */
  readonly refusals: readonly ProxyRefusal[];
  /** This function stops the listener and closes each open connection. Then the port is free. A second call does nothing. */
  close(): Promise<void>;
}

/** The answer of the proxy to a request that does not reach its host. */
interface Failure {
  readonly status: 400 | 403 | 502;
  readonly message: string;
}

/** The text of a 403 answer. The refusal record has the reason, and the page does not get it. */
const REFUSED = "The host policy of the proxy refuses this host.";

/** The text of a 502 answer. */
const NO_CONNECTION = "The proxy cannot connect to this host.";

/** The headers of one connection (RFC 9110, section 7.6.1). The proxy does not send them on. */
const HOP_BY_HOP: ReadonlySet<string> = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/** The headers without the headers of one connection, and without each header that `connection` names. */
function endToEnd(headers: IncomingHttpHeaders): Record<string, string | string[]> {
  const named = new Set(String(headers.connection ?? "").split(",").map((token) => token.trim().toLowerCase()));
  const out: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP.has(name) && !named.has(name)) out[name] = value;
  }
  return out;
}

/** The target of `CONNECT`: a host name, an IPv4 address or an IPv6 address in brackets, then a port. */
const AUTHORITY = /^(\[[0-9a-f:.]+\]|[^\s/?#@[\]:]+):([0-9]{1,5})$/i;

/**
 * This function gives the URL of the target of a `CONNECT` request (`host:port`), or undefined for
 * another form. The URL parser gives the normal form of the host, for example `127.0.0.1` for
 * `0x7f.1`. Thus the check and the connection use the same host.
 */
function connectUrl(authority: string): URL | undefined {
  const match = AUTHORITY.exec(authority);
  if (!match) return undefined;
  const port = Number(match[2]);
  if (port < 1 || port > 65_535) return undefined;
  try {
    return new URL(`http://${match[1]}:${port}/`);
  } catch {
    return undefined;
  }
}

/** The URL of a plain request: an absolute `http:` URL, or undefined. */
function plainUrl(target: string): URL | undefined {
  if (!/^http:\/\//i.test(target)) return undefined;
  try {
    return new URL(target);
  } catch {
    return undefined;
  }
}

/** This function writes a failure to the socket of a `CONNECT` request, and ends the socket. */
function rawAnswer(socket: Duplex, failure: Failure): void {
  const body = `${failure.message}\n`;
  socket.end(
    `HTTP/1.1 ${failure.status} ${STATUS_CODES[failure.status]}\r\n` +
      `content-type: text/plain; charset=utf-8\r\ncontent-length: ${Buffer.byteLength(body)}\r\nconnection: close\r\n\r\n${body}`,
  );
}

/** This function writes a failure as the response of a plain request. */
function answer(response: ServerResponse, failure: Failure): void {
  const body = `${failure.message}\n`;
  response.writeHead(failure.status, { "content-type": "text/plain; charset=utf-8", "content-length": Buffer.byteLength(body), connection: "close" });
  response.end(body);
}

/**
 * This function starts a forward proxy on `127.0.0.1`, on a free port, and gives its address. The
 * proxy applies the host policy to each request. Give its URL to a program, for example in the
 * flag `--proxy-server` of a browser. Call `close()` at the end.
 *
 * ```ts
 * const proxy = await startPolicyProxy({ policy: createHostPolicy({ allow: ["intranet.example"] }) });
 * try {
 *   // Start the program with proxy.url
 * } finally {
 *   await proxy.close();
 * }
 * ```
 */
export async function startPolicyProxy(options: PolicyProxyOptions = {}): Promise<PolicyProxy> {
  const policy = options.policy ?? DEFAULT_HOST_POLICY;
  const refusals: ProxyRefusal[] = [];
  const sockets = new Set<Duplex>();
  let closed = false;

  /** This function keeps a socket until it closes, so that `close()` can close it. */
  const track = (socket: Duplex): void => {
    if (closed) {
      socket.destroy();
      return;
    }
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };

  /** This function examines the host of a request. It gives the checked target, or the failure. */
  const examine = async (url: URL, method: string, target: string): Promise<AllowedTarget | Failure> => {
    try {
      return await checkHost(policy, url, PROXY_PATH, `the ${method} request`);
    } catch (error) {
      if (!isHostNotAllowed(error)) return { status: 502, message: NO_CONNECTION };
      const refusal: ProxyRefusal = { method, target, reason: error instanceof Error ? error.message : String(error) };
      if (refusals.length < MAX_PROXY_REFUSALS) refusals.push(refusal);
      try {
        options.onRefusal?.(refusal);
      } catch {
        // An error of the callback does not stop the proxy
      }
      return { status: 403, message: REFUSED };
    }
  };

  /** A `CONNECT` request: a tunnel to the checked addresses of the target. */
  const tunnel = async (request: IncomingMessage, client: Duplex, head: Buffer): Promise<void> => {
    let upstream: Socket | undefined;
    client.on("error", () => upstream?.destroy());
    client.once("close", () => upstream?.destroy());
    const authority = request.url ?? "";
    const url = connectUrl(authority);
    if (url === undefined) {
      rawAnswer(client, { status: 400, message: "The target of CONNECT is host:port." });
      return;
    }
    const checked = await examine(url, "CONNECT", authority);
    if (client.destroyed || closed) {
      client.destroy();
      return;
    }
    if ("status" in checked) {
      rawAnswer(client, checked);
      return;
    }
    const socket = connect({ host: checked.hostname, port: checked.port, lookup: pinnedLookup(checked) });
    upstream = socket;
    track(socket);
    let open = false;
    socket.once("connect", () => {
      open = true;
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) socket.write(head);
      socket.pipe(client);
      client.pipe(socket);
    });
    socket.on("error", () => {
      if (open) client.destroy();
      else rawAnswer(client, { status: 502, message: NO_CONNECTION });
    });
  };

  /** A plain request: the request goes to the checked addresses of its host, and the response comes back. */
  const forward = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const method = request.method ?? "GET";
    const url = plainUrl(request.url ?? "");
    if (url === undefined) {
      request.resume();
      answer(response, { status: 400, message: "The proxy takes CONNECT requests, and requests for an absolute http: URL." });
      return;
    }
    const checked = await examine(url, method, url.href);
    if (response.destroyed || closed) {
      response.destroy();
      return;
    }
    if ("status" in checked) {
      request.resume();
      answer(response, checked);
      return;
    }
    const outgoing = plainRequest({
      host: checked.hostname,
      port: checked.port,
      method,
      path: `${url.pathname}${url.search}`,
      // A proxy sends the host of the URL, not the host header of the request (RFC 9112, section 3.2.2)
      headers: { ...endToEnd(request.headers), host: url.host },
      setHost: false,
      lookup: pinnedLookup(checked),
      // A connection of its own: a pooled socket could belong to another check
      agent: false,
    });
    outgoing.on("socket", track);
    outgoing.on("response", (upstream) => {
      upstream.on("error", () => response.destroy());
      try {
        response.writeHead(upstream.statusCode ?? 502, upstream.statusMessage, endToEnd(upstream.headers));
      } catch {
        upstream.destroy();
        response.destroy();
        return;
      }
      upstream.pipe(response);
    });
    outgoing.on("error", () => {
      if (!response.headersSent) answer(response, { status: 502, message: NO_CONNECTION });
      else response.destroy();
    });
    request.on("error", () => outgoing.destroy());
    response.once("close", () => {
      if (!response.writableFinished) outgoing.destroy();
    });
    request.pipe(outgoing);
  };

  const server = createServer();
  server.on("connection", track);
  server.on("connect", (request: IncomingMessage, client: Duplex, head: Buffer) => {
    tunnel(request, client, head).catch(() => client.destroy());
  });
  server.on("request", (request: IncomingMessage, response: ServerResponse) => {
    forward(request, response).catch(() => response.destroy());
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, PROXY_HOST, () => {
      server.off("error", reject);
      resolve();
    });
  });
  server.on("error", () => undefined);
  const { port } = server.address() as AddressInfo;

  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => {
    closing ??= new Promise<void>((resolve) => {
      closed = true;
      server.close(() => resolve());
      for (const socket of sockets) socket.destroy();
    });
    return closing;
  };

  return {
    host: PROXY_HOST,
    port,
    url: `http://${PROXY_HOST}:${port}`,
    get refusals(): readonly ProxyRefusal[] {
      return [...refusals];
    },
    close,
  };
}
