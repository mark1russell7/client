/**
 * The request hook of a procedures server (`principalOf`) over Better Auth. It gives the principal
 * of a network request:
 *
 * - The agent token in the bearer token: the principal `agent`. With the act-as header, the agent
 *   acts for that user, with the rights of the user and no more.
 * - Else the session cookie: the principal of the signed-in user.
 * - Else the anonymous principal, or no principal when `anonymous` is false (the server then refuses
 *   the request).
 *
 * A bearer token that is not the agent token goes on to the token check of the server.
 */
import { tokenMatches, type Credentials, type Principal, type PrincipalOf, type RequestIdentity } from "@procedures/client";
import type { SessionPrincipals, SignedInUser } from "./principals.js";

/** The `via` of each principal that the hook gives. */
export const VIA = {
  session: "better-auth",
  agent: "agent-token",
  agentAs: "agent-as",
  anonymous: "anonymous",
} as const;

/** The id of the principal of the agent token, and of a request without a user. */
export const AGENT_ID = "agent";
export const ANONYMOUS_ID = "anonymous";

/** The options of `betterAuthPrincipalOf`. */
export interface BetterAuthPrincipalOfOptions {
  /** The users of the sessions. */
  readonly principals: SessionPrincipals;
  /** The token of the agent. Without it, no request is the agent. */
  readonly agentToken?: string | undefined;
  /** The header that names the user for whom the agent acts (default `x-act-as`). */
  readonly actAsHeader?: string | undefined;
  /** Give the anonymous principal to a request without a user (default true). */
  readonly anonymous?: boolean | undefined;
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
  const actAs = (options.actAsHeader ?? "x-act-as").toLowerCase();
  const anonymous = options.anonymous ?? true;
  const identity = (principal: Principal): RequestIdentity => ({ principal });

  return async (credentials) => {
    if (options.agentToken && tokenMatches(options.agentToken, credentials.bearer)) {
      const target = credentials.headers?.[actAs];
      if (!target) return identity({ id: AGENT_ID, via: VIA.agent, claims: { agent: true } });
      const user = await options.principals.ofUser(target);
      // An unknown user has no rights: the agent acts as an anonymous request
      if (!user) return identity({ id: ANONYMOUS_ID, via: VIA.agentAs, claims: { agent: true, actAs: target } });
      return identity({ id: user.id, via: VIA.agentAs, claims: { ...userClaims(user), agent: true } });
    }
    const user = await options.principals.ofHeaders(headersOf(credentials));
    if (user) return identity({ id: user.id, via: VIA.session, claims: userClaims(user) });
    return anonymous ? identity({ id: ANONYMOUS_ID, via: VIA.anonymous }) : undefined;
  };
}
