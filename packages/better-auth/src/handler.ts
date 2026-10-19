/**
 * The Node handler of the auth routes, with credentialed CORS from the trusted origins of the
 * host (CLI-49).
 *
 * The handler of Better Auth sends no CORS headers. A page on another origin then gets no
 * session, and its POST requests fail. `betterAuthHandler()` puts the CORS of
 * `credentialedCors()` of `@procedures/client/node` in front of the routes. Thus the
 * `allowedOrigins` of the host, the list of the browser checks of `procedureHandler`, drives
 * the CORS of the auth routes too. `betterAuthFace()` takes that list from the policy of a
 * procedures host.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { toNodeHandler } from "better-auth/node";
import type { BrowserGuardOptions, HostPolicy } from "@procedures/client";
import { credentialedCors, type CredentialedCorsOptions } from "@procedures/client/node";
import type { BetterAuthServer } from "./auth.js";

/** The methods of a preflight of the auth routes: Better Auth uses GET and POST. */
export const AUTH_CORS_METHODS: readonly string[] = Object.freeze(["GET", "POST", "OPTIONS"]);

/** The request headers of a preflight of the auth routes. */
export const AUTH_CORS_HEADERS: readonly string[] = Object.freeze(["Content-Type", "Authorization"]);

/** The options of `betterAuthHandler()`. */
export interface BetterAuthHandlerOptions {
  /**
   * The origins that get credentialed CORS: the `allowedOrigins` of the host. A list or a
   * function of origins. `"*"` is refused (CSRF). Without it, no other origin gets CORS.
   */
  readonly allowedOrigins?: BrowserGuardOptions["allowedOrigins"];
  /** The path of the auth routes. The default is `/auth`, as `betterAuthConfig` gives it. */
  readonly basePath?: string | undefined;
  /**
   * More of the CORS: `methods`, `allowedHeaders`, `exposedHeaders` and `maxAge`. The defaults are
   * `AUTH_CORS_METHODS` and `AUTH_CORS_HEADERS`.
   */
  readonly cors?: CredentialedCorsOptions | undefined;
}

/**
 * The Node handler of the auth routes. A call gives true when the handler takes the request (its
 * path is under `basePath`), and false for another request. The handler then does not touch the
 * request.
 */
export interface NodeAuthHandler {
  (req: IncomingMessage, res: ServerResponse): boolean;
  /** This method gives true when the handler takes the request: its path is under `basePath`. */
  matches(req: IncomingMessage): boolean;
  /** The handler as a middleware of Connect or Express, at the level of the app: a request outside `basePath` goes to `next`. */
  middleware(req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void): void;
  /** The path under which the handler takes the requests. */
  readonly basePath: string;
}

/** The path of a request URL, without its query. */
function pathOf(url: string | undefined): string {
  const path = (url ?? "/").split("?")[0] ?? "/";
  return path === "" ? "/" : path;
}

/**
 * This function gives the Node handler of the auth routes, with credentialed CORS for the trusted
 * origins. Mount it on the mount list of a listener, or as a middleware of the app.
 *
 * @example
 * ```typescript
 * const handler = betterAuthHandler(auth, { allowedOrigins: ["http://localhost:5173"] });
 * app.use(handler.middleware); // Express, at the level of the app
 * ```
 */
export function betterAuthHandler(auth: Pick<BetterAuthServer, "handler">, options: BetterAuthHandlerOptions = {}): NodeAuthHandler {
  const basePath = (options.basePath ?? "/auth").replace(/\/+$/, "") || "/";
  const prefix = basePath === "/" ? "/" : `${basePath}/`;
  const cors = credentialedCors(options.allowedOrigins, { methods: AUTH_CORS_METHODS, allowedHeaders: AUTH_CORS_HEADERS, ...options.cors });
  const routes = toNodeHandler(auth.handler);
  const matches = (req: IncomingMessage): boolean => {
    const path = pathOf(req.url);
    return path === basePath || path.startsWith(prefix);
  };
  const serve = (req: IncomingMessage, res: ServerResponse): void => {
    // A preflight ends in the CORS. A request of another origin goes on without CORS headers:
    // the CSRF checks of Better Auth refuse a write of an origin that it does not trust
    if (cors(req, res)) return;
    routes(req, res).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "The auth routes failed", code: "INTERNAL_ERROR" }));
    });
  };
  const handler = (req: IncomingMessage, res: ServerResponse): boolean => {
    if (!matches(req)) return false;
    serve(req, res);
    return true;
  };
  return Object.assign(handler, {
    matches,
    middleware: (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void): void => {
      if (!handler(req, res)) next();
    },
    basePath,
  });
}

/** What the auth face needs of its host: the policy, for its trusted origins. */
export interface BetterAuthFaceContext {
  readonly policy: HostPolicy;
}

/** The auth face: its request handler and its endpoint, for `host.info`. */
export interface BetterAuthFace {
  readonly handler: (req: IncomingMessage, res: ServerResponse) => boolean;
  readonly endpoint: { readonly type: string; readonly scheme: "http"; readonly path: string };
}

/**
 * This function gives the auth routes as a face of a procedures host (`createProcedureHost()` of
 * `@procedures/peer`). The face takes the trusted origins of the policy of the host
 * (`browser.allowedOrigins`), unless the options give other origins. The types are structural:
 * this package does not depend on `@procedures/peer`.
 *
 * @example
 * ```typescript
 * const host = createProcedureHost({ registry, policy, faces: { http: true, auth: betterAuthFace(auth) }, listen });
 * ```
 */
export function betterAuthFace(auth: Pick<BetterAuthServer, "handler">, options: BetterAuthHandlerOptions = {}): (context: BetterAuthFaceContext) => BetterAuthFace {
  return (context) => {
    const handler = betterAuthHandler(auth, { ...options, allowedOrigins: options.allowedOrigins ?? context.policy.browser.allowedOrigins });
    return {
      handler: (req, res) => handler(req, res),
      endpoint: { type: "auth", scheme: "http", path: handler.basePath },
    };
  };
}
