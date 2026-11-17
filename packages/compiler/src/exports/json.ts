/** The JSON form of the values of the procedures of an exports manifest. */

/**
 * The value as JSON gives it, so a call in process gives the output of a call over HTTP. An
 * absent value and an undefined item of an array become null. A property with an undefined value
 * is absent. This function copies only the arrays and objects that change.
 */
export function jsonValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    let copy: unknown[] | undefined;
    for (const [index, item] of value.entries()) {
      const json = jsonValue(item);
      if (json !== item) (copy ??= [...value])[index] = json;
    }
    return copy ?? value;
  }
  if (value === null || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return value;
  let copy: Record<string, unknown> | undefined;
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) {
      copy ??= { ...value };
      delete copy[key];
      continue;
    }
    const json = jsonValue(item);
    if (json !== item) (copy ??= { ...value })[key] = json;
  }
  return copy ?? value;
}
