/**
 * The static face: the built files of a page (for example the `dist` folder of Vite) on the listener
 * of a procedures host. Thus an app with a page needs no second server and no route code of its own.
 *
 * - The face takes each `GET` and `HEAD` request under its base path. Put it last in the faces of the
 *   listener. The first face that takes a request serves it, so the procedure faces keep their paths.
 * - Each path stays in the root. A path that leaves the root, also through a symbolic link, gets 404.
 * - A path with no file and no extension is a route of the page. A request that accepts `text/html`
 *   gets the fallback file (`index.html`), and the router of the page shows the route. Another
 *   request gets 404, so a probe or a client of data does not get a page.
 * - Each response has a strict frame policy by default: only a page of the same origin can show the
 *   files in a frame (`DEFAULT_STATIC_HEADERS`). A header of the options replaces the default header
 *   of the same name. Each response also has `X-Content-Type-Options: nosniff`. An `ETag` lets the
 *   browser keep a file until it changes.
 * - A path with a segment that starts with `.` gets 404, so `.env` or `.git` of a root stay hidden.
 *   Only `.well-known` is served.
 * - A root that is missing gives 404. The next request reads the root again, so a later build serves.
 * - Each request goes through the request tracking of the host (`track`, CLI-54), so the drain waits for it.
 */

import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, relative, resolve } from "node:path";
import { isInside } from "@mark1russell7/files";
import type { HostFaceFactory } from "./faces.js";

/** The options of `staticFace()`. */
export interface StaticFaceOptions {
  /** The folder of the files. A relative path is relative to the working folder of the process. */
  readonly root: string;
  /** The path under which the face serves the files. The default is `/`. */
  readonly basePath?: string | undefined;
  /**
   * The file, in the root, for a path with no file and no extension: a route of the page. Only a
   * request that accepts `text/html` gets it. The default is `index.html`. `false` gives 404 for such a path.
   */
  readonly fallback?: string | false | undefined;
  /**
   * The headers of each response of the face, for example `Content-Security-Policy`. A header of
   * this record replaces the header of `DEFAULT_STATIC_HEADERS` with the same name, in any case.
   */
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

/**
 * The default headers of each response of the static face. Only a page of the same origin can show
 * the files in a frame. The CSP rule is for the current browsers, and `X-Frame-Options` is for the
 * old browsers.
 */
export const DEFAULT_STATIC_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Security-Policy": "frame-ancestors 'self'",
  "X-Frame-Options": "SAMEORIGIN",
});

/** This function gives the default headers with the headers of the options. A name of the options replaces the default name in any case. */
function headersWith(given: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const names = new Set(Object.keys(given).map((name) => name.toLowerCase()));
  const kept = Object.entries(DEFAULT_STATIC_HEADERS).filter(([name]) => !names.has(name.toLowerCase()));
  return { ...Object.fromEntries(kept), ...given };
}

/** This function tells if a path has a hidden segment: a segment that starts with `.`, except `.well-known`. */
function hidden(path: string): boolean {
  return path.split(/[\\/]/).some((segment) => segment.startsWith(".") && segment !== ".well-known");
}

/** The content type of each extension that a built page has. Another extension gets `application/octet-stream`. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};

/** This function gives the content type of a file from its extension. */
export function contentTypeOf(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/** A file to send: its real path, its size and its tag. */
interface Found {
  readonly path: string;
  readonly size: number;
  readonly etag: string;
}

/** This function gives the file at a path in the root, or `undefined`. A folder gives its `index.html`. */
async function fileIn(root: string, path: string): Promise<Found | undefined> {
  try {
    let real = await realpath(resolve(root, `.${path}`));
    // A symbolic link can point out of the root, or to a hidden file in it: the real path must stay in it, and not hidden
    if (!isInside(root, real) || hidden(relative(root, real))) return undefined;
    let info = await stat(real);
    if (info.isDirectory()) {
      real = await realpath(join(real, "index.html"));
      if (!isInside(root, real) || hidden(relative(root, real))) return undefined;
      info = await stat(real);
    }
    if (!info.isFile()) return undefined;
    return { path: real, size: info.size, etag: `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"` };
  } catch {
    return undefined;
  }
}

/** This function gives the path of a request under the base path. A path out of the base path gives `undefined`. */
function pathUnder(url: string | undefined, basePath: string): string | undefined {
  const raw = (url ?? "/").split("?")[0]!.split("#")[0]!;
  if (raw !== basePath && !raw.startsWith(basePath === "/" ? "/" : `${basePath}/`)) return undefined;
  const rest = basePath === "/" ? raw : raw.slice(basePath.length) || "/";
  return rest;
}

/** This function tells if a request accepts a page, as the navigation of a browser does. */
function acceptsPage(req: IncomingMessage): boolean {
  return (req.headers.accept ?? "").toLowerCase().includes("text/html");
}

/** This function writes a short text answer. */
function answer(res: ServerResponse, status: number, text: string, headers: Readonly<Record<string, string>>): void {
  res.writeHead(status, { ...headers, "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" });
  res.end(text);
}

/** This function sends a file, or 304 when the browser has the same file. */
function send(req: IncomingMessage, res: ServerResponse, file: Found, headers: Readonly<Record<string, string>>): Promise<void> {
  const common = {
    ...headers,
    "Content-Type": contentTypeOf(file.path),
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-cache",
    ETag: file.etag,
  };
  if (req.headers["if-none-match"] === file.etag) {
    res.writeHead(304, common);
    res.end();
    return Promise.resolve();
  }
  res.writeHead(200, { ...common, "Content-Length": String(file.size) });
  if (req.method === "HEAD") {
    res.end();
    return Promise.resolve();
  }
  return new Promise((done, fail) => {
    const stream = createReadStream(file.path);
    stream.on("error", (error) => {
      res.destroy(error);
      fail(error);
    });
    res.on("close", () => {
      stream.destroy();
      done();
    });
    stream.pipe(res);
  });
}

/** This function removes the slashes at the end of a path. A loop, not a regular expression, keeps the time linear. */
function withoutTrailingSlashes(path: string): string {
  let end = path.length;
  while (end > 0 && path.charCodeAt(end - 1) === 0x2f) end--;
  return path.slice(0, end);
}

/** This function gives the base path with one `/` at the start and none at the end: `app/` gives `/app`, and `` gives `/`. */
function basePathOf(given: string): string {
  const trimmed = withoutTrailingSlashes(given);
  if (trimmed === "") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * This function gives the static face: the files of a folder under a base path. Refer to the start of
 * this file for its rules.
 *
 * @example
 * ```typescript
 * createProcedureHost({
 *   faces: { http: true, ws: true, page: staticFace({ root: "dist", headers: { "Content-Security-Policy": "default-src 'self'; frame-ancestors 'self'" } }) },
 *   listen: [{ port: 3000, knobs: LOCAL_LISTENER_KNOBS }],
 * });
 * ```
 */
export function staticFace(options: StaticFaceOptions): HostFaceFactory {
  const basePath = basePathOf(options.basePath ?? "/");
  const fallback = options.fallback ?? "index.html";
  const headers = headersWith(options.headers ?? {});
  const root = resolve(options.root);
  /** The real path of the root, after its symbolic links. The first request reads it. */
  let realRoot: Promise<string> | undefined;

  const serve = async (req: IncomingMessage, res: ServerResponse, path: string): Promise<void> => {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      answer(res, 400, "The path of the request is not valid.", headers);
      return;
    }
    if (decoded.includes("\0")) {
      answer(res, 400, "The path of the request is not valid.", headers);
      return;
    }
    if (hidden(decoded)) {
      answer(res, 404, "No file has this path.", headers);
      return;
    }
    let base: string;
    try {
      base = await (realRoot ??= realpath(root));
    } catch {
      // The root is missing, for example before the first build: the next request reads it again
      realRoot = undefined;
      answer(res, 404, "No file has this path.", headers);
      return;
    }
    const file =
      (await fileIn(base, decoded)) ??
      // A route of the page has no extension, and the browser asks for a page: the router of the page shows it
      (fallback !== false && extname(decoded) === "" && acceptsPage(req) ? await fileIn(base, `/${fallback}`) : undefined);
    if (file === undefined) {
      answer(res, 404, "No file has this path.", headers);
      return;
    }
    await send(req, res, file, headers);
  };

  return (context) => {
    const handler = (req: IncomingMessage, res: ServerResponse): boolean => {
      if (req.method !== "GET" && req.method !== "HEAD") return false;
      const path = pathUnder(req.url, basePath);
      if (path === undefined) return false;
      const fail = (error: unknown): void => {
        if (res.headersSent) {
          res.destroy(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        answer(res, 500, "The face could not read the file.", headers);
      };
      if (context.track === undefined) serve(req, res, path).catch(fail);
      else context.track(req, res, path, () => serve(req, res, path)).catch(fail);
      return true;
    };
    return { handler, endpoint: { type: "static", scheme: "http", path: basePath } };
  };
}
