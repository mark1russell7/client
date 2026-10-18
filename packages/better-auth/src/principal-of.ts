/**
 * The request hook of a procedures server (`principalOf`) over Better Auth. It gives the principal
 * of a network request:
 *
 * - The agent token in the bearer token: the principal `agent`. With the act-as header, the agent
 *   acts for that user, with the rights of the user and no more. The `actAs` policy tells for whom.
 *   Without the policy, the hook refuses each act-as request.
 * - Else the session cookie: the principal of the signed-in user.
 * - Else the anonymous principal with the `anonymous` narrowing. Without that option, the hook gives
 *   no principal, and the server refuses the request.
 *
 * A bearer token that is not the agent token goes on to the token check of the server. A server
 * with this hook sets no `token`: its token check runs after the hook, and a cookie session has no
 * bearer token.
 */
import { tokenMatches, type CapabilityRequest, type Credentials, type Principal, type PrincipalOf, type RequestIdentity } from "@procedures/client";
import type { SessionPrincipals, SignedInUser } from "./principals.js";

/** The `via` of each principal that the hook gives. */
export const VIA = {
  session: "better-auth",
  agent: "agent-token",
  agentAs: "agent-as",
  anonymous: "anonymous",
} as const;

/** The id of the principal of the agent token. */
export const AGENT_ID = "agent";
/** The id of the principal of a request without a user. */
export const ANONYMOUS_ID = "anonymous";

/** The policy of act-as: true when the agent can act for this user. */
export type ActAsPolicy = (user: SignedInUser, credentials: Credentials) => boolean | Promise<boolean>;

/** The options of `betterAuthPrincipalOf`. */
export interface BetterAuthPrincipalOfOptions {
  /** The users of the sessions. */
  readonly principals: SessionPrincipals;
  /** The token of the agent. Without it, no request is the agent. */
  readonly agentToken?: string | undefined;
  /** The header that names the user for whom the agent acts (default `x-act-as`). */
  readonly actAsHeader?: string | undefined;
  /** For whom the agent can act. Without it, the hook refuses each act-as request. */
  readonly actAs?: ActAsPolicy | undefined;
  /**
   * The narrowing of a request without a user (for example `{ effects: { writes: [] } }` for read
   * only). Without it (the default), the hook gives no principal, and the server refuses the request.
   */
  readonly anonymous?: CapabilityRequest | false | undefined;
}

/** The claims of a user: the verified email, the name and the groups. */
function userClaims(user: SignedInUser): Record<string, unknown> {
  return { ...(user.email ? { email: user.email } : {}), ...(user.name ? { name: user.name } : {}), groups: user.groups };
}

/** This function makes the headers of a request from its credentials, for the session lookup. */
export function headersOf(credentials: Credentials): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(credentials.headers ?? {})) {
    try {
      headers.set(name, value);
    } catch {
      // A header name that the Fetch API refuses: the session lookup does not need it
    }
  }
  if (!headers.has("cookie") && credentials.cookies) {
    const cookie = Object.entries(credentials.cookies)
      .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
      .join("; ");
    if (cookie) headers.set("cookie", cookie);
  }
  return headers;
}

/** This function gives the request hook of a procedures server over Better Auth. */
export function betterAuthPrincipalOf(options: BetterAuthPrincipalOfOptions): PrincipalOf {
  const actAsHeader = (options.actAsHeader ?? "x-act-as").toLowerCase();
  const anonymous = options.anonymous === false ? undefined : options.anonymous;
  /** The identity of a request without a user, or undefined when the server refuses it. */
  const anonymousIdentity = (claims?: Record<string, unknown>): RequestIdentity | undefined =>
    anonymous === undefined
      ? undefined
      : // The via is `anonymous` also for an agent that acts for an unknown user: the via decides the subject (refer to subjectOf of @procedures/access)
        { principal: { id: ANONYMOUS_ID, via: VIA.anonymous, ...(claims ? { claims } : {}) }, narrowing: anonymous };
  const identity = (principal: Principal): RequestIdentity => ({ principal });

  return async (credentials) => {
    if (options.agentToken && tokenMatches(options.agentToken, credentials.bearer)) {
      const target = credentials.headers?.[actAsHeader];
      if (!target) return identity({ id: AGENT_ID, via: VIA.agent, claims: { agent: true } });
      if (!options.actAs) return undefined;
      const user = await options.principals.ofUser(target);
      // An unknown user has no rights: the agent acts as an anonymous request, and a refused
      // act-as gives no principal (never the bare agent, which is a service account)
      if (!user) return anonymousIdentity({ agent: true, actAs: target });
      if (!(await options.actAs(user, credentials))) return undefined;
      return identity({ id: user.id, via: VIA.agentAs, claims: { ...userClaims(user), agent: true, actAs: user.id } });
    }
    const user = await options.principals.ofHeaders(headersOf(credentials));
    if (user) return identity({ id: user.id, via: VIA.session, claims: userClaims(user) });
    return anonymousIdentity();
  };
}
