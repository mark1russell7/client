/**
 * The facts of the tarball of a version and the integrity check of its bytes. The facts come from the version documents
 * that `measures.test.ts` also reads. The hashes that the tests expect come from `node:crypto`, which is not the code
 * of the check. No test sends a request.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntegrity, extractRegistryDist, registryVersionRequest, tarballIntegrity } from "./index.js";

const recorded = (file: string): string => readFileSync(join(import.meta.dirname, "__tests__", "recorded", file), "utf8");

const ABC = new TextEncoder().encode("abc");
const hashOf = (algorithm: string, bytes: Uint8Array): string => createHash(algorithm).update(bytes).digest("base64");
const sri = (algorithm: string, bytes: Uint8Array): string => `${algorithm}-${hashOf(algorithm, bytes)}`;

describe("the facts of the tarball of a version", () => {
  it("reads the URL, the hashes and the sizes of the tarball", () => {
    const request = registryVersionRequest("sockette");
    expect(extractRegistryDist(recorded("registry-version.200.json"), request.url)).toEqual({
      rows: [
        {
          package: "sockette",
          version: "2.0.6",
          tarball: "https://registry.npmjs.org/sockette/-/sockette-2.0.6.tgz",
          integrity: "sha512-W6iG8RGV6Zife3Cj+FhuyHV447E6fqFM2hKmnaQrTvg3OydINV3Msj3WPFbX76blUlUxvQSMMMdrJxce8NqI5Q==",
          shasum: "63b533f3cfe3b592fc84178beea6577fa18cebf3",
          fileCount: 11,
          unpackedSize: 18215,
        },
      ],
      missing: [],
    });
  });

  it("reads a scoped package, and a request can name an exact version", () => {
    const row = extractRegistryDist(recorded("registry-version-scoped.200.json"), registryVersionRequest("@stomp/stompjs").url).rows[0];
    expect(row).toMatchObject({ package: "@stomp/stompjs", tarball: "https://registry.npmjs.org/@stomp/stompjs/-/stompjs-7.5.0.tgz", fileCount: 85 });
    expect(registryVersionRequest("sockette", "2.0.6").url).toBe("https://registry.npmjs.org/sockette/2.0.6");
  });

  it("puts a package or a version that the registry does not know in missing", () => {
    expect(extractRegistryDist(recorded("registry-version-missing.404.json"), registryVersionRequest("no-such-package-1234").url).missing).toEqual(["no-such-package-1234"]);
    expect(extractRegistryDist('"version not found: 9.9.9"', registryVersionRequest("sockette", "9.9.9").url)).toEqual({ rows: [], missing: ["sockette"] });
  });

  it("refuses a body with no tarball", () => {
    const url = registryVersionRequest("sockette").url;
    expect(() => extractRegistryDist("<html>", url)).toThrow(/not an npm version document with a tarball/);
    expect(() => extractRegistryDist('{"version":"1.0.0"}', url)).toThrow(/not an npm version document with a tarball/);
    expect(() => extractRegistryDist('{"version":"1.0.0","dist":{"shasum":"00"}}', url)).toThrow(/not an npm version document with a tarball/);
  });

  it("gives null for the facts that an old version does not have", () => {
    const shasum = createHash("sha1").update(ABC).digest("hex");
    const body = JSON.stringify({ version: "0.1.0", dist: { tarball: "https://registry.npmjs.org/sockette/-/sockette-0.1.0.tgz", shasum, fileCount: -1 } });
    expect(extractRegistryDist(body, registryVersionRequest("sockette", "0.1.0").url).rows[0]).toMatchObject({ integrity: null, shasum, fileCount: null, unpackedSize: null });
  });
});

describe("the integrity check", () => {
  it("passes the bytes of each algorithm, with the known hash of abc for sha512", async () => {
    expect(sri("sha512", ABC)).toBe("sha512-3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==");
    for (const algorithm of ["sha1", "sha256", "sha384", "sha512"] as const) {
      expect(await checkIntegrity(ABC, sri(algorithm, ABC))).toEqual({ ok: true, algorithm, actual: hashOf(algorithm, ABC) });
    }
  });

  it("fails bytes with one changed byte, and gives their hash", async () => {
    const changed = new TextEncoder().encode("abd");
    expect(await checkIntegrity(changed, sri("sha512", ABC))).toEqual({ ok: false, algorithm: "sha512", actual: hashOf("sha512", changed) });
  });

  it("hashes only the bytes of a view, and accepts an ArrayBuffer and a view of a SharedArrayBuffer", async () => {
    const wide = new TextEncoder().encode("xxabcxx");
    expect((await checkIntegrity(wide.subarray(2, 5), sri("sha512", ABC))).ok).toBe(true);
    expect((await checkIntegrity(ABC.slice().buffer, sri("sha512", ABC))).ok).toBe(true);
    const shared = new Uint8Array(new SharedArrayBuffer(3));
    shared.set(ABC);
    expect((await checkIntegrity(shared, sri("sha512", ABC))).ok).toBe(true);
  });

  it("uses the strongest algorithm of the text", async () => {
    const wrong = sri("sha512", new TextEncoder().encode("other"));
    expect(await checkIntegrity(ABC, `${sri("sha256", ABC)} ${wrong}`)).toMatchObject({ ok: false, algorithm: "sha512" });
    expect((await checkIntegrity(ABC, `${wrong} ${sri("sha512", ABC)}`)).ok).toBe(true);
    expect(await checkIntegrity(ABC, `${sri("sha1", ABC)} ${sri("sha256", ABC)}`)).toMatchObject({ ok: true, algorithm: "sha256" });
  });

  it("ignores the options of an item and the spaces around the items", async () => {
    expect((await checkIntegrity(ABC, `  ${sri("sha512", ABC)}?foo=bar \n `)).ok).toBe(true);
  });

  it("fails a text with no hash that the check knows", async () => {
    for (const text of ["", "   ", `md5-${hashOf("md5", ABC)}`, "sha3-abc", "sha512", "sha512-"]) {
      expect(await checkIntegrity(ABC, text)).toEqual({ ok: false, algorithm: null, actual: null });
    }
  });

  it("fails a hash that is not valid base64", async () => {
    expect(await checkIntegrity(ABC, "sha512-A")).toMatchObject({ ok: false, algorithm: "sha512" });
  });
});

describe("the integrity text of a tarball", () => {
  it("gives the integrity of the version document", () => {
    const row = extractRegistryDist(recorded("registry-version.200.json"), registryVersionRequest("sockette").url).rows[0];
    expect(row && tarballIntegrity(row)).toBe(row?.integrity);
  });

  it("gives the sha1 text of shasum for an old version, and the check passes with it", async () => {
    const shasum = createHash("sha1").update(ABC).digest("hex");
    const text = tarballIntegrity({ integrity: null, shasum });
    expect(text).toBe(sri("sha1", ABC));
    expect(await checkIntegrity(ABC, text ?? "")).toMatchObject({ ok: true, algorithm: "sha1" });
    expect(tarballIntegrity({ integrity: null, shasum: shasum.toUpperCase() })).toBe(text);
  });

  it("gives null when the facts have no hash", () => {
    expect(tarballIntegrity({ integrity: null, shasum: null })).toBeNull();
    expect(tarballIntegrity({ integrity: null, shasum: "not-a-hash" })).toBeNull();
  });
});
