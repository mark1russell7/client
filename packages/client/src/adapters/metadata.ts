/**
 * The metadata that a transport sends, and the metadata that a server takes from a network request.
 *
 * A key that starts with "__" is internal to one process (`__schema`, `__validation`,
 * `__middlewareOverrides`): a transport never sends it, and a server drops it when a request
 * carries it (deep dive TRN-11).
 *
 * The key `auth` holds credentials. A server reads the credentials of a network request from the
 * `Authorization` header, the cookies or the upgrade of a socket. They go to the request hook and to
 * the token check, not into the metadata (roadmap R18). So a network face drops the key `auth` in
 * each case of its letters.
 */

/** The metadata keys that hold credentials, in lower case. A network request does not set them. */
const CREDENTIAL_KEYS: ReadonlySet<string> = new Set(["auth"]);

/** This function gives a copy of the metadata without the internal keys. */
export function withoutInternalKeys<T extends Record<string, unknown>>(metadata: T | undefined): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!metadata) return out as Partial<T>;
  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith("__")) out[key] = value;
  }
  return out as Partial<T>;
}

/**
 * This function tells if a key of a network request goes into the metadata of the handler. The key
 * stays out when it is internal, when it holds credentials, or when the face sets it (`reserved`).
 */
export function isWireMetadataKey(key: string, reserved?: ReadonlySet<string>): boolean {
  return !key.startsWith("__") && !CREDENTIAL_KEYS.has(key.toLowerCase()) && !(reserved?.has(key) ?? false);
}

/** This function gives the metadata of a network request without the internal keys, the credential keys and the `reserved` keys. */
export function wireMetadata<T extends Record<string, unknown>>(metadata: T | undefined, reserved?: ReadonlySet<string>): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!metadata) return out as Partial<T>;
  for (const [key, value] of Object.entries(metadata)) {
    if (isWireMetadataKey(key, reserved)) out[key] = value;
  }
  return out as Partial<T>;
}
