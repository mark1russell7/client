/**
 * The policy proxy: CONNECT tunnels and plain requests through the host policy. The tests use a
 * local origin server and a fake resolver, so no DNS runs. The entry `127.0.0.1:<port>` of
 * `allow` lets the proxy reach the origin server of the test, and no other local port.
 */

import { createServer as createHttpServer, request as httpRequest, type IncomingHttpHeaders, type Server } from "node:http";
import { connect, createServer as createTcpServer, type AddressInfo, type Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHostPolicy, type ResolvedAddress } from "./policy.js";
import { MAX_PROXY_REFUSALS, PROXY_HOST, startPolicyProxy, type PolicyProxy, type ProxyRefusal } from "./proxy.js";

/** A request that the origin server got. */
interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
}

let origin: Server;
let originPort: number;
let seen: Seen[];
const proxies: PolicyProxy[] = [];

beforeEach(async () => {
  seen = [];
  origin = createHttpServer((request, response) => {
    seen.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers });
    response.writeHead(200, { "content-type": "text/plain", "keep-alive": "timeout=99", "x-origin": "yes" });
    response.end(`hello from ${request.url}`);
  });
  await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
  originPort = (origin.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const proxy of proxies.splice(0)) await proxy.close();
  origin.closeAllConnections();
  await new Promise<void>((resolve) => origin.close(() => resolve()));
});

/** A resolver with fixed answers. A list of lists gives the next answer at each call, and the last answer after that. */
function resolver(answers: Record<string, string[] | string[][]>): { resolve: (name: string) => Promise<ResolvedAddress[]>; calls: string[] } {
  const calls: string[] = [];
  const resolve = async (name: string): Promise<ResolvedAddress[]> => {
    const count = calls.filter((call) => call === name).length;
    calls.push(name);
    const found = answers[name];
    if (found === undefined) {
      const error = new Error(`getaddrinfo ENOTFOUND ${name}`) as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      throw error;
    }
    const list = Array.isArray(found[0]) ? (found as string[][]) : [found as string[]];
    const answer = list[Math.min(count, list.length - 1)]!;
    return answer.map((address): ResolvedAddress => ({ address, family: address.includes(":") ? 6 : 4 }));
  };
  return { resolve, calls };
}

/** This function starts a proxy that allows the origin server of the test, and closes it after the test. */
async function start(answers: Record<string, string[] | string[][]> = {}, onRefusal?: (refusal: ProxyRefusal) => void) {
  const { resolve, calls } = resolver(answers);
  const proxy = await startPolicyProxy({ policy: createHostPolicy({ allow: [`127.0.0.1:${originPort}`], resolve }), onRefusal });
  proxies.push(proxy);
  return { proxy, calls };
}

/** This function sends a plain request with an absolute URL to the proxy. */
function viaProxy(proxy: PolicyProxy, url: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: proxy.host, port: proxy.port, path: url, headers, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

/** The data of a socket until the socket ends. */
function readAll(socket: Socket): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.on("error", reject);
    socket.on("close", () => resolve(Buffer.concat(chunks).toString("latin1")));
  });
}

/** This function sends `CONNECT <authority>` to the proxy. It gives the status and the open socket. */
function tunnel(proxy: PolicyProxy, authority: string): Promise<{ status: number; head: string; socket: Socket }> {
  return new Promise((resolve, reject) => {
    const socket = connect(proxy.port, proxy.host);
    let text = "";
    const onData = (chunk: Buffer): void => {
      text += chunk.toString("latin1");
      const end = text.indexOf("\r\n\r\n");
      if (end < 0) return;
      socket.off("data", onData);
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0);
      resolve({ status, head: text, socket });
    };
    socket.on("data", onData);
    socket.on("error", reject);
    socket.write(`CONNECT ${authority} HTTP/1.1\r\nhost: ${authority}\r\n\r\n`);
  });
}

/** This function sends a GET through an open tunnel, and gives the whole answer of the server. */
async function getThrough(socket: Socket, path: string): Promise<string> {
  const all = readAll(socket);
  socket.write(`GET ${path} HTTP/1.1\r\nhost: tunnel.example\r\nconnection: close\r\n\r\n`);
  return all;
}

/** True when a connection to the port fails. */
function refusesConnections(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

describe("startPolicyProxy", () => {
  it("listens on 127.0.0.1 and gives its URL", async () => {
    const { proxy } = await start();
    expect(proxy.host).toBe(PROXY_HOST);
    expect(proxy.port).toBeGreaterThan(0);
    expect(proxy.url).toBe(`http://127.0.0.1:${proxy.port}`);
    expect(proxy.refusals).toEqual([]);
    expect(MAX_PROXY_REFUSALS).toBe(1000);
  });

  it("sends a plain request with an absolute URL to an allowed host, without the headers of one connection", async () => {
    const { proxy } = await start();
    const response = await viaProxy(proxy, `http://127.0.0.1:${originPort}/page?x=1`, {
      "proxy-connection": "keep-alive",
      "proxy-authorization": "Basic c2VjcmV0",
      connection: "keep-alive, x-private",
      "x-private": "one hop",
      "x-kept": "end to end",
    });
    expect(response.status).toBe(200);
    expect(response.body).toBe("hello from /page?x=1");
    expect(response.headers["x-origin"]).toBe("yes");
    // The proxy can add a keep-alive header of its own connection, but not the header of the origin
    expect(response.headers["keep-alive"]).not.toBe("timeout=99");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("/page?x=1");
    expect(seen[0]!.headers.host).toBe(`127.0.0.1:${originPort}`);
    expect(seen[0]!.headers["x-kept"]).toBe("end to end");
    for (const name of ["proxy-connection", "proxy-authorization", "x-private"]) expect(seen[0]!.headers[name], name).toBeUndefined();
  });

  it("opens a CONNECT tunnel to an allowed host", async () => {
    const { proxy } = await start();
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${originPort}`);
    expect(status).toBe(200);
    const answer = await getThrough(socket, "/through");
    expect(answer).toMatch(/^HTTP\/1\.1 200 OK/);
    expect(answer).toContain("hello from /through");
    expect(proxy.refusals).toEqual([]);
  });

  it("connects a host name to the address that the check allowed", async () => {
    const { proxy, calls } = await start({ "site.example": ["127.0.0.1"] });
    const response = await viaProxy(proxy, `http://site.example:${originPort}/named`);
    expect(response.status).toBe(200);
    expect(seen[0]!.headers.host).toBe(`site.example:${originPort}`);
    const { status, socket } = await tunnel(proxy, `site.example:${originPort}`);
    expect(status).toBe(200);
    expect(await getThrough(socket, "/named-tunnel")).toContain("hello from /named-tunnel");
    expect(calls).toEqual(["site.example", "site.example"]);
  });

  it("refuses a name that resolves to 127.0.0.1 with 403, and records and reports the refusal", async () => {
    const reported: ProxyRefusal[] = [];
    const { proxy } = await start({ "local.example": ["127.0.0.1"] }, (refusal) => reported.push(refusal));
    const plain = await viaProxy(proxy, "http://local.example/admin");
    expect(plain.status).toBe(403);
    expect(plain.body).not.toContain("127.0.0.1");
    const { status, socket } = await tunnel(proxy, "local.example:443");
    expect(status).toBe(403);
    socket.destroy();
    expect(seen).toEqual([]);
    expect(proxy.refusals).toEqual([
      { method: "GET", target: "http://local.example/admin", reason: expect.stringMatching(/127\.0\.0\.1 is a loopback address/) },
      { method: "CONNECT", target: "local.example:443", reason: expect.stringMatching(/127\.0\.0\.1 is a loopback address/) },
    ]);
    expect(reported).toEqual(proxy.refusals);
  });

  it("refuses loopback, private and link-local addresses, and a port of 127.0.0.1 that allow does not name", async () => {
    const { proxy } = await start({ localhost: ["127.0.0.1", "::1"] });
    for (const authority of [`127.0.0.1:${originPort + 1}`, "localhost:80", "[::1]:443", "10.0.0.1:443", "169.254.169.254:80", "0x7f.1:443"]) {
      const { status, socket } = await tunnel(proxy, authority);
      socket.destroy();
      expect(status, authority).toBe(403);
    }
    expect((await viaProxy(proxy, "http://192.168.1.1/")).status).toBe(403);
    expect(proxy.refusals.map((refusal) => refusal.target)).toEqual([
      `127.0.0.1:${originPort + 1}`,
      "localhost:80",
      "[::1]:443",
      "10.0.0.1:443",
      "169.254.169.254:80",
      "0x7f.1:443",
      "http://192.168.1.1/",
    ]);
    expect(seen).toEqual([]);
  });

  it("uses only the checked address when the DNS gives a public address and then a local one (DNS rebinding)", async () => {
    // 127.0.0.1 of the origin server stands for the public address: the entry of allow lets it pass
    const { proxy, calls } = await start({ "rebind.example": [["127.0.0.1"], ["10.0.0.5"]] });
    const first = await viaProxy(proxy, `http://rebind.example:${originPort}/first`);
    expect(first.status).toBe(200);
    expect(first.body).toBe("hello from /first");
    // One look-up for one request: the connection did not ask the DNS again
    expect(calls).toEqual(["rebind.example"]);
    const second = await tunnel(proxy, `rebind.example:${originPort}`);
    second.socket.destroy();
    expect(second.status).toBe(403);
    expect(proxy.refusals).toEqual([{ method: "CONNECT", target: `rebind.example:${originPort}`, reason: expect.stringMatching(/10\.0\.0\.5 is a private address/) }]);
    expect(seen.map((request) => request.url)).toEqual(["/first"]);
  });

  it("connects only to the allowed address of a name with a refused and an allowed address", async () => {
    const { proxy } = await start({ "mixed.example": ["10.0.0.5", "127.0.0.1"] });
    const { status, socket } = await tunnel(proxy, `mixed.example:${originPort}`);
    expect(status).toBe(200);
    expect(await getThrough(socket, "/mixed")).toContain("hello from /mixed");
    expect(proxy.refusals).toEqual([]);
  });

  it("gives 502 for a host with no address and for a connection that fails, and records no refusal", async () => {
    const closedPort = await new Promise<number>((resolve) => {
      const probe = createTcpServer();
      probe.listen(0, "127.0.0.1", () => {
        const { port } = probe.address() as AddressInfo;
        probe.close(() => resolve(port));
      });
    });
    const { resolve, calls } = resolver({});
    const proxy = await startPolicyProxy({ policy: createHostPolicy({ allow: [`127.0.0.1:${closedPort}`], resolve }) });
    proxies.push(proxy);
    expect((await viaProxy(proxy, "http://missing.example/")).status).toBe(502);
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${closedPort}`);
    socket.destroy();
    expect(status).toBe(502);
    expect(calls).toEqual(["missing.example"]);
    expect(proxy.refusals).toEqual([]);
  });

  it("gives 400 for a request that is not CONNECT or an absolute http: URL", async () => {
    const { proxy } = await start();
    expect((await viaProxy(proxy, "/relative")).status).toBe(400);
    expect((await viaProxy(proxy, `https://127.0.0.1:${originPort}/`)).status).toBe(400);
    for (const authority of ["no-port.example", "a.example:0", "a.example:70000", "user@localhost:443"]) {
      const { status, socket } = await tunnel(proxy, authority);
      socket.destroy();
      expect(status, authority).toBe(400);
    }
    expect(seen).toEqual([]);
    expect(proxy.refusals).toEqual([]);
  });

  it("keeps the proxy running when onRefusal throws", async () => {
    const { proxy } = await start({}, () => {
      throw new Error("the callback failed");
    });
    expect((await viaProxy(proxy, "http://10.1.2.3/")).status).toBe(403);
    expect((await viaProxy(proxy, `http://127.0.0.1:${originPort}/after`)).status).toBe(200);
    expect(proxy.refusals).toHaveLength(1);
  });

  it("uses the default policy without options: it refuses loopback", async () => {
    const proxy = await startPolicyProxy();
    proxies.push(proxy);
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${originPort}`);
    socket.destroy();
    expect(status).toBe(403);
  });

  it("closes the open tunnels and frees the port at close()", async () => {
    const { proxy } = await start();
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${originPort}`);
    expect(status).toBe(200);
    const ended = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    await proxy.close();
    await ended;
    expect(await refusesConnections(proxy.port)).toBe(true);
    // The port is free: a new server can listen on it
    const again = createTcpServer();
    await new Promise<void>((resolve, reject) => {
      again.once("error", reject);
      again.listen(proxy.port, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve) => again.close(() => resolve()));
    // A second close does nothing
    await proxy.close();
  });
});
