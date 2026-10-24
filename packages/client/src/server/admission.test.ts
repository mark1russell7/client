/**
 * The one admission of a network request (CLI-2b). `admission()` runs the request hook, the token
 * check and the authenticate function one time. Each call with the admitted credentials gets the
 * principal and the narrowing of the admission, and the checks do not run again. A copy of the
 * admitted credentials, and the admission of another server, go through the checks. A jarvis-style
 * cookie gives a principal. A Graph-style hook (the accounts mode of `graphPrincipalOf`) gives a
 * session its user, a request without a session the anonymous principal, and refuses a request
 * when its accounts are not ready.
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createProcedure } from "../procedures/define.js";
import { createRegistry } from "../procedures/module.js";
import { ladder } from "../procedures/capability.js";
import { ProcedureServer, type ProcedureServerOptions } from "./procedure-server.js";
import { pathToMethod } from "./method.js";
import { LOCAL_CREDENTIALS, requestCredentials } from "./request-auth.js";
import type { Credentials, PrincipalOf, ServerRequest } from "./types.js";

type Audience = "public" | "guest" | "intimate";
const AUDIENCES: readonly Audience[] = ["public", "guest", "intimate"];
const TOKEN = "admission-token-0123456789";

function server(options: Omit<ProcedureServerOptions, "registry" | "autoRegister">): ProcedureServer {
  return new ProcedureServer({
    autoRegister: true,
    registry: createRegistry({
      name: "admission",
      procedures: [
        createProcedure()
          .path(["who", "am"])
          .input(z.object({}))
          .output(z.unknown())
          .meta({ effects: { reads: [], writes: [] } })
          .handler(async (_input, ctx) => ({ principal: ctx.principal ?? null, clearance: ctx.capability.clearance ?? null }))
          .build(),
      ],
    }),
    ...options,
  });
}

const call = (credentials: Credentials): ServerRequest => ({ id: "c1", method: pathToMethod(["who", "am"]), payload: {}, metadata: {}, credentials });

/** The credentials of an HTTP request with these headers. */
const credentialsOf = (headers: Record<string, string>): Credentials => requestCredentials({ headers, url: "/mcp" });

/** A jarvis-style request hook: the token of a cookie or of an application header. It counts its runs. */
function jarvisStyle(): { readonly hook: PrincipalOf; readonly runs: () => number } {
  let runs = 0;
  return {
    hook: ({ cookies = {}, headers = {} }) => {
      runs++;
      const bearer = cookies["jarvis_token"] ?? headers["x-jarvis-token"];
      return bearer !== undefined ? { bearer } : {};
    },
    runs: () => runs,
  };
}

/** The anonymous principal of Graph. */
const ANONYMOUS = { id: "anonymous", via: "anonymous", claims: {} };

/**
 * A Graph-style request hook, with the shape of the accounts mode of `graphPrincipalOf` of Graph.
 * Accounts that are not ready throw `UNAVAILABLE`. A session cookie gives its user, and a request
 * without a session is anonymous. The narrowing of a user is an addition of the test.
 */
function graphStyle(): { readonly hook: PrincipalOf; readonly runs: () => number; ready: boolean } {
  const sessions = new Map([["session-of-alice", "alice"]]);
  let runs = 0;
  const state: { readonly hook: PrincipalOf; readonly runs: () => number; ready: boolean } = {
    ready: true,
    runs: () => runs,
    hook: async ({ cookies = {} }) => {
      runs++;
      if (!state.ready) throw Object.assign(new Error("accounts are not ready"), { code: "UNAVAILABLE", retryable: true });
      const user = sessions.get(cookies["better-auth.session_token"] ?? "");
      return user === undefined ? { principal: ANONYMOUS } : { principal: { id: user, via: "better-auth" }, narrowing: { clearance: "guest" } };
    },
  };
  return state;
}

describe("admission() of ProcedureServer (CLI-2b)", () => {
  it("runs the checks one time: each call with the admitted credentials gets the principal, and the hook does not run again", async () => {
    const jarvis = jarvisStyle();
    const value = server({ token: TOKEN, principalOf: jarvis.hook });
    const admitted = await value.admission(credentialsOf({ cookie: `theme=dark; jarvis_token=${TOKEN}` }));
    expect(admitted).toMatchObject({ ok: true, principal: { id: "token", via: "token" } });
    expect(jarvis.runs()).toBe(1);
    if (!admitted.ok) throw new Error("not admitted");
    for (let count = 0; count < 3; count++) {
      const response = await value.handle(call(admitted.credentials));
      expect(response.payload).toEqual({ principal: { id: "token", via: "token" }, clearance: null });
    }
    // Three calls of the admitted request: the hook ran one time, for the admission
    expect(jarvis.runs()).toBe(1);
    // The admitted credentials are a frozen copy: the credentials of the request stay as they were
    expect(Object.isFrozen(admitted.credentials)).toBe(true);
    expect(admitted.credentials.cookies).toEqual({ theme: "dark", jarvis_token: TOKEN });
  });

  it("refuses the credentials without the token, or with a wrong one, with UNAUTHORIZED", async () => {
    const jarvis = jarvisStyle();
    const value = server({ token: TOKEN, principalOf: jarvis.hook });
    expect(await value.admission(credentialsOf({}))).toEqual({ ok: false, code: "UNAUTHORIZED", message: "Unauthorized: this server requires its token" });
    expect(await value.admission(credentialsOf({ cookie: "jarvis_token=wrong" }))).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(await value.admission(credentialsOf({ authorization: "Bearer wrong" }))).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    // The token of an application header passes
    expect(await value.admission(credentialsOf({ "x-jarvis-token": TOKEN }))).toMatchObject({ ok: true });
    // A server with only a token reads the bearer token
    const plain = server({ token: TOKEN });
    expect(await plain.admission(credentialsOf({ authorization: `Bearer ${TOKEN}` }))).toMatchObject({ ok: true, principal: { id: "token", via: "token" } });
    expect(await plain.admission(credentialsOf({ authorization: `bearer   ${TOKEN}` }))).toMatchObject({ ok: true });
    expect(await plain.admission(credentialsOf({}))).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });

  it("gives a Graph-style session its principal and its narrowing for each call of the request, and a request without a session the anonymous principal", async () => {
    const graph = graphStyle();
    const value = server({ principalOf: graph.hook, capability: { clearance: "intimate" }, clearanceOrder: ladder(AUDIENCES) });
    const admitted = await value.admission(credentialsOf({ cookie: "better-auth.session_token=session-of-alice" }));
    expect(admitted).toMatchObject({ ok: true, principal: { id: "alice", via: "better-auth" } });
    if (!admitted.ok) throw new Error("not admitted");
    const first = await value.handle(call(admitted.credentials));
    const second = await value.handle(call(admitted.credentials));
    for (const response of [first, second]) expect(response.payload).toEqual({ principal: { id: "alice", via: "better-auth" }, clearance: "guest" });
    expect(graph.runs()).toBe(1);
    // No session, or an unknown session: the anonymous principal, as in Graph. The request is not refused.
    for (const headers of [{}, { cookie: "better-auth.session_token=forged" }]) {
      const anonymous = await value.admission(credentialsOf(headers));
      expect(anonymous).toMatchObject({ ok: true, principal: ANONYMOUS });
      if (!anonymous.ok) throw new Error("not admitted");
      expect((await value.handle(call(anonymous.credentials))).payload).toEqual({ principal: ANONYMOUS, clearance: "intimate" });
    }
    // Accounts that are not ready: the hook throws UNAVAILABLE, and the admission refuses with UNAUTHORIZED
    graph.ready = false;
    expect(await value.admission(credentialsOf({ cookie: "better-auth.session_token=session-of-alice" }))).toEqual({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Unauthorized: the server did not accept the credentials",
    });
  });

  it("runs the checks again for a copy of the admitted credentials, and for the admission of another server", async () => {
    const jarvis = jarvisStyle();
    const value = server({ token: TOKEN, principalOf: jarvis.hook });
    const admitted = await value.admission(credentialsOf({ cookie: `jarvis_token=${TOKEN}` }));
    if (!admitted.ok) throw new Error("not admitted");
    // A copy has no entry of the server: the hook and the token check run for it
    const copy = { ...admitted.credentials };
    expect((await value.handle(call(copy))).payload).toEqual({ principal: { id: "token", via: "token" }, clearance: null });
    expect(jarvis.runs()).toBe(2);
    // The admission of another server is not an admission of this server
    const other = server({});
    const foreign = await other.admission(credentialsOf({ cookie: "jarvis_token=wrong" }));
    if (!foreign.ok) throw new Error("not admitted");
    expect((await value.handle(call(foreign.credentials))).status).toMatchObject({ type: "error", code: "UNAUTHORIZED" });
    expect(jarvis.runs()).toBe(3);
  });

  it("runs the authenticate function one time too, and keeps its principal for each call", async () => {
    let runs = 0;
    const value = server({
      token: TOKEN,
      authenticate: () => {
        runs++;
        return { id: "app-user", via: "app" };
      },
    });
    const admitted = await value.admission(credentialsOf({ authorization: `Bearer ${TOKEN}` }));
    expect(admitted).toMatchObject({ ok: true, principal: { id: "app-user", via: "app" } });
    if (!admitted.ok) throw new Error("not admitted");
    expect((await value.handle(call(admitted.credentials))).payload).toEqual({ principal: { id: "app-user", via: "app" }, clearance: null });
    expect(runs).toBe(1);
  });

  it("admits a local request without the hook and the token, as each call of a local face", async () => {
    const jarvis = jarvisStyle();
    const value = server({ token: TOKEN, principalOf: jarvis.hook });
    const admitted = await value.admission(LOCAL_CREDENTIALS);
    expect(admitted).toEqual({ ok: true, credentials: LOCAL_CREDENTIALS });
    expect(jarvis.runs()).toBe(0);
  });
});
