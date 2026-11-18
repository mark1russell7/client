/**
 * The metadata of a network request (roadmap R18): no internal keys, no credential keys, and no key
 * that the face sets.
 */

import { describe, it, expect } from "vitest";
import { isWireMetadataKey, wireMetadata, withoutInternalKeys } from "./metadata.js";

describe("the metadata of a network request", () => {
  it("drops the internal keys and the key auth in each case of its letters, and keeps the other keys", () => {
    const metadata = { __schema: "s", auth: { token: "t" }, Auth: "a", AUTH: "b", note: "v", authority: "x", page: { size: 2 } };
    expect(wireMetadata(metadata)).toEqual({ note: "v", authority: "x", page: { size: 2 } });
  });

  it("drops the keys that the face sets", () => {
    expect(wireMetadata({ headers: "fake", query: "q", note: "v" }, new Set(["headers", "query"]))).toEqual({ note: "v" });
  });

  it("gives an empty object for no metadata", () => {
    expect(wireMetadata(undefined)).toEqual({});
  });

  it("tells each key as wireMetadata does", () => {
    const reserved = new Set(["params"]);
    const keys = ["note", "__x", "auth", "Auth", "params", "authority"];
    expect(keys.map((key) => isWireMetadataKey(key, reserved))).toEqual([true, false, false, false, false, true]);
  });

  it("keeps the key auth in the metadata of the process: withoutInternalKeys drops only the internal keys", () => {
    expect(withoutInternalKeys({ __schema: "s", auth: { token: "t" } })).toEqual({ auth: { token: "t" } });
  });
});
