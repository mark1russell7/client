/**
 * The subject of a principal, the output filter of a host (`admitItem`) and the guard of the writes
 * of a collection (`accessWriteGuard`) from the access lists.
 */
import type { AdmitItem, CollectionWriteGuard, Invocation, Principal } from "@procedures/client";
import type { Access, AccessLists, AccessSubject, Right } from "./access.js";

/** The options of `subjectOf`. */
export interface SubjectOfOptions {
  /** The `via` of a principal without a user (default `anonymous`). */
  readonly anonymousVia?: readonly string[] | undefined;
  /** The `via` of a service account: an agent without a user (default `agent-token` and the host token `token`). */
  readonly serviceVia?: readonly string[] | undefined;
}

/**
 * This function gives the subject of a principal of the request hook. The `via` of the principal
 * decides: a service account, anonymous, or a user with the id of the principal. The id never
 * decides, so a user with the id `agent` stays a user. The claims give `email`, `groups` and
 * `agent`. Without a principal (a refused request, or a call from this process), the subject is
 * anonymous.
 */
export function subjectOf(principal: Principal | undefined, options: SubjectOfOptions = {}): AccessSubject {
  if (!principal) return {};
  if ((options.serviceVia ?? ["agent-token", "token"]).includes(principal.via)) return { agent: true };
  if ((options.anonymousVia ?? ["anonymous"]).includes(principal.via)) return {};
  const claims = principal.claims ?? {};
  const email = typeof claims["email"] === "string" && claims["email"] ? claims["email"] : undefined;
  const groups = Array.isArray(claims["groups"])
    ? (claims["groups"] as unknown[])
        .filter((group): group is { id: unknown; role?: unknown } => typeof group === "object" && group !== null && "id" in group)
        .map((group) => ({ id: String(group.id), role: typeof group.role === "string" ? group.role : "member" }))
    : undefined;
  return {
    user: principal.id,
    ...(email ? { email } : {}),
    ...(groups ? { groups } : {}),
    ...(claims["agent"] === true ? { agent: true } : {}),
  };
}

/** The options of `accessAdmitItem`. */
export interface AccessAdmitOptions {
  readonly access: Access;
  /** The access lists for an invocation, for example from a cache of the documents of the lists. */
  readonly lists: (invocation: Invocation) => AccessLists | Promise<AccessLists>;
  /** The scope of an item. An item without a scope is refused. */
  readonly scopeOf: (item: unknown) => string | undefined;
  /** The subject of the principal of the call (default `subjectOf`). */
  readonly subjectOf?: ((principal: Principal | undefined) => AccessSubject) | undefined;
  /** The right that an item needs (default `read`). */
  readonly right?: Right | undefined;
  /**
   * The document of an item for a `when` condition (default: the item itself). For the rows
   * `{ id, value }` of a collection (roadmap CLI-41), give `(row) => row.value`.
   */
  readonly docOf?: ((item: unknown) => unknown) | undefined;
}

/**
 * This function gives the output filter of a host (`admitItem`): it admits an item when the
 * subject has the right on the scope of the item. A conditional entry sees the document of the
 * item (`docOf`) as `doc`. The rule `admission.admit` of a collection has the same shape.
 */
export function accessAdmitItem(options: AccessAdmitOptions): AdmitItem {
  const right = options.right ?? "read";
  const subjectFor = options.subjectOf ?? ((principal: Principal | undefined) => subjectOf(principal));
  const docOf = options.docOf ?? ((item: unknown) => item);
  return async (item, invocation) => {
    const scope = options.scopeOf(item);
    if (scope === undefined) return false;
    const subject = subjectFor(invocation.principal);
    const lists = await options.lists(invocation);
    if (options.access.can(right, scope, subject, lists)) return true;
    return options.access.conditionalOn(right, scope, subject, lists) && options.access.can(right, scope, subject, lists, { op: right, doc: docOf(item) });
  };
}

/** The options of `accessWriteGuard`. */
export interface AccessWriteGuardOptions {
  readonly access: Access;
  /** The access lists for an invocation, for example from a cache of the documents of the lists. */
  readonly lists: (invocation: Invocation) => AccessLists | Promise<AccessLists>;
  /** The scope of a stored document. A write of a document without a scope is refused. */
  readonly scopeOf: (doc: unknown) => string | undefined;
  /** The subject of the principal of the call (default `subjectOf`). */
  readonly subjectOf?: ((principal: Principal | undefined) => AccessSubject) | undefined;
  /** The right that a write needs (default `write`). */
  readonly right?: Right | undefined;
}

/**
 * This function gives the guard of the writes of a collection (`admission.guard`, roadmap CLI-41).
 * It permits a write when the subject has the right on the scope of the stored document and on
 * the scope of the new document.
 *
 * - A `when` condition gets `op`, `doc` and `prev`. The `op` of a `set` and of a `patch` is
 *   `write`, and the `op` of a `delete` is `delete`.
 * - A write with no document, for example a delete of a missing id, is refused.
 * - A write that moves a document to another scope needs the right on the two scopes.
 */
export function accessWriteGuard(options: AccessWriteGuardOptions): CollectionWriteGuard {
  const right = options.right ?? "write";
  const subjectFor = options.subjectOf ?? ((principal: Principal | undefined) => subjectOf(principal));
  return async (write, invocation) => {
    const scopes = new Set<string>();
    for (const doc of [write.prev, write.doc]) {
      if (doc === undefined) continue;
      const scope = options.scopeOf(doc);
      if (scope === undefined) return false;
      scopes.add(scope);
    }
    if (scopes.size === 0) return false;
    const subject = subjectFor(invocation.principal);
    const lists = await options.lists(invocation);
    const context = { op: write.op === "delete" ? "delete" : "write", doc: write.doc, prev: write.prev };
    for (const scope of scopes) {
      if (!options.access.can(right, scope, subject, lists, context)) return false;
    }
    return true;
  };
}
