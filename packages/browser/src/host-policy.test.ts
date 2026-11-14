/**
 * The option hostPolicy of the headless run, on the argv and the lifecycle of the proxy. A fake
 * runner acts as the browser: it sends its requests through the proxy of the flag --proxy-server.
 * No real browser runs. The names resolve with a fake resolver, so no DNS runs.
 */

import { createServer, request as httpRequest, type Server } from "node:http";
import { connect, type AddressInfo } from "node:net";
import { writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHostPolicy, type HostPolicy, type ProxyRefusal, type ResolvedAddress } from "@procedures/http";
import type { CommandOptions, CommandResult } from "@procedures/shell/command";
import { policyProxyArgs, type CommandRunner } from "./run.js";
import { renderPdf } from "./pdf.js";
import { renderScreenshotBytes } from "./screenshot.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const OK: CommandResult = { exitCode: 0, stdout: "", stderr: "", success: true, duration: 1 };
const BROWSER = { executable: "/fake/browser" };

const flag = (args: readonly string[], name: string): string | undefined => args.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1);

let origin: Server;
let originPort: number;
let seen: string[];

beforeEach(async () => {
  seen = [];
  origin = createServer((request, response) => {
    seen.push(request.url ?? "");
    response.end("origin");
  });
  await new Promise<void>((resolve) => origin.listen(0, "127.0.0.1", resolve));
  originPort = (origin.address() as AddressInfo).port;
});

afterEach(async () => {
  origin.closeAllConnections();
  await new Promise<void>((resolve) => origin.close(() => resolve()));
});

/** A policy that allows the origin server of the test, and resolves `local.example` to 127.0.0.1. */
function testPolicy(): HostPolicy {
  const answers: Record<string, string[]> = { "local.example": ["127.0.0.1"] };
  const resolve = async (name: string): Promise<ResolvedAddress[]> => {
    const found = answers[name];
    if (found === undefined) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${name}`), { code: "ENOTFOUND" });
    return found.map((address) => ({ address, family: 4 as const }));
  };
  return createHostPolicy({ allow: [`127.0.0.1:${originPort}`], resolve });
}

/** This function sends a GET with an absolute URL to the proxy, and gives the status. */
function getVia(proxy: string, url: string): Promise<number> {
  const { hostname, port } = new URL(proxy);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({ host: hostname, port: Number(port), path: url, agent: false }, (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode ?? 0));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
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

interface Run {
  readonly args: readonly string[];
  readonly allowed: number;
  readonly refused: number;
}

/** A runner that acts as a browser: it loads one allowed and one refused address through the proxy, then writes the picture. */
function proxiedBrowser(write = true): { runner: CommandRunner; runs: Run[] } {
  const runs: Run[] = [];
  const runner: CommandRunner = async (_command: string, options: CommandOptions) => {
    const args = options.args ?? [];
    const proxy = flag(args, "--proxy-server");
    let allowed = 0;
    let refused = 0;
    if (proxy !== undefined) {
      allowed = await getVia(proxy, `http://127.0.0.1:${originPort}/image.png`);
      refused = await getVia(proxy, "http://local.example/admin");
    }
    runs.push({ args, allowed, refused });
    const out = flag(args, "--screenshot");
    if (write && out !== undefined) writeFileSync(out, PNG);
    return OK;
  };
  return { runner, runs };
}

describe("policyProxyArgs", () => {
  it("gives the proxy, the bypass rule, and the flags that close QUIC, the UDP of WebRTC and the DNS of the browser", () => {
    expect(policyProxyArgs("http://127.0.0.1:41234")).toEqual([
      "--proxy-server=http://127.0.0.1:41234",
      "--proxy-bypass-list=<-loopback>",
      "--disable-quic",
      "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1",
    ]);
  });
});

describe("the option hostPolicy of a render", () => {
  it("starts a proxy for the run, gives its flags before args, applies the policy to each request, and closes the proxy", async () => {
    const { runner, runs } = proxiedBrowser();
    const reported: ProxyRefusal[] = [];
    const { data } = await renderScreenshotBytes({
      url: "https://site.example/",
      ...BROWSER,
      runner,
      args: ["--no-sandbox"],
      hostPolicy: testPolicy(),
      onHostRefusal: (refusal) => reported.push(refusal),
    });
    expect(Buffer.from(data).equals(PNG)).toBe(true);
    expect(runs).toHaveLength(1);
    const { args, allowed, refused } = runs[0]!;
    const proxy = new URL(flag(args, "--proxy-server")!);
    const port = Number(proxy.port);
    expect(proxy.hostname).toBe("127.0.0.1");
    const start = args.indexOf(`--proxy-server=${proxy.origin}`);
    expect(args.slice(start, start + 6)).toEqual([...policyProxyArgs(proxy.origin), "--no-sandbox"]);
    expect(args.at(-1)).toBe("https://site.example/");
    expect(allowed).toBe(200);
    expect(refused).toBe(403);
    expect(seen).toEqual(["/image.png"]);
    expect(reported).toEqual([{ method: "GET", target: "http://local.example/admin", reason: expect.stringMatching(/loopback address/) }]);
    expect(await refusesConnections(port)).toBe(true);
  });

  it("closes the proxy after a failed render and after a runner that throws", async () => {
    const failed = proxiedBrowser(false);
    await expect(renderScreenshotBytes({ url: "https://site.example/", ...BROWSER, runner: failed.runner, hostPolicy: testPolicy() })).rejects.toThrow(/made no PNG file/);
    const failedPort = Number(new URL(flag(failed.runs[0]!.args, "--proxy-server")!).port);
    expect(await refusesConnections(failedPort)).toBe(true);

    let thrownPort = 0;
    const throwing: CommandRunner = async (_command, options) => {
      thrownPort = Number(new URL(flag(options.args ?? [], "--proxy-server")!).port);
      throw new Error("the runner failed");
    };
    await expect(renderScreenshotBytes({ url: "https://site.example/", ...BROWSER, runner: throwing, hostPolicy: testPolicy() })).rejects.toThrow("the runner failed");
    expect(thrownPort).toBeGreaterThan(0);
    expect(await refusesConnections(thrownPort)).toBe(true);
  });

  it("gives the flags to a PDF render too", async () => {
    let args: readonly string[] = [];
    const runner: CommandRunner = async (_command, options) => {
      args = options.args ?? [];
      writeFileSync(args.find((arg) => arg.startsWith("--print-to-pdf="))!.slice("--print-to-pdf=".length), "%PDF-1.7\n");
      return OK;
    };
    await renderPdf({ html: "<p>a</p>", ...BROWSER, runner, hostPolicy: testPolicy() });
    expect(flag(args, "--proxy-server")).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(args).toContain("--disable-quic");
  });

  it("fails a render of an http: or https: URL when no request went through the proxy, and closes the proxy", async () => {
    // A browser with a machine policy for its proxy: it ignores --proxy-server, and makes the file without the proxy
    const ports: number[] = [];
    const bypassing: CommandRunner = async (_command, options) => {
      const args = options.args ?? [];
      ports.push(Number(new URL(flag(args, "--proxy-server")!).port));
      writeFileSync(flag(args, "--screenshot")!, PNG);
      return OK;
    };
    for (const url of ["https://site.example/", "HTTP://site.example/page"]) {
      await expect(renderScreenshotBytes({ url, ...BROWSER, runner: bypassing, hostPolicy: testPolicy() }), url).rejects.toThrow(
        "The browser sent no request through the policy proxy, so the host policy did not apply. A Chrome or Edge policy (ProxySettings or ProxyMode) can replace the flag --proxy-server.",
      );
    }
    expect(ports).toHaveLength(2);
    for (const port of ports) expect(await refusesConnections(port)).toBe(true);
    // A page of HTML or of a data: URL can have no request, so the gate does not apply to it
    for (const source of [{ html: "<p>a</p>" }, { url: "data:text/html,<p>a</p>" }]) {
      const { data } = await renderScreenshotBytes({ ...source, ...BROWSER, runner: bypassing, hostPolicy: testPolicy() });
      expect(Buffer.from(data).equals(PNG)).toBe(true);
    }
    // Without hostPolicy there is no proxy, and no gate
    const plain: CommandRunner = async (_command, options) => {
      writeFileSync(flag(options.args ?? [], "--screenshot")!, PNG);
      return OK;
    };
    const { data } = await renderScreenshotBytes({ url: "https://site.example/", ...BROWSER, runner: plain });
    expect(Buffer.from(data).equals(PNG)).toBe(true);
  });

  it("refuses each flag of args that can undo the proxy flags, before the browser starts", async () => {
    const { runner, runs } = proxiedBrowser();
    const conflicts = [
      "--proxy-server=http://other.example:8080",
      "--proxy-bypass-list=*",
      "-no-proxy-server",
      "/PROXY-PAC-URL=http://pac.example/proxy.pac",
      "--proxy-auto-detect",
      "--use-system-proxy-resolver",
      "--winhttp-proxy-resolver",
      "--enable-quic",
      "--origin-to-force-quic-on=site.example:443",
      "--force-webrtc-ip-handling-policy=default",
      "--Host-Resolver-Rules=MAP * 127.0.0.1",
      "--host-rules=MAP * 127.0.0.1",
    ];
    for (const conflict of conflicts) {
      await expect(renderScreenshotBytes({ url: "https://site.example/", ...BROWSER, runner, args: [conflict], hostPolicy: testPolicy() }), conflict).rejects.toThrow(
        /args cannot have the flag --/,
      );
    }
    expect(runs).toEqual([]);
    // A flag that only repeats a flag of the proxy is not a conflict
    await renderScreenshotBytes({ url: "https://site.example/", ...BROWSER, runner, args: ["--disable-quic"], hostPolicy: testPolicy() });
    expect(runs).toHaveLength(1);
  });

  it("refuses onHostRefusal without hostPolicy", async () => {
    const { runner, runs } = proxiedBrowser();
    await expect(renderScreenshotBytes({ url: "https://site.example/", ...BROWSER, runner, onHostRefusal: () => undefined })).rejects.toThrow(/onHostRefusal needs the option hostPolicy/);
    expect(runs).toEqual([]);
  });

  it("starts no proxy and keeps the argv without hostPolicy, also with proxy flags in args", async () => {
    const { runner, runs } = proxiedBrowser();
    await renderScreenshotBytes({ url: "https://site.example/", ...BROWSER, runner, args: ["--no-proxy-server"] });
    const { args } = runs[0]!;
    expect(flag(args, "--proxy-server")).toBeUndefined();
    for (const name of ["--proxy-bypass-list", "--force-webrtc-ip-handling-policy", "--host-resolver-rules"]) expect(flag(args, name), name).toBeUndefined();
    expect(args).not.toContain("--disable-quic");
    expect(args.at(-2)).toBe("--no-proxy-server");
  });
});
