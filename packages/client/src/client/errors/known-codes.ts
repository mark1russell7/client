/**
 * The known error codes of the client, without their texts (roadmap O95).
 *
 * The error policy of a server needs only the codes, not the summaries and the suggestions of
 * `ERROR_REGISTRY`. This module gives the codes from `ErrorCode` and `ERROR_CODES`, so a bundle
 * of the server engine gets no copy of the texts. A test makes sure that this set and the keys of
 * `ERROR_REGISTRY` are equal.
 */

import { ErrorCode } from "./codes.js";
import { ERROR_CODES } from "../../protocol.js";

/** The known error codes: each value of `ErrorCode` and each code of the wire protocol. */
export const KNOWN_ERROR_CODES: ReadonlySet<string> = new Set<string>([...Object.values(ErrorCode), ...Object.keys(ERROR_CODES)]);

/**
 * This function gives `true` for a known error code. It gives the same answer as
 * `isKnownErrorCode` of the registry, but it does not import the texts of the registry.
 */
export function isKnownCode(code: unknown): code is string {
  return typeof code === "string" && KNOWN_ERROR_CODES.has(code);
}
