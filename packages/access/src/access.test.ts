import { describe, expect, it } from "vitest";
import type { Invocation } from "@procedures/client";
import { Access, accessAdmitItem, asAccessList, DEFAULT_RIGHTS, subjectOf, type AccessList, type AccessPolicy, type AccessSubject } from "./index.js";

const ALL = DEFAULT_RIGHTS.all;
const norm = (email: string | undefined) => (email ?? "").trim().toLowerCase();

/**
 * The rules of an app with spaces, boards, groups and personal scopes, as a policy: `user:<id>`
 * and `member:<board>:<id>` belong to their person, a group gives rights to its members, a board
 * without a list follows the space, the space owners cannot be locked out, and `link` is anyone.
 */
function boardsPolicy(spaceOwners: readonly string[], evaluate?: AccessPolicy["evaluate"]): AccessPolicy {
  return {
    evaluate,
    names: (principal) => (principal === "link" ? true : undefined),
    implicit: (scope, subject) => {
      if (scope.startsWith("user:")) return subject.user && scope === `user:${subject.user}` ? ALL : undefined;
      if (scope.startsWith("member:")) return subject.user && scope.slice(scope.lastIndexOf(":") + 1) === subject.user ? ["read", "write"] : undefined;
      if (scope.startsWith("group:")) {
        const group = subject.groups?.find((g) => `group:${g.id}` === scope);
        return group ? (group.role === "owner" || group.role === "admin" ? ALL : ["read", "write"]) : undefined;
      }
      if (scope !== "space" && !scope.startsWith("board:")) return [];
      return subject.user && subject.email && spaceOwners.map(norm).includes(norm(subject.email)) ? ALL : undefined;
    },
    parent: (scope) => (scope.startsWith("board:") ? "space" : undefined),
    fallback: (scope, subject) => (scope === "space" && subject.user && spaceOwners.length === 0 ? ["read", "write"] : []),
  };
}

const lists = (...entries: [string, AccessList][]) => new Map(entries);
const open = new Access(boardsPolicy([]));
const owned = new Access(boardsPolicy(["mark@example.com"]));
const mark: AccessSubject = { user: "u_mark", email: "Mark@Example.com" };
const ana: AccessSubject = { user: "u_ana", email: "ana@example.com", groups: [{ id: "core", role: "member" }] };
const anon: AccessSubject = {};
const sorted = (rights: Set<string>) => [...rights].sort();

describe("the rights of a subject on a scope", () => {
  it("anonymous: no rights, except an entry for anyone", () => {
    const pub = lists(["board:pub", { access: [{ principal: "link", rights: ["read"] }] }]);
    expect(sorted(open.rightsOn("space", anon, lists()))).toEqual([]);
    expect(owned.can("read", "board:pub", anon, pub)).toBe(true);
    expect(owned.can("write", "board:pub", anon, pub)).toBe(false);
    expect(new Access().can("read", "x", anon, lists(["x", { access: [{ principal: "anyone", rights: ["read"] }] }]))).toBe(true);
  });

  it("a scope without a list: the fallback, or the implicit rights of the owners", () => {
    expect(open.can("write", "space", ana, lists())).toBe(true);
    expect(open.can("admin", "space", ana, lists())).toBe(false);
    expect(owned.can("admin", "space", mark, lists())).toBe(true); // the emails compare without case
    expect(owned.can("read", "space", ana, lists())).toBe(false);
  });

  it("a personal scope belongs to its person, and a scope of an unknown kind gives nothing", () => {
    expect(owned.can("admin", "user:u_ana", ana, lists())).toBe(true);
    expect(owned.can("read", "user:u_ana", mark, lists())).toBe(false);
    expect(owned.can("write", "member:roadmap:u_ana", ana, lists())).toBe(true);
    expect(owned.can("read", "member:roadmap:u_ana", mark, lists())).toBe(false);
    expect(owned.can("read", "other:x", mark, lists(["other:x", { access: [{ principal: "signed-in", rights: ["read"] }] }]))).toBe(false);
  });

  it("a scope without a list follows its parent, and a list decides with its owner and its entries", () => {
    expect(owned.can("write", "board:b1", mark, lists())).toBe(true);
    expect(owned.can("read", "board:b1", ana, lists())).toBe(false);
    const board = lists(["board:b1", { owner: "user:u_mark", access: [{ principal: "group:core", rights: ["write"] }, { principal: "email:zoe@example.com", rights: ["read"] }] }]);
    expect(sorted(owned.rightsOn("board:b1", mark, board))).toEqual(["admin", "read", "share", "write"]);
    expect(sorted(owned.rightsOn("board:b1", ana, board))).toEqual(["read", "write"]); // write implies read
    expect(owned.can("read", "board:b1", { user: "u_zoe", email: "ZOE@example.com" }, board)).toBe(true);
    expect(owned.can("write", "board:b1", { user: "u_zoe", email: "zoe@example.com" }, board)).toBe(false);
  });

  it("a group: the members read and write, the owners and the admins have each right", () => {
    expect(sorted(owned.rightsOn("group:core", ana, lists()))).toEqual(["read", "write"]);
    expect(owned.can("admin", "group:core", { user: "u_x", groups: [{ id: "core", role: "owner" }] }, lists())).toBe(true);
    expect(owned.can("read", "group:core", mark, lists())).toBe(false);
  });

  it("a list cannot lock out a subject with implicit rights, and its owner has each right", () => {
    const locked = lists(["space", { owner: "user:u_ana", access: [] }], ["board:b2", { access: [] }]);
    expect(owned.can("admin", "space", mark, locked)).toBe(true);
    expect(owned.can("admin", "board:b2", mark, locked)).toBe(true);
    expect(owned.can("read", "board:b2", ana, locked)).toBe(false);
    expect(owned.can("admin", "space", ana, locked)).toBe(true);
  });

  it("an owner names one user, one email or one group: never anyone, signed-in or a name of the policy", () => {
    expect(new Access().can("admin", "x", ana, lists(["x", { owner: "signed-in" }]))).toBe(false);
    expect(new Access().can("admin", "x", ana, lists(["x", { owner: "anyone" }]))).toBe(false);
    expect(owned.can("admin", "board:o", anon, lists(["board:o", { owner: "link" }]))).toBe(false);
    expect(owned.can("admin", "board:o", ana, lists(["board:o", { owner: "link" }]))).toBe(false);
    expect(owned.can("admin", "board:o", ana, lists(["board:o", { owner: "group:core" }]))).toBe(true);
    expect(owned.can("admin", "board:o", ana, lists(["board:o", { owner: "email:ANA@example.com" }]))).toBe(true);
  });

  it("the agent alone has each right, and an agent that acts for a user has the rights of the user", () => {
    expect(owned.can("admin", "user:u_ana", { agent: true }, lists())).toBe(true);
    expect(owned.can("admin", "space", { agent: true }, lists())).toBe(true);
    const asAna = { ...ana, agent: true };
    expect(owned.can("write", "user:u_ana", asAna, lists())).toBe(true);
    expect(owned.can("read", "user:u_mark", asAna, lists())).toBe(false);
    expect(owned.can("read", "space", asAna, lists())).toBe(false);
    expect(new Access({ superuser: () => false }).can("read", "x", { agent: true }, lists())).toBe(false);
  });

  it("a when condition gives its rights only where it is exactly true, and an error is false", () => {
    const evaluate = (condition: unknown, vars: Readonly<Record<string, unknown>>) => {
      const c = condition as Record<string, unknown>;
      const doc = vars["doc"] as Record<string, unknown> | null;
      if (c["boom"]) throw new Error("bad");
      if (c["ownerIsMe"]) return doc?.["owner"] === (vars["principal"] as { user: unknown }).user;
      if (c["public"]) return doc?.["public"] === true;
      if (c["truthy"]) return 1 as unknown as boolean;
      return false;
    };
    const access = new Access(boardsPolicy(["mark@example.com"], evaluate));
    const board = lists([
      "board:c1",
      {
        owner: "user:u_mark",
        access: [
          { principal: "email:ana@example.com", rights: ["write"], when: { ownerIsMe: true } },
          { principal: "email:ana@example.com", rights: ["read"], when: { public: true } },
          { principal: "signed-in", rights: ["read"], when: { boom: true } },
          { principal: "signed-in", rights: ["read"], when: { truthy: true } },
        ],
      },
    ]);
    expect(access.can("read", "board:c1", ana, board)).toBe(false); // no document: no conditional right
    expect(access.conditionalOn("read", "board:c1", ana, board)).toBe(true);
    expect(access.conditionalOn("write", "board:c1", ana, board)).toBe(true);
    expect(access.conditionalOn("admin", "board:c1", ana, board)).toBe(false);
    expect(access.can("write", "board:c1", ana, board, { op: "write", doc: { owner: "u_ana" } })).toBe(true);
    expect(access.can("write", "board:c1", ana, board, { op: "write", doc: { owner: "u_mark" } })).toBe(false);
    expect(access.can("read", "board:c1", ana, board, { op: "read", doc: { public: true } })).toBe(true);
    expect(access.can("read", "board:c1", { user: "u_zoe" }, board, { op: "read", doc: {} })).toBe(false); // an error and a value that is not true
    expect(access.can("admin", "board:c1", mark, board)).toBe(true); // the owner is unconditional
    expect(new Access(boardsPolicy([])).can("read", "board:c1", ana, board, { op: "read", doc: { public: true } })).toBe(false); // no evaluator
    expect(owned.conditionalOn("read", "board:none", ana, lists(["space", { access: [{ principal: "signed-in", rights: ["read"], when: {} }] }]))).toBe(true); // from the parent
  });

  it("gives the readable scopes, and stops at a cycle of parents", () => {
    expect(open.readable(["member:b1:u_ana", "board:b1", "space"], ana, lists())).toEqual(["member:b1:u_ana", "board:b1", "space"]);
    expect(owned.readable(["member:b1:u_ana", "board:b1", "space"], ana, lists())).toEqual(["member:b1:u_ana"]);
    const loop = new Access({ parent: (scope) => (scope === "a" ? "b" : "a"), fallback: () => ["read"] });
    expect(sorted(loop.rightsOn("a", ana, lists()))).toEqual([]);
    expect(loop.conditionalOn("read", "a", ana, lists())).toBe(false);
  });

  it("follows the rights model of the policy, and ignores an unknown right", () => {
    const model = new Access({ rights: { all: ["view", "edit"], implies: { edit: ["view"] } } });
    expect(sorted(model.implied(["edit", "fly"]))).toEqual(["edit", "view"]);
    expect(sorted(model.rightsOn("x", ana, lists(["x", { owner: "user:u_ana" }])))).toEqual(["edit", "view"]);
  });

  it("stops at a cycle of implications, and reads only own implications", () => {
    const cycle = new Access({ rights: { all: ["a", "b"], implies: { a: ["b"], b: ["a"] } } });
    expect(sorted(cycle.implied(["a"]))).toEqual(["a", "b"]);
    const odd = new Access({ rights: { all: ["__proto__", "constructor", "toString"], implies: {} } });
    expect(sorted(odd.implied(["__proto__", "constructor", "toString"]))).toEqual(["__proto__", "constructor", "toString"]);
    const hostile = JSON.parse('{"__proto__":{"isAdmin":true},"owner":"user:u_ana","access":[{"principal":"anyone","rights":["read"],"__proto__":{"when":1}}]}');
    const list = asAccessList(hostile)!;
    expect(Object.getPrototypeOf(list)).toBe(Object.prototype);
    expect(list.access?.[0]).toEqual({ principal: "anyone", rights: ["read"] });
  });

  it("reads a stored access list with care", () => {
    expect(asAccessList({ _id: "board:b", owner: "user:u", access: [{ principal: "link", rights: ["read", 7] }, { bad: 1 }, null], extra: true })).toEqual({
      owner: "user:u",
      access: [{ principal: "link", rights: ["read"] }],
    });
    expect(asAccessList({ access: [{ principal: "x", rights: ["read"], when: { a: 1 } }] })?.access?.[0]?.when).toEqual({ a: 1 });
    expect(asAccessList(null)).toBeUndefined();
    expect(asAccessList({})).toEqual({});
  });
});

describe("the subject of a principal", () => {
  it("reads the user, the email, the groups and the agent mark", () => {
    expect(subjectOf(undefined)).toEqual({});
    expect(subjectOf({ id: "u1", via: "better-auth", claims: { email: "a@b.c", groups: [{ id: "g1", role: "owner" }, { id: 2 }, "bad"] } })).toEqual({
      user: "u1",
      email: "a@b.c",
      groups: [{ id: "g1", role: "owner" }, { id: "2", role: "member" }],
    });
    expect(subjectOf({ id: "u1", via: "agent-as", claims: { agent: true } })).toEqual({ user: "u1", agent: true });
    expect(subjectOf({ id: "agent", via: "agent-token" })).toEqual({ agent: true });
    expect(subjectOf({ id: "token", via: "token" })).toEqual({ agent: true });
    expect(subjectOf({ id: "anonymous", via: "anonymous" })).toEqual({});
  });

  it("decides by via, never by the id: a user with the id agent, token or anonymous is a user", () => {
    for (const id of ["agent", "token", "anonymous"]) {
      const subject = subjectOf({ id, via: "better-auth" });
      expect(subject).toEqual({ user: id });
      expect(owned.can("admin", "user:someone-else", subject, lists())).toBe(false);
    }
  });

  it("a refused or unknown act-as is never a service account", () => {
    // A refused act-as gives no principal, and an act-as for an unknown user is anonymous
    for (const principal of [undefined, { id: "anonymous", via: "anonymous", claims: { agent: true, actAs: "ghost" } }]) {
      const subject = subjectOf(principal);
      expect(subject).toEqual({});
      expect(owned.can("read", "space", subject, lists())).toBe(false);
      expect(owned.can("read", "user:u_ana", subject, lists())).toBe(false);
    }
  });

  it("takes other values of via", () => {
    expect(subjectOf({ id: "g", via: "guest" }, { anonymousVia: ["guest"] })).toEqual({});
    expect(subjectOf({ id: "token", via: "token" }, { serviceVia: [] })).toEqual({ user: "token" });
  });
});

describe("the output filter of a host", () => {
  const invocation = (principal?: { id: string; via: string; claims?: Record<string, unknown> }) => ({ principal }) as unknown as Invocation;
  const board = lists(["board:b1", { access: [{ principal: "email:ana@example.com", rights: ["read"] }, { principal: "signed-in", rights: ["read"], when: { mine: true } }] }]);
  const evaluate = (_c: unknown, vars: Readonly<Record<string, unknown>>) => (vars["doc"] as { by?: unknown } | null)?.by === (vars["principal"] as { user: unknown }).user;
  const admit = accessAdmitItem({
    access: new Access(boardsPolicy(["mark@example.com"], evaluate)),
    lists: async () => board,
    scopeOf: (item) => (item as { _scope?: string })._scope,
  });

  it("admits an item of a scope that the subject reads, and refuses an item without a scope", async () => {
    expect(await admit({ _scope: "board:b1" }, invocation({ id: "u_ana", via: "better-auth", claims: { email: "ana@example.com" } }))).toBe(true);
    expect(await admit({ _scope: "board:b1" }, invocation({ id: "u_zoe", via: "better-auth" }))).toBe(false);
    expect(await admit({}, invocation({ id: "agent", via: "agent-token" }))).toBe(false);
    expect(await admit({ _scope: "board:b1" }, invocation())).toBe(false);
  });

  it("checks a conditional entry with the item as the document", async () => {
    expect(await admit({ _scope: "board:b1", by: "u_zoe" }, invocation({ id: "u_zoe", via: "better-auth" }))).toBe(true);
    expect(await admit({ _scope: "board:b1", by: "u_ana" }, invocation({ id: "u_zoe", via: "better-auth" }))).toBe(false);
  });

  it("takes another right and another subject function", async () => {
    const writes = accessAdmitItem({ access: new Access(), lists: () => lists(["x", { access: [{ principal: "anyone", rights: ["read"] }] }]), scopeOf: () => "x", right: "write", subjectOf: () => ({}) });
    expect(await writes({}, invocation())).toBe(false);
  });
});
