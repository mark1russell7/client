/**
 * The policy proxy: CONNECT tunnels and plain requests through the host policy. The tests use a
 * local origin server and a fake resolver, so no DNS runs. The entry `127.0.0.1:<port>` of
 * `allow` lets the proxy reach the origin server of the test, and no other local port.
 */

import { createServer as createHttpServer, request as httpRequest, type IncomingHttpHeaders, type Server, type ServerResponse } from "node:http";
import { connect, createServer as createTcpServer, type AddressInfo, type Server as TcpServer, type Socket } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
// The public entry of the package
import { createHostPolicy, MAX_PROXY_REFUSALS, PROXY_HOST, startPolicyProxy, type PolicyProxy, type ProxyRefusal, type ResolvedAddress } from "./index.js";

/** A request that the origin server got. */
interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
}

/** A request body that the origin server got: the text, and true when the body came to its end. */
interface Upload {
  readonly body: string;
  readonly complete: boolean;
}

let origin: Server;
let originPort: number;
let originConnections: number;
let seen: Seen[];
let uploads: Upload[];
/** The response of `/cut`: the origin sends 10 of 100 bytes, and the test resets the connection. */
let cut: ServerResponse | undefined;
const proxies: PolicyProxy[] = [];
const servers: TcpServer[] = [];

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  seen = [];
  uploads = [];
  cut = undefined;
  originConnections = 0;
  origin = createHttpServer((request, response) => {
    seen.push({ method: request.method ?? "", url: request.url ?? "", headers: request.headers });
    if (request.url === "/cut") {
      response.writeHead(200, { "content-type": "text/plain", "content-length": "100" });
      response.write("0123456789");
      cut = response;
      return;
    }
    if (request.url === "/upload") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk: string) => (body += chunk));
      request.once("close", () => uploads.push({ body, complete: request.complete }));
      request.once("end", () => response.end(`got ${body}`));
      return;
    }
    response.writeHead(200, { "content-type": "text/plain", "keep-alive": "timeout=99", "x-origin": "yes" });
    response.end(`hello from ${request.url}`);
  });
  origin.on("connection", () => (originConnections += 1));
  await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
  originPort = (origin.address() as AddressInfo).port;
});

afterEach(async () => {
  for (const proxy of proxies.splice(0)) await proxy.close();
  for (const server of servers.splice(0)) await new Promise<void>((resolve) => server.close(() => resolve()));
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

/** This function starts a proxy that allows only one port of 127.0.0.1. */
async function startFor(port: number): Promise<PolicyProxy> {
  const proxy = await startPolicyProxy({ policy: createHostPolicy({ allow: [`127.0.0.1:${port}`] }) });
  proxies.push(proxy);
  return proxy;
}

/** This function starts a TCP server on 127.0.0.1 that gives each first chunk of a connection to `onData`. */
async function rawServer(onData: (socket: Socket, chunk: Buffer) => void): Promise<number> {
  const server = createTcpServer((socket) => {
    socket.on("error", () => undefined);
    socket.once("data", (chunk: Buffer) => onData(socket, chunk));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as AddressInfo).port;
}

/** A port of 127.0.0.1 with no listener. */
function closedPort(): Promise<number> {
  return new Promise<number>((resolve) => {
    const probe = createTcpServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

/** This function sends a plain request with an absolute URL to the proxy. */
function viaProxy(
  proxy: PolicyProxy,
  url: string,
  headers: Record<string, string> = {},
  body?: string,
): Promise<{ status: number; headers: IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: proxy.host, port: proxy.port, path: url, method: body === undefined ? "GET" : "POST", headers, agent: false }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

/** The data of a socket until the socket closes. */
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

/** A socket to the proxy that writes `text` at once. Its errors are part of the test, so they do not throw. */
function rawClient(proxy: PolicyProxy, text: string): Socket {
  const socket = connect(proxy.port, proxy.host);
  socket.on("error", () => undefined);
  socket.write(text);
  return socket;
}

describe("startPolicyProxy", () => {
  it("listens on 127.0.0.1 and gives its URL", async () => {
    const { proxy } = await start();
    expect(proxy.host).toBe(PROXY_HOST);
    expect(proxy.port).toBeGreaterThan(0);
    expect(proxy.url).toBe(`http://127.0.0.1:${proxy.port}`);
    expect(proxy.refusals).toEqual([]);
    expect(proxy.requests).toBe(0);
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
    expect(proxy.requests).toBe(1);
  });

  it("sends the body of a plain request to the host", async () => {
    const { proxy } = await start();
    const response = await viaProxy(proxy, `http://127.0.0.1:${originPort}/upload`, { "content-type": "text/plain" }, "a body");
    expect(response.status).toBe(200);
    expect(response.body).toBe("got a body");
    expect(seen[0]!.method).toBe("POST");
    for (let wait = 0; wait < 200 && uploads.length === 0; wait += 1) await delay(10);
    expect(uploads).toEqual([{ body: "a body", complete: true }]);
  });

  it("opens a CONNECT tunnel to an allowed host", async () => {
    const { proxy } = await start();
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${originPort}`);
    expect(status).toBe(200);
    const answer = await getThrough(socket, "/through");
    expect(answer).toMatch(/^HTTP\/1\.1 200 OK/);
    expect(answer).toContain("hello from /through");
    expect(proxy.refusals).toEqual([]);
    expect(proxy.requests).toBe(1);
  });

  it("sends the bytes after the CONNECT request in the same packet to the host", async () => {
    const { proxy } = await start();
    const socket = rawClient(
      proxy,
      `CONNECT 127.0.0.1:${originPort} HTTP/1.1\r\nhost: 127.0.0.1:${originPort}\r\n\r\nGET /early HTTP/1.1\r\nhost: tunnel.example\r\nconnection: close\r\n\r\n`,
    );
    const answer = await readAll(socket);
    expect(answer).toMatch(/^HTTP\/1\.1 200 Connection Established\r\n\r\nHTTP\/1\.1 200 OK/);
    expect(answer).toContain("hello from /early");
    expect(seen.map((request) => request.url)).toEqual(["/early"]);
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
    expect(proxy.requests).toBe(2);
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
    const port = await closedPort();
    const { resolve, calls } = resolver({});
    const proxy = await startPolicyProxy({ policy: createHostPolicy({ allow: [`127.0.0.1:${port}`], resolve }) });
    proxies.push(proxy);
    expect((await viaProxy(proxy, "http://missing.example/")).status).toBe(502);
    const plain = await viaProxy(proxy, `http://127.0.0.1:${port}/`);
    expect(plain.status).toBe(502);
    expect(plain.body).toBe("The proxy cannot connect to this host.\n");
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${port}`);
    socket.destroy();
    expect(status).toBe(502);
    const missing = await tunnel(proxy, "missing.example:443");
    missing.socket.destroy();
    expect(missing.status).toBe(502);
    expect(calls).toEqual(["missing.example", "missing.example"]);
    expect(proxy.refusals).toEqual([]);
    expect(proxy.requests).toBe(4);
  });

  it("gives 502 for a response with a status that the proxy cannot send on", async () => {
    const port = await rawServer((socket) => socket.end("HTTP/1.1 099 Odd\r\ncontent-length: 0\r\n\r\n"));
    const proxy = await startFor(port);
    const response = await viaProxy(proxy, `http://127.0.0.1:${port}/`);
    expect(response.status).toBe(502);
    expect(response.body).toBe("The host gave a response that the proxy cannot send on.\n");
  });

  it("gives 502 for a status text with a control character, and keeps running", async () => {
    const port = await rawServer((socket) => socket.end("HTTP/1.1 200 O\u0001K\r\ncontent-length: 0\r\n\r\n"));
    const proxy = await startFor(port);
    expect((await viaProxy(proxy, `http://127.0.0.1:${port}/`)).status).toBe(502);
    expect((await viaProxy(proxy, `http://127.0.0.1:${port}/`)).status).toBe(502);
    expect(proxy.requests).toBe(2);
  });

  it("gives 400 for a request that is not CONNECT or an absolute http: URL", async () => {
    const { proxy } = await start();
    expect((await viaProxy(proxy, "/relative")).status).toBe(400);
    expect((await viaProxy(proxy, `https://127.0.0.1:${originPort}/`)).status).toBe(400);
    // The parser of the server takes this URL, and the URL parser refuses its host
    expect((await viaProxy(proxy, "http://a%zz/")).status).toBe(400);
    for (const authority of ["no-port.example", "a.example:0", "a.example:70000", "user@localhost:443", "a%zz:80"]) {
      const { status, socket } = await tunnel(proxy, authority);
      socket.destroy();
      expect(status, authority).toBe(400);
    }
    expect(seen).toEqual([]);
    expect(proxy.refusals).toEqual([]);
    expect(proxy.requests).toBe(8);
  });

  it("keeps the proxy running when onRefusal throws", async () => {
    const { proxy } = await start({}, () => {
      throw new Error("the callback failed");
    });
    expect((await viaProxy(proxy, "http://10.1.2.3/")).status).toBe(403);
    expect((await viaProxy(proxy, `http://127.0.0.1:${originPort}/after`)).status).toBe(200);
    expect(proxy.refusals).toHaveLength(1);
  });

  it(`keeps the first ${MAX_PROXY_REFUSALS} refusals, and gives each refusal to onRefusal`, { timeout: 60_000 }, async () => {
    let reported = 0;
    const { proxy } = await start({}, () => {
      reported += 1;
    });
    const total = MAX_PROXY_REFUSALS + 1;
    for (let first = 0; first < total; first += 50) {
      const batch = Array.from({ length: Math.min(50, total - first) }, (_, index) => viaProxy(proxy, `http://10.0.0.1/${first + index}`));
      for (const response of await Promise.all(batch)) expect(response.status).toBe(403);
    }
    expect(reported).toBe(total);
    expect(proxy.refusals).toHaveLength(MAX_PROXY_REFUSALS);
    expect(proxy.requests).toBe(total);
  });

  it("uses the default policy without options: it refuses loopback", async () => {
    const proxy = await startPolicyProxy();
    proxies.push(proxy);
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${originPort}`);
    socket.destroy();
    expect(status).toBe(403);
  });

  it("closes the tunnel when the host resets the connection", async () => {
    const port = await rawServer((socket) => socket.resetAndDestroy());
    const proxy = await startFor(port);
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${port}`);
    expect(status).toBe(200);
    const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    socket.on("error", () => undefined);
    socket.write("ping");
    await closed;
    expect(socket.destroyed).toBe(true);
  });

  it("stops the response to the client when the host stops its response early", async () => {
    const { proxy } = await start();
    const result = await new Promise<{ status: number; complete: boolean; received: string }>((resolve) => {
      const outgoing = httpRequest({ host: proxy.host, port: proxy.port, path: `http://127.0.0.1:${originPort}/cut`, agent: false }, (response) => {
        let received = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          // The first data shows that the proxy sent the head of the response. Then the host resets the connection
          if (received === "") cut?.socket?.resetAndDestroy();
          received += chunk;
        });
        response.on("error", () => undefined);
        response.once("close", () => resolve({ status: response.statusCode ?? 0, complete: response.complete, received }));
      });
      outgoing.on("error", () => undefined);
      outgoing.end();
    });
    expect(result).toEqual({ status: 200, complete: false, received: "0123456789" });
  });

  it("stops the request to the host when the client goes away during the request body", async () => {
    const { proxy } = await start();
    const socket = rawClient(proxy, `POST http://127.0.0.1:${originPort}/upload HTTP/1.1\r\nhost: x\r\ncontent-length: 100\r\n\r\npart`);
    for (let wait = 0; wait < 200 && seen.length === 0; wait += 1) await delay(10);
    expect(seen.map((request) => request.url)).toEqual(["/upload"]);
    socket.resetAndDestroy();
    for (let wait = 0; wait < 200 && uploads.length === 0; wait += 1) await delay(10);
    expect(uploads).toEqual([{ body: "part", complete: false }]);
  });

  it("does not connect when the client goes away during the check of the host", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });
    const asked: string[] = [];
    const resolve = async (name: string): Promise<ResolvedAddress[]> => {
      asked.push(name);
      await gate;
      return [{ address: "127.0.0.1", family: 4 }];
    };
    const proxy = await startPolicyProxy({ policy: createHostPolicy({ allow: [`127.0.0.1:${originPort}`], resolve }) });
    proxies.push(proxy);
    const viaTunnel = rawClient(proxy, `CONNECT slow.example:${originPort} HTTP/1.1\r\nhost: slow.example:${originPort}\r\n\r\n`);
    const plain = rawClient(proxy, `GET http://slow.example:${originPort}/slow HTTP/1.1\r\nhost: slow.example\r\n\r\n`);
    for (let wait = 0; wait < 200 && asked.length < 2; wait += 1) await delay(10);
    expect(asked).toEqual(["slow.example", "slow.example"]);
    viaTunnel.resetAndDestroy();
    plain.resetAndDestroy();
    // The proxy sees the two resets before the check ends
    await delay(50);
    release();
    await delay(50);
    expect(originConnections).toBe(0);
    expect(seen).toEqual([]);
    expect(proxy.requests).toBe(2);
  });

  it("closes the open tunnels and frees the port at close()", async () => {
    const { proxy } = await start();
    const { status, socket } = await tunnel(proxy, `127.0.0.1:${originPort}`);
    expect(status).toBe(200);
    const ended = new Promise<void>((resolve) => socket.once("close", () => resolve()));
    await proxy.close();
    await ended;
    expect(await refusesConnections(proxy.port)).toBe(true);
    // The count stays after close
    expect(proxy.requests).toBe(1);
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
