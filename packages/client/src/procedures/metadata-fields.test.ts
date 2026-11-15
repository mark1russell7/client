/**
 * The schema of the typed metadata fields (`metadata-fields.ts`): each typed field has its
 * type, and a custom field keeps any value.
 */

import { describe, expect, it } from "vitest";
import { metadataFieldRefusal } from "./metadata-fields.js";

describe("metadataFieldRefusal", () => {
  it.each([
    [undefined],
    [{}],
    [{ description: "Add one", tags: ["math"], title: "Add", deprecated: false, deprecationMessage: "Use add2" }],
    [{ effects: { reads: [], writes: ["fs"], idempotent: true, destructive: false } }],
    [{ stream: { unbounded: true }, untrusted: ["body"], fsRoot: { cwd: "cwd", paths: ["path"], refuse: "no root" } }],
    [{ description: undefined, tags: undefined }],
    [{ note: 7, custom: { any: ["value"] } }],
  ])("accepts the metadata %j", (metadata) => {
    expect(metadataFieldRefusal(metadata)).toBeUndefined();
  });

  it.each([
    [{ tags: "math" }, "metadata.tags"],
    [{ tags: ["math", 1] }, "metadata.tags.1"],
    [{ description: 5 }, "metadata.description"],
    [{ title: ["x"] }, "metadata.title"],
    [{ deprecated: "yes" }, "metadata.deprecated"],
    [{ effects: { writes: "fs" } }, "metadata.effects.writes"],
    [{ stream: true }, "metadata.stream"],
    [{ untrusted: "body" }, "metadata.untrusted"],
    [{ fsRoot: { paths: "path" } }, "metadata.fsRoot.paths"],
    ["text", "metadata"],
  ])("refuses the metadata %j, and names %s", (metadata, field) => {
    expect(metadataFieldRefusal(metadata)).toContain(`The field ${field} has a wrong type`);
  });
});
