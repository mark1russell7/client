/**
 * The metadata that a transport sends.
 *
 * A key that starts with "__" is internal to one process (`__schema`, `__validation`,
 * `__middlewareOverrides`): a transport never sends it, and a server drops it when a request
 * carries it (deep dive TRN-11).
 */

/** This function gives a copy of the metadata without the internal keys. */
export function withoutInternalKeys<T extends Record<string, unknown>>(metadata: T | undefined): Partial<T> {
  const out: Record<string, unknown> = {};
  if (!metadata) return out as Partial<T>;
  for (const [key, value] of Object.entries(metadata)) {
    if (!key.startsWith("__")) out[key] = value;
  }
  return out as Partial<T>;
}
