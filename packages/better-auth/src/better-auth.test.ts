import { describe, expect, it } from "vitest";
import type { Db, MongoClient } from "mongodb";
import { AGENT_ID, ANONYMOUS_ID, betterAuthConfig, betterAuthPrincipalOf, createBetterAuth, headersOf, SessionPrincipals, VIA } from "./index.js";

/** A fake database of Better Auth: its `user` and `member` collections, with a count of the reads. */
function fakeDb(users: Record<string, unknown>[], members: Record<string, unknown>[], fail = false) {
  const reads = { user: 0, member: 0 };
  const matches = (value: unknown, query: unknown): boolean => {
    const $in = (query as { $in?: unknown[] }).$in ?? [];
    return $in.some((candidate) => String(candidate) === String(value));
  };
  const db = {
    collection(name: "user" | "member") {
      return {
        async findOne(filter: { _id: unknown }) {
          reads.user++;
          if (fail) throw new Error("down");
          return users.find((u) => matches(u["_id"], filter._id)) ?? null;
        },
        find(filter: { userId: unknown }) {
          return {
            async toArray() {
              reads[name]++;
              if (fail) throw new Error("down");
              return members.filter((m) => matches(m["userId"], filter.userId));
            },
          };
        },
      };
    },
  } as unknown as Db;
  return { db, reads };
}

/** A fake Better Auth server: the cookie `s=<id>` is the session of user `<id>`. */
function fakeAuth(users: Record<string, Record<string, unknown>>) {
  let lookups = 0;
  const auth = {
    api: {
      async getSession({ headers }: { headers: Headers }) {
        lookups++;
        const match = /(?:^|; )s=([^;]+)/.exec(headers.get("cookie") ?? "");
        const user = match ? users[match[1]!] : undefined;
        return user ? { user } : null;
      },
    },
  };
  return { auth, lookups: () => lookups };
}

const ALICE = { id: "u1", email: "alice@example.com", emailVerified: true, name: "Alice" };
const BOB = { id: "u2", email: "bob@example.com", emailVerified: false };

function setup(options: { trustUnverifiedEmail?: boolean; failDb?: boolean } = {}) {
  let now = 1_000;
  const warnings: string[] = [];
  const { db, reads } = fakeDb(
    [{ _id: "u1", ...ALICE }, { _id: "u2", ...BOB }],
    [{ userId: "u1", organizationId: "g1", role: "owner" }, { userId: "u1", organizationId: "g2" }],
    options.failDb,
  );
  const { auth, lookups } = fakeAuth({ u1: ALICE, u2: BOB });
  const principals = new SessionPrincipals({
    auth,
    db,
    now: () => now,
    warn: (m) => warnings.push(m),
    ...(options.trustUnverifiedEmail ? { trustUnverifiedEmail: true } : {}),
  });
  return { principals, reads, lookups, warnings, tick: (ms: number) => (now += ms) };
}

const cookie = (value: string) => new Headers({ cookie: value });

describe("betterAuthConfig", () => {
  const base = { BETTER_AUTH_SECRET: "0123456789abcdef" };

  it("refuses a short secret, and test accounts in production", () => {
    expect(betterAuthConfig({}, { port: 1, trustedOrigins: [] })).toMatch(/BETTER_AUTH_SECRET/);
    expect(betterAuthConfig({ ...base, NODE_ENV: "production", AUTH_TEST_ACCOUNTS: "1" }, { port: 1, trustedOrigins: [] })).toMatch(/production/);
  });

  it("reads the providers, the defaults and the passkey domain", () => {
    const config = betterAuthConfig(
      { ...base, GITHUB_CLIENT_ID: "gid", GITHUB_CLIENT_SECRET: "gs", GOOGLE_CLIENT_ID: "only-the-id" },
      { port: 9091, trustedOrigins: ["https://app.example.com:8443"], appName: "Demo" },
    );
    expect(config).toMatchObject({
      appName: "Demo",
      basePath: "/auth",
      baseURL: "http://localhost:9091",
      github: { clientId: "gid", clientSecret: "gs" },
      testAccounts: false,
      rpID: "app.example.com",
    });
    expect(typeof config === "object" && "google" in config).toBe(false);
  });

  it("takes the base URL, the passkey domain and the test accounts from the environment", () => {
    const config = betterAuthConfig(
      { ...base, AUTH_BASE_URL: "https://api.example.com", PASSKEY_RP_ID: "example.com", AUTH_TEST_ACCOUNTS: "1" },
      { port: 1, trustedOrigins: ["not a url"], basePath: "/api/auth" },
    );
    expect(config).toMatchObject({ baseURL: "https://api.example.com", rpID: "example.com", testAccounts: true, basePath: "/api/auth", appName: "App" });
    expect(betterAuthConfig(base, { port: 1, trustedOrigins: ["not a url"] })).toMatchObject({ rpID: "localhost" });
  });
});

describe("SessionPrincipals", () => {
  it("gives the user of a session, with the verified email and the groups", async () => {
    const { principals } = setup();
    expect(await principals.ofHeaders(cookie("s=u1"))).toEqual({
      id: "u1",
      email: "alice@example.com",
      name: "Alice",
      groups: [{ id: "g1", role: "owner" }, { id: "g2", role: "member" }],
    });
    expect(await principals.ofHeaders(cookie("s=u2"))).toEqual({ id: "u2", groups: [] }); // the email is not verified
    expect(await principals.ofHeaders(new Headers())).toBeUndefined();
    expect(await principals.ofHeaders(cookie("s=nobody"))).toBeUndefined();
  });

  it("uses an email that is not verified on a test server", async () => {
    const { principals } = setup({ trustUnverifiedEmail: true });
    expect((await principals.ofHeaders(cookie("s=u2")))?.email).toBe("bob@example.com");
  });

  it("keeps a session lookup and a groups lookup for their memo time", async () => {
    const { principals, lookups, reads, tick } = setup();
    await Promise.all([principals.ofHeaders(cookie("s=u1")), principals.ofHeaders(cookie("s=u1"))]);
    expect(lookups()).toBe(1);
    expect(reads.member).toBe(1);
    tick(6_000);
    await principals.ofHeaders(cookie("s=u1"));
    expect(lookups()).toBe(2);
    expect(reads.member).toBe(1); // the groups stay 10 s
    tick(5_000);
    principals.forgetGroups("u1");
    await principals.groupsOf("u1");
    expect(reads.member).toBe(2);
  });

  it("gives a user by id, and undefined for an unknown user", async () => {
    const { principals } = setup();
    expect(await principals.ofUser("u1")).toMatchObject({ id: "u1", email: "alice@example.com" });
    expect(await principals.ofUser("507f1f77bcf86cd799439011")).toBeUndefined();
  });

  it("reports a failed lookup, and gives no user and no groups", async () => {
    const { principals, warnings } = setup({ failDb: true });
    expect(await principals.ofUser("u1")).toBeUndefined();
    expect(await principals.groupsOf("u1")).toEqual([]);
    expect(warnings).toHaveLength(2);
  });

  it("treats a failed session lookup as no session", async () => {
    const principals = new SessionPrincipals({
      auth: { api: { getSession: async () => { throw new Error("bad cookie"); } } },
      db: fakeDb([], []).db,
    });
    expect(await principals.ofHeaders(cookie("s=u1"))).toBeUndefined();
  });
});

describe("betterAuthPrincipalOf", () => {
  const request = {} as never;
  const TOKEN = "agent-secret-token";

  it("gives the principal of the session user", async () => {
    const { principals } = setup();
    const hook = betterAuthPrincipalOf({ principals, agentToken: TOKEN });
    expect(await hook({ cookies: { s: "u1" } }, request)).toEqual({
      principal: { id: "u1", via: VIA.session, claims: { email: "alice@example.com", name: "Alice", groups: [{ id: "g1", role: "owner" }, { id: "g2", role: "member" }] } },
    });
  });

  it("gives the agent for the agent token, and the user for the act-as header", async () => {
    const { principals } = setup();
    const hook = betterAuthPrincipalOf({ principals, agentToken: TOKEN });
    expect(await hook({ bearer: TOKEN }, request)).toEqual({ principal: { id: AGENT_ID, via: VIA.agent, claims: { agent: true } } });
    const asAlice = await hook({ bearer: TOKEN, headers: { "x-act-as": "u1" } }, request);
    expect(asAlice?.principal).toMatchObject({ id: "u1", via: VIA.agentAs, claims: { email: "alice@example.com", agent: true } });
    const asNobody = await hook({ bearer: TOKEN, headers: { "x-act-as": "ghost" } }, request);
    expect(asNobody?.principal).toEqual({ id: ANONYMOUS_ID, via: VIA.agentAs, claims: { agent: true, actAs: "ghost" } });
  });

  it("does not take another bearer token as the agent, and does not let the act-as header work without the token", async () => {
    const { principals } = setup();
    const hook = betterAuthPrincipalOf({ principals, agentToken: TOKEN, actAsHeader: "X-Graph-As" });
    expect((await hook({ bearer: "wrong", headers: { "x-graph-as": "u1" } }, request))?.principal).toEqual({ id: ANONYMOUS_ID, via: VIA.anonymous });
    expect((await hook({ bearer: TOKEN, headers: { "x-graph-as": "u1" } }, request))?.principal?.id).toBe("u1");
  });

  it("gives no principal to a request without a user when anonymous is false", async () => {
    const { principals } = setup();
    const hook = betterAuthPrincipalOf({ principals, anonymous: false });
    expect(await hook({}, request)).toBeUndefined();
    expect(await hook({ bearer: TOKEN }, request)).toBeUndefined(); // no agent token: no agent
  });
});

describe("headersOf", () => {
  it("copies the headers, and makes a cookie header from the cookies", () => {
    expect(headersOf({ headers: { cookie: "a=1", "x-y": "z" } }).get("cookie")).toBe("a=1");
    expect(headersOf({ cookies: { s: "a b", t: "2" } }).get("cookie")).toBe("s=a%20b; t=2");
    expect([...headersOf({ headers: { "bad header": "x" } }).keys()]).toEqual([]);
    expect(headersOf({}).has("cookie")).toBe(false);
  });
});

describe("createBetterAuth", () => {
  it("makes a server with the auth routes under the base path, and no session without a cookie", async () => {
    const config = betterAuthConfig(
      { BETTER_AUTH_SECRET: "x".repeat(32), AUTH_TEST_ACCOUNTS: "1", GITHUB_CLIENT_ID: "g", GITHUB_CLIENT_SECRET: "s", GOOGLE_CLIENT_ID: "o", GOOGLE_CLIENT_SECRET: "t" },
      { port: 9999, trustedOrigins: ["http://localhost:4200"], appName: "Test" },
    );
    if (typeof config === "string") throw new Error(config);
    // The routes below do not read the database
    const auth = createBetterAuth({} as Db, {} as MongoClient, config);
    const ok = await auth.handler(new Request("http://localhost:9999/auth/ok"));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(await auth.api.getSession({ headers: new Headers() })).toBeNull();
  });
});
