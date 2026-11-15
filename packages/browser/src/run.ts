/**
 * The headless run of a browser that is already installed. The run starts the browser one time with
 * argv, in a new temporary folder with its own profile. Each render of this package (the PDF file,
 * the screenshot) uses this run, and gives only its flags and the check of its file.
 *
 * The browser starts through `runCommand` of `@procedures/shell`, not through a shell. A time limit
 * and the signal of the call stop its process tree.
 *
 * With the option `hostPolicy`, the run starts a policy proxy of `@procedures/http`. The browser
 * sends each request through the proxy, and the proxy applies the host policy to each request.
 * When the page is an `http:` or `https:` URL and the proxy gets no request, the run fails.
 */

import { closeSync, copyFileSync, mkdirSync, mkdtempSync, openSync, readSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startPolicyProxy, type HostPolicy, type ProxyRefusal } from "@procedures/http";
import { runCommand, type CommandOptions, type CommandResult } from "@procedures/shell/command";
import { BROWSER_ENV, findBrowser, type FindBrowserOptions } from "./browser.js";

/** The default time limit of one render, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 60_000;

/** The function that runs a program. The default is `runCommand` of `@procedures/shell`. */
export type CommandRunner = (command: string, options: CommandOptions) => Promise<CommandResult>;

/** The options of each render. */
export interface HeadlessOptions extends FindBrowserOptions {
  /** The path of the output file. The default is a file in a new temporary folder. */
  readonly output?: string | undefined;
  /** More flags for the browser, after the default flags. */
  readonly args?: readonly string[] | undefined;
  /** The time limit, in milliseconds (default: 60000). */
  readonly timeout?: number | undefined;
  /** When the signal aborts, the browser stops. */
  readonly signal?: AbortSignal | undefined;
  /** The function that runs the browser (default: `runCommand`). The tests give their own. */
  readonly runner?: CommandRunner | undefined;
  /**
   * The host policy of each request of the browser. With it, each request goes through a policy
   * proxy, also each redirect and each resource of the page. The proxy gives the status 403 to
   * each host that the policy refuses.
   */
  readonly hostPolicy?: HostPolicy | undefined;
  /** This function gets each request that the host policy refused. It needs `hostPolicy`. */
  readonly onHostRefusal?: ((refusal: ProxyRefusal) => void) | undefined;
}

/**
 * The switches that the flags of the policy proxy set, and the switches that can undo these flags.
 * With a host policy, the run refuses each of them in `args`.
 */
const POLICY_SWITCHES: ReadonlySet<string> = new Set([
  "proxy-server",
  "proxy-bypass-list",
  "no-proxy-server",
  "proxy-pac-url",
  "proxy-auto-detect",
  "use-system-proxy-resolver",
  "winhttp-proxy-resolver",
  "enable-quic",
  "origin-to-force-quic-on",
  "force-webrtc-ip-handling-policy",
  "host-resolver-rules",
  "host-rules",
]);

/**
 * This function gives the flags that send each request of the browser through the proxy at
 * `proxyUrl`, and that close the paths around the proxy.
 *
 * - `--proxy-server` sends each `http:`, `https:`, `ws:` and `wss:` request to the proxy. The proxy
 *   resolves each name, not the browser.
 * - `--proxy-bypass-list=<-loopback>` removes the default bypass of `localhost`, of the loopback
 *   addresses and of the link-local addresses. Thus these requests also go to the proxy.
 * - `--disable-quic` stops the QUIC protocol, so no request goes over UDP around the proxy.
 * - `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` stops the UDP of WebRTC, and shows no
 *   local address.
 * - `--host-resolver-rules` stops each DNS look-up of the browser. The only exception is the address
 *   of the proxy.
 */
export function policyProxyArgs(proxyUrl: string): string[] {
  const { hostname } = new URL(proxyUrl);
  return [
    `--proxy-server=${proxyUrl}`,
    "--proxy-bypass-list=<-loopback>",
    "--disable-quic",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
    `--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${hostname}`,
  ];
}

/**
 * This function gives the name of the switch of a flag, or undefined for a value that is not a
 * switch. The browser takes the prefixes `--`, `-` and, on Windows, `/`. Windows ignores the case of
 * the name. Thus the function takes each prefix, and gives the name in lower case.
 */
function switchName(arg: string): string | undefined {
  const match = /^(?:--|-|\/)([^=]+)/.exec(arg);
  return match?.[1]?.toLowerCase();
}

/** This function throws when the options of the host policy do not agree with the other options. */
function checkPolicyOptions(options: HeadlessOptions): void {
  if (options.hostPolicy === undefined) {
    if (options.onHostRefusal !== undefined) throw new Error("The option onHostRefusal needs the option hostPolicy");
    return;
  }
  for (const arg of options.args ?? []) {
    const name = switchName(arg);
    if (name !== undefined && POLICY_SWITCHES.has(name)) {
      throw new Error(`The option hostPolicy sets the proxy flags of the browser, so args cannot have the flag --${name}`);
    }
  }
}

/** The result of a render. */
export interface RenderResult {
  /** The absolute path of the output file. */
  readonly path: string;
  /** The size of the output file, in bytes. */
  readonly bytes: number;
  /** The browser program that made the file. */
  readonly browser: string;
}

/** The page of a render: an address, an HTML text or the path of an HTML file. */
export type PageSource = { readonly url: string } | { readonly html: string } | { readonly file: string };

/** One kind of render: its flags, the name of its file and the check of the file. */
export interface HeadlessRender {
  /** The start of the name of the temporary folder, for example `procedures-pdf-`. */
  readonly prefix: string;
  /** The name of the file that the browser writes in the temporary folder, for example `page.pdf`. */
  readonly file: string;
  /** The kind of the file in an error, for example `PDF file`. */
  readonly noun: string;
  /** This function gives the argv of the browser: the flags, the extra flags, then the page. */
  argv(page: string, output: string, profile: string, extra: readonly string[]): string[];
  /** This function tells if the file that the browser wrote is a file of this kind. */
  isValid(path: string): boolean;
}

/** This function gives the first bytes of a file, at most `count` bytes. */
export function readHead(path: string, count: number): Buffer {
  const fd = openSync(path, "r");
  try {
    const head = Buffer.alloc(count);
    const read = readSync(fd, head, 0, count, 0);
    return head.subarray(0, read);
  } finally {
    closeSync(fd);
  }
}

function fileSize(path: string): number | undefined {
  try {
    return statSync(path).size;
  } catch {
    return undefined;
  }
}

function lastLines(text: string, count = 5): string {
  return text.trim().split(/\r?\n/).slice(-count).join("\n");
}

/**
 * This function removes a folder and its content. It tries again 3 times, 100 ms apart, because
 * Windows can hold a file for a short time after the browser stops. A removal that fails leaves the
 * folder and does not throw. Thus it does not hide the result or the error of the caller.
 */
function removeFolder(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // The folder stays in the temporary folder of the system
  }
}

/**
 * This function makes a new temporary folder, gives its path to `use`, and then removes the folder,
 * also when `use` throws. The name of the folder starts with `prefix`. The folder is in `folder`,
 * else in the temporary folder of the system. Each temporary folder of this package uses this function.
 */
export async function withTemporaryFolder<T>(prefix: string, folder: string | undefined, use: (path: string) => Promise<T>): Promise<T> {
  const path = mkdtempSync(join(folder ?? tmpdir(), prefix));
  try {
    return await use(path);
  } finally {
    removeFolder(path);
  }
}

/**
 * This function starts the browser one time for a render, and gives the path and the size of the
 * file. It throws when it finds no browser, at the time limit and after a cancel. It also throws
 * when the file is missing, empty or not of the kind of the render.
 *
 * An existing output file changes only after the check of the new file. Thus a failed render keeps
 * an old output file. Without the option `output`, the file goes in a new temporary folder. This
 * folder stays after a success, and goes after a failure.
 *
 * With the option `hostPolicy`, the browser gets the flags of `policyProxyArgs` before the flags of
 * `args`. The proxy stops at the end of the run, also after an error. When the page is an `http:`
 * or `https:` URL and the proxy gets no request, the render fails. Then the requests of the page
 * did not go through the policy.
 */
export async function headlessRender(render: HeadlessRender, source: PageSource, options: HeadlessOptions): Promise<RenderResult> {
  checkPolicyOptions(options);
  const browser = findBrowser(options);
  if (browser === undefined) {
    throw new Error(`No browser found. Install Microsoft Edge, Google Chrome or Chromium, or set ${BROWSER_ENV} to the browser program.`);
  }
  if (options.output !== undefined) return renderOnce(render, source, options, browser, resolve(options.output));
  const kept = mkdtempSync(join(tmpdir(), render.prefix));
  try {
    return await renderOnce(render, source, options, browser, join(kept, render.file));
  } catch (error) {
    removeFolder(kept);
    throw error;
  }
}

/** This function starts the browser in a temporary folder that always goes, and copies the checked file to `output`. */
function renderOnce(render: HeadlessRender, source: PageSource, options: HeadlessOptions, browser: string, output: string): Promise<RenderResult> {
  return withTemporaryFolder(render.prefix, undefined, async (work) => {
    const profile = join(work, "profile");
    const htmlFile = join(work, "page.html");
    const written = join(work, render.file);
    let page: string;
    if ("html" in source) {
      writeFileSync(htmlFile, source.html, "utf8");
      page = pathToFileURL(htmlFile).href;
    } else if ("file" in source) {
      page = pathToFileURL(resolve(source.file)).href;
    } else {
      page = source.url;
    }
    mkdirSync(dirname(output), { recursive: true });

    const run = options.runner ?? runCommand;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const proxy = options.hostPolicy === undefined ? undefined : await startPolicyProxy({ policy: options.hostPolicy, onRefusal: options.onHostRefusal });
    let result: CommandResult;
    try {
      // The flags of the proxy come before the extra flags. A "--" in the extra flags ends the switches of the browser
      const extra = proxy === undefined ? (options.args ?? []) : [...policyProxyArgs(proxy.url), ...(options.args ?? [])];
      result = await run(browser, {
        args: render.argv(page, written, profile, extra),
        timeout,
        signal: options.signal,
        maxOutputBytes: 64 * 1024,
        keep: "tail",
      });
    } finally {
      await proxy?.close();
    }
    if (result.error !== undefined) throw new Error(`The browser did not start: ${result.error}`);
    if (result.timedOut === true) throw new Error(`The browser did not finish in ${timeout} ms`);
    if (result.aborted === true) throw new Error("The render was cancelled");

    const bytes = fileSize(written);
    if (bytes === undefined || bytes === 0) {
      const detail = lastLines(result.stderr || result.stdout);
      throw new Error(`The browser made no ${render.noun} (exit code ${result.exitCode})${detail ? `: ${detail}` : ""}`);
    }
    // A Chrome or Edge policy (ProxySettings or ProxyMode) replaces the flag --proxy-server, and the browser gives no error.
    // A web page sends at least one request, so a run with no request through the proxy is not a pass
    if (proxy !== undefined && /^https?:/i.test(page) && proxy.requests === 0) {
      throw new Error(
        "The browser sent no request through the policy proxy, so the host policy did not apply. A Chrome or Edge policy (ProxySettings or ProxyMode) can replace the flag --proxy-server.",
      );
    }
    if (!render.isValid(written)) throw new Error(`The file ${output} is not a ${render.noun}`);
    // The temporary folder goes after this function, so a copy is enough, also across two drives
    copyFileSync(written, output);
    return { path: output, bytes, browser };
  });
}
