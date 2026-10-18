/**
 * The rights of a subject on a scope. A scope is a name of an app, for example `space`,
 * `board:b1` or `user:u1`. A scope can have an access list: an owner, and entries that give
 * rights to principals. An entry can have a `when` condition over the document of the check.
 *
 * The app gives its own rules as a policy: the rights that hold without a list (the owner of a
 * personal scope), the parent of a scope without a list, and the rights of a scope without a list
 * and without a parent. The engine does the rest.
 */

/** A right, for example `read`. The rights model of the policy gives the set and the implications. */
export type Right = string;

/** The rights of an app, and the rights that each right implies. */
export interface RightsModel {
  readonly all: readonly Right[];
  readonly implies: Readonly<Record<Right, readonly Right[]>>;
}

/** The default model: `admin` implies `share` and `write`, and each of them implies `read`. */
export const DEFAULT_RIGHTS: RightsModel = Object.freeze({
  all: Object.freeze(["read", "write", "share", "admin"]),
  implies: Object.freeze({ admin: Object.freeze(["share", "write"]), share: Object.freeze(["read"]), write: Object.freeze(["read"]) }),
});

/** Who asks: the user, the verified email, the groups (with the role in each) and the agent mark. */
export interface AccessSubject {
  /** The id of the signed-in user. Absent: anonymous. */
  readonly user?: string | undefined;
  /** The verified email. */
  readonly email?: string | undefined;
  readonly groups?: readonly { readonly id: string; readonly role: string }[] | undefined;
  /** A program (an agent). Without `user`, it is a service account. With `user`, it acts for that user. */
  readonly agent?: boolean | undefined;
}

/**
 * An entry of an access list. `principal` names who gets the rights: `user:<id>`, `group:<id>`,
 * `email:<address>`, `signed-in` (each signed-in user), `anyone`, or a name of the policy.
 */
export interface AccessEntry {
  readonly principal: string;
  readonly rights: readonly Right[];
  /** A condition: the rights apply only where the policy evaluates it to exactly `true`. */
  readonly when?: unknown;
}

/** The access list of a scope: an owner (each right: `user:`, `email:` or `group:`) and entries. */
export interface AccessList {
  readonly owner?: string | undefined;
  readonly access?: readonly AccessEntry[] | undefined;
}

/** The operation and the document of a check, for the `when` conditions. */
export interface AccessContext {
  /** For example `read`, `write` or `delete`. */
  readonly op: string;
  /** The document that the operation reads or writes. */
  readonly doc?: unknown;
  /** The stored document before a write or a delete. */
  readonly prev?: unknown;
}

/** The rules of an app. */
export interface AccessPolicy {
  /** The rights model (default `DEFAULT_RIGHTS`). */
  readonly rights?: RightsModel | undefined;
  /**
   * The evaluator of a `when` condition. It gets the condition and the variables `principal`, `doc`,
   * `prev` and `op`. Only `true` counts, and an error is false. Without it, a conditional entry gives nothing.
   */
  readonly evaluate?: ((condition: unknown, variables: Readonly<Record<string, unknown>>) => boolean) | undefined;
  /**
   * The rights that hold before the access list, for example each right of the owner of a personal
   * scope. A defined result is final: the list, the parent and the fallback do not apply.
   */
  readonly implicit?: ((scope: string, subject: AccessSubject) => Iterable<Right> | undefined) | undefined;
  /** The scope whose rights a scope without an access list takes, for example the space for a board. */
  readonly parent?: ((scope: string) => string | undefined) | undefined;
  /** The rights of a scope without an access list and without a parent (default: none). */
  readonly fallback?: ((scope: string, subject: AccessSubject) => Iterable<Right> | undefined) | undefined;
  /** More principal names of the app. It gives undefined to use the default names. */
  readonly names?: ((principal: string, subject: AccessSubject) => boolean | undefined) | undefined;
  /** A subject with each right in each scope (default: an agent without a user). */
  readonly superuser?: ((subject: AccessSubject) => boolean) | undefined;
}

/** The access lists of the scopes, by scope. */
export type AccessLists = ReadonlyMap<string, AccessList>;

const normalEmail = (email: string | undefined): string => (email ?? "").trim().toLowerCase();

/** The engine of the rights of a policy. */
export class Access {
  readonly #policy: AccessPolicy;
  readonly #model: RightsModel;

  constructor(policy: AccessPolicy = {}) {
    this.#policy = policy;
    this.#model = policy.rights ?? DEFAULT_RIGHTS;
  }

  /** This method gives the rights and each right that they imply. It ignores a right that the model does not know. */
  implied(rights: Iterable<Right>): Set<Right> {
    const out = new Set<Right>();
    const add = (right: Right): void => {
      if (out.has(right) || !this.#model.all.includes(right)) return;
      out.add(right);
      for (const next of this.#model.implies[right] ?? []) add(next);
    };
    for (const right of rights) add(right);
    return out;
  }

  /** True when an access-list principal names the subject. */
  names(principal: string, subject: AccessSubject): boolean {
    const custom = this.#policy.names?.(principal, subject);
    if (custom !== undefined) return custom;
    if (principal === "anyone") return true;
    if (!subject.user) return false;
    if (principal === "signed-in") return true;
    return this.#namesOne(principal, subject);
  }

  /** True when a principal of one user, one email or one group names the subject (the built-in names only). */
  #namesOne(principal: string, subject: AccessSubject): boolean {
    if (!subject.user) return false;
    if (principal === `user:${subject.user}`) return true;
    if (principal.startsWith("email:")) return !!subject.email && normalEmail(principal.slice("email:".length)) === normalEmail(subject.email);
    if (principal.startsWith("group:")) return !!subject.groups?.some((group) => principal === `group:${group.id}`);
    return false;
  }

  /** The variables of a `when` condition for a subject. */
  #variables(subject: AccessSubject, context: AccessContext): Record<string, unknown> {
    return {
      principal: { user: subject.user ?? null, email: subject.email ?? null, groups: (subject.groups ?? []).map((group) => group.id), signedIn: !!subject.user },
      doc: context.doc ?? null,
      prev: context.prev ?? null,
      op: context.op,
    };
  }

  /** The rights that an access list gives a subject. */
  listRights(list: AccessList, subject: AccessSubject, context?: AccessContext): Set<Right> {
    // The owner names one user, one email or one group: never a name of the policy, `anyone` or `signed-in`
    if (list.owner !== undefined && this.#namesOne(list.owner, subject)) {
      return new Set(this.#model.all);
    }
    const rights: Right[] = [];
    for (const entry of list.access ?? []) {
      if (typeof entry?.principal !== "string" || !this.names(entry.principal, subject)) continue;
      if (entry.when !== undefined) {
        if (!context || !this.#policy.evaluate) continue;
        let passes = false;
        try {
          passes = this.#policy.evaluate(entry.when, this.#variables(subject, context)) === true;
        } catch {
          passes = false;
        }
        if (!passes) continue;
      }
      for (const right of entry.rights ?? []) rights.push(right);
    }
    return this.implied(rights);
  }

  /** The rights of a subject on a scope. */
  rightsOn(scope: string, subject: AccessSubject, lists: AccessLists, context?: AccessContext): Set<Right> {
    if ((this.#policy.superuser ?? ((s: AccessSubject) => s.agent === true && !s.user))(subject)) return new Set(this.#model.all);
    const seen = new Set<string>();
    for (let current: string | undefined = scope; current !== undefined && !seen.has(current); current = this.#policy.parent?.(current)) {
      seen.add(current);
      const implicit = this.#policy.implicit?.(current, subject);
      if (implicit !== undefined) return this.implied(implicit);
      const list = lists.get(current);
      if (list) return this.listRights(list, subject, context);
      if (this.#policy.parent?.(current) === undefined) return this.implied(this.#policy.fallback?.(current, subject) ?? []);
    }
    return new Set();
  }

  /** True when the subject has the right on the scope. */
  can(right: Right, scope: string, subject: AccessSubject, lists: AccessLists, context?: AccessContext): boolean {
    return this.rightsOn(scope, subject, lists, context).has(right);
  }

  /**
   * True when a conditional entry of the list of the scope (or of the first list of its parents) can
   * give the subject the right on some documents. Then check each document with its context.
   */
  conditionalOn(right: Right, scope: string, subject: AccessSubject, lists: AccessLists): boolean {
    const seen = new Set<string>();
    let list: AccessList | undefined;
    for (let current: string | undefined = scope; current !== undefined && !seen.has(current) && !list; current = this.#policy.parent?.(current)) {
      seen.add(current);
      list = lists.get(current);
    }
    return !!list?.access?.some(
      (entry) => entry?.when !== undefined && typeof entry.principal === "string" && this.names(entry.principal, subject) && this.implied(entry.rights ?? []).has(right)
    );
  }

  /** The scopes of a list that the subject can read. */
  readable(scopes: readonly string[], subject: AccessSubject, lists: AccessLists): string[] {
    return scopes.filter((scope) => this.can("read", scope, subject, lists));
  }
}

/** This function checks a stored access list: it keeps only the known fields and the entries with a principal and rights. */
export function asAccessList(raw: unknown): AccessList | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const record = raw as Record<string, unknown>;
  const access = Array.isArray(record["access"])
    ? (record["access"] as unknown[])
        .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && typeof (entry as Record<string, unknown>)["principal"] === "string" && Array.isArray((entry as Record<string, unknown>)["rights"]))
        .map((entry) => ({
          principal: entry["principal"] as string,
          rights: (entry["rights"] as unknown[]).filter((right): right is string => typeof right === "string"),
          ...(entry["when"] !== undefined ? { when: entry["when"] } : {}),
        }))
    : undefined;
  return { ...(typeof record["owner"] === "string" ? { owner: record["owner"] } : {}), ...(access ? { access } : {}) };
}
