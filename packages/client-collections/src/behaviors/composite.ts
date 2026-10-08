/**
 * Composite map methods built on `has`, `get`, `set` and `delete`.
 *
 * A map behavior (lruMap, ttlMap) intercepts the primitive methods. It returns these
 * implementations for the composite methods, bound to the behavior's own proxy, so a call such
 * as `setIfAbsent` goes through the behavior's `set` and keeps its rules: capacity and recency
 * for LRU, expiry for TTL. (BUGS-2026-07 L13: the composite methods went straight to the map
 * below, so they bypassed the behavior.)
 *
 * The semantics follow HashMap. One difference: `replaceEntry` and `deleteEntry` compare
 * values with Object.is, not with a map's custom value equality.
 */

import type { Entry, MapLike } from "../interfaces/map.js";

type AnyFn = (...args: never[]) => unknown;

export function compositeMapMethod<K, V>(map: MapLike<K, V>, name: PropertyKey): AnyFn | undefined {
  switch (name) {
    case "setIfAbsent":
      return ((key: K, value: V): V => {
        if (map.has(key)) return map.get(key);
        map.set(key, value);
        return value;
      }) as AnyFn;

    case "replace":
      return ((key: K, value: V): V | undefined => (map.has(key) ? map.set(key, value) : undefined)) as AnyFn;

    case "replaceEntry":
      return ((key: K, oldValue: V, newValue: V): boolean => {
        if (!map.has(key) || !Object.is(map.get(key), oldValue)) return false;
        map.set(key, newValue);
        return true;
      }) as AnyFn;

    case "deleteEntry":
      return ((key: K, value: V): boolean => {
        if (!map.has(key) || !Object.is(map.get(key), value)) return false;
        map.delete(key);
        return true;
      }) as AnyFn;

    case "computeIfAbsent":
      return ((key: K, mappingFunction: (key: K) => V): V => {
        if (map.has(key)) return map.get(key);
        const value = mappingFunction(key);
        map.set(key, value);
        return value;
      }) as AnyFn;

    case "computeIfPresent":
      return ((key: K, remapping: (key: K, value: V) => V | undefined): V | undefined => {
        if (!map.has(key)) return undefined;
        const value = remapping(key, map.get(key));
        if (value === undefined) {
          map.delete(key);
          return undefined;
        }
        map.set(key, value);
        return value;
      }) as AnyFn;

    case "compute":
      return ((key: K, remapping: (key: K, value: V | undefined) => V | undefined): V | undefined => {
        const present = map.has(key);
        const value = remapping(key, present ? map.get(key) : undefined);
        if (value === undefined) {
          if (present) map.delete(key);
          return undefined;
        }
        map.set(key, value);
        return value;
      }) as AnyFn;

    case "merge":
      return ((key: K, value: V, remapping: (oldValue: V, newValue: V) => V | undefined): V | undefined => {
        if (!map.has(key)) {
          map.set(key, value);
          return value;
        }
        const merged = remapping(map.get(key), value);
        if (merged === undefined) {
          map.delete(key);
          return undefined;
        }
        map.set(key, merged);
        return merged;
      }) as AnyFn;

    case "putAll":
      return ((other: Iterable<Entry<K, V>>): void => {
        for (const entry of other) {
          map.set(entry.key, entry.value);
        }
      }) as AnyFn;
  }
  return undefined;
}
