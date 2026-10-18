/**
 * The subject of a principal, and the output filter of a host (`admitItem`) from the access lists.
 */
import type { AdmitItem, Invocation, Principal } from "@procedures/client";
import type { Access, AccessLists, AccessSubject, Right } from "./access.js";

/** The options of `subjectOf`. */
export interface SubjectOfOptions {
  /** The ids of a principal without a user (default `anonymous`). */
  readonly anonymousIds?: readonly string[] | undefined;
  /** The ids of a service account: an agent without a user (default `agent` and the host token `token`). */
  readonly agentIds?: readonly string[] | undefined;
}

/**
 * This function gives the subject of a principal of the request hook. The id is the user, except
 * for an anonymous or a service-account id. The claims give `email`, `groups` and `agent`. Without a
 * principal (a call from this process), the subject is anonymous.
 */
export function subjectOf(principal: Principal | undefined, options: SubjectOfOptions = {}): AccessSubject {
  if (!principal) return {};
  const anonymousIds = options.anonymousIds ?? ["anonymous"];
  const agentIds = options.agentIds ?? ["agent", "token"];
  const claims = principal.claims ?? {};
  const email = typeof claims["email"] === "string" && claims["email"] ? claims["email"] : undefined;
  const groups = Array.isArray(claims["groups"])
    ? (claims["groups"] as unknown[])
        .filter((group): group is { id: unknown; role?: unknown } => typeof group === "object" && group !== null && "id" in group)
        .map((group) => ({ id: String(group.id), role: typeof group.role === "string" ? group.role : "member" }))
    : undefined;
  if (agentIds.includes(principal.id)) return { agent: true };
  // An anonymous id is anonymous, also with the claim `agent` (an agent that acts for an unknown
  // user): an agent without a user is a service account, with each right
  if (anonymousIds.includes(principal.id)) return {};
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
}

/**
 * This function gives the output filter of a host (`admitItem`): it admits an item when the
 * subject has the right on the scope of the item. A conditional entry sees the item as `doc`.
 */
export function accessAdmitItem(options: AccessAdmitOptions): AdmitItem {
  const right = options.right ?? "read";
  const subjectFor = options.subjectOf ?? ((principal: Principal | undefined) => subjectOf(principal));
  return async (item, invocation) => {
    const scope = options.scopeOf(item);
    if (scope === undefined) return false;
    const subject = subjectFor(invocation.principal);
    const lists = await options.lists(invocation);
    if (options.access.can(right, scope, subject, lists)) return true;
    return options.access.conditionalOn(right, scope, subject, lists) && options.access.can(right, scope, subject, lists, { op: right, doc: item });
  };
}
