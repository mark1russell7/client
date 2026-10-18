/**
 * The person of a request: the session cookie gives the user, and the `member` records of the
 * organization plugin give the groups. A short memo keeps the boot of a page, which sends many
 * requests at the same time, to one session lookup.
 */
import { ObjectId, type Db } from "mongodb";

/** A group of a user: an organization of the organization plugin, with the role of the user. */
export interface UserGroup {
  readonly id: string;
  readonly role: string;
}

/** A signed-in user. `email` is present only when it is verified. */
export interface SignedInUser {
  readonly id: string;
  readonly email?: string | undefined;
  readonly name?: string | undefined;
  readonly groups: readonly UserGroup[];
}

/** The part of a Better Auth server that `SessionPrincipals` uses. */
export interface SessionSource {
  readonly api: { getSession(context: { headers: Headers }): Promise<{ user?: unknown } | null | undefined> };
}

/** The options of `SessionPrincipals`. */
export interface SessionPrincipalsOptions {
  /** The Better Auth server. */
  readonly auth: SessionSource;
  /** The database of Better Auth: its `user` and `member` collections. */
  readonly db: Db;
  /** Use an email that is not verified, for a test server only (default false). */
  readonly trustUnverifiedEmail?: boolean | undefined;
  /** The time that a session lookup stays, in milliseconds (default 5000). */
  readonly sessionMemoMs?: number | undefined;
  /** The time that a groups lookup stays, in milliseconds (default 10000). */
  readonly groupsMemoMs?: number | undefined;
  /** The clock (default `Date.now`). The tests give their own. */
  readonly now?: (() => number) | undefined;
  /** The function that reports a failed lookup (default `console.warn`). */
  readonly warn?: ((message: string) => void) | undefined;
}

const MAX_MEMO = 5_000;

/** The ids to look for: the text, and the `ObjectId` when the text is one. */
function idsOf(id: string): unknown[] {
  return ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id];
}

/** The users of the sessions of the requests. */
export class SessionPrincipals {
  readonly #options: SessionPrincipalsOptions;
  readonly #sessions = new Map<string, { at: number; user: Promise<SignedInUser | undefined> }>();
  readonly #groups = new Map<string, { at: number; groups: Promise<readonly UserGroup[]> }>();

  constructor(options: SessionPrincipalsOptions) {
    this.#options = options;
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  #warn(message: string): void {
    (this.#options.warn ?? ((text: string) => console.warn(text)))(message);
  }

  #email(user: Record<string, unknown>): string | undefined {
    const verified = user["emailVerified"] === true || this.#options.trustUnverifiedEmail === true;
    return typeof user["email"] === "string" && user["email"] && verified ? user["email"] : undefined;
  }

  /** This method gives the user of the session cookie of the headers, or undefined when there is no session. */
  ofHeaders(headers: Headers): Promise<SignedInUser | undefined> {
    const cookie = headers.get("cookie") ?? "";
    if (!cookie) return Promise.resolve(undefined);
    const now = this.#now();
    const ttl = this.#options.sessionMemoMs ?? 5_000;
    const hit = this.#sessions.get(cookie);
    if (hit && now - hit.at < ttl) return hit.user;
    const user = this.#resolve(headers);
    this.#sessions.set(cookie, { at: now, user });
    if (this.#sessions.size > MAX_MEMO) prune(this.#sessions, now, ttl);
    return user;
  }

  async #resolve(headers: Headers): Promise<SignedInUser | undefined> {
    let session: { user?: unknown } | null | undefined;
    try {
      session = await this.#options.auth.api.getSession({ headers });
    } catch {
      return undefined;
    }
    const user = session?.user;
    if (typeof user !== "object" || user === null) return undefined;
    const record = user as Record<string, unknown>;
    if (record["id"] === undefined || record["id"] === null) return undefined;
    return this.#userOf(String(record["id"]), record);
  }

  async #userOf(id: string, record: Record<string, unknown>): Promise<SignedInUser> {
    const email = this.#email(record);
    const name = typeof record["name"] === "string" && record["name"] ? record["name"] : undefined;
    return { id, ...(email ? { email } : {}), ...(name ? { name } : {}), groups: await this.groupsOf(id) };
  }

  /** This method gives a user by id from the records of Better Auth, or undefined when the user is unknown. */
  async ofUser(id: string): Promise<SignedInUser | undefined> {
    let record: Record<string, unknown> | null;
    try {
      record = (await this.#options.db.collection("user").findOne({ _id: { $in: idsOf(id) } } as never)) as Record<string, unknown> | null;
    } catch (error) {
      this.#warn(`[better-auth] the lookup of a user failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
    return record ? this.#userOf(id, record) : undefined;
  }

  /** This method gives the groups of a user: the `member` records of the organization plugin. */
  groupsOf(id: string): Promise<readonly UserGroup[]> {
    const now = this.#now();
    const ttl = this.#options.groupsMemoMs ?? 10_000;
    const hit = this.#groups.get(id);
    if (hit && now - hit.at < ttl) return hit.groups;
    const groups = (async (): Promise<readonly UserGroup[]> => {
      try {
        const rows = (await this.#options.db.collection("member").find({ userId: { $in: idsOf(id) } } as never).toArray()) as Record<string, unknown>[];
        return rows.map((row) => ({ id: String(row["organizationId"]), role: String(row["role"] ?? "member") }));
      } catch (error) {
        this.#warn(`[better-auth] the lookup of the groups failed: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    })();
    this.#groups.set(id, { at: now, groups });
    if (this.#groups.size > MAX_MEMO) prune(this.#groups, now, ttl);
    return groups;
  }

  /** This method forgets the memo of the groups of a user, for example after a change of a membership. */
  forgetGroups(id: string): void {
    this.#groups.delete(id);
  }
}

/** This function removes the expired entries of a memo. */
function prune(map: Map<string, { at: number }>, now: number, ttl: number): void {
  for (const [key, entry] of map) if (now - entry.at >= ttl) map.delete(key);
}
