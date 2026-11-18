// The tests of scripts/check-identity-peers.ts (roadmap CLI-117). Start them with:
// node --test scripts/check-identity-peers.test.ts

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { identityPeerProblems, identityUses, serviceNames, withoutComments, type IdentityPackage } from "./check-identity-peers.ts";

const SERVICE = "@mark1russell7/service";

/** This function gives a package as the check reads it. */
const pkg = (name: string, manifest: Record<string, unknown>, dts: string[], report: string): IdentityPackage => ({ name, manifest: { name, ...manifest }, dts, report });

describe("serviceNames", () => {
  it("reads the named imports of service and its subpaths, with type marks and aliases", () => {
    const dts = [
      'import type { Lifecycle, Operation } from "@mark1russell7/service";',
      'import { type Profile } from "@mark1russell7/service";',
      'import { type HttpKnobs, type MountStage as Stage } from "@mark1russell7/service/http";',
      'import type { Other } from "@mark1russell7/service-extra";',
      'import type { Clock } from "@procedures/client";',
    ].join("\n");
    assert.deepEqual(serviceNames(dts), [
      { original: "Lifecycle", local: "Lifecycle" },
      { original: "Operation", local: "Operation" },
      { original: "Profile", local: "Profile" },
      { original: "HttpKnobs", local: "HttpKnobs" },
      { original: "MountStage", local: "Stage" },
    ]);
  });

  it("reads a re-export, an import over more than one line, and an inline import type", () => {
    const dts = [
      'export type { ServiceBuilder } from "@mark1russell7/service";',
      "import type {",
      "  TransportImpl,",
      "  Check,",
      '} from "@mark1russell7/service";',
      'export declare function host(): import("@mark1russell7/service").Lifecycle;',
    ].join("\n");
    assert.deepEqual(
      serviceNames(dts).map((name) => name.original),
      ["ServiceBuilder", "TransportImpl", "Check", "Lifecycle"],
    );
  });

  it("does not read a name that only a comment holds", () => {
    const dts = ['/** The listener is an `httpTransport` of `@mark1russell7/service/http`.', ' * import type { Lifecycle } from "@mark1russell7/service";', " */", '// import { ServiceBuilder } from "@mark1russell7/service";', "export declare const x: number;"].join("\n");
    assert.deepEqual(serviceNames(dts), []);
    assert.equal(withoutComments('const url = "https://example.org"; // a note'), 'const url = "https://example.org"; ');
  });
});

describe("identityUses", () => {
  it("counts an identity type only when the API report holds its local name as a word", () => {
    const dts = ['import type { Lifecycle, Clock } from "@mark1russell7/service";', 'import type { ServiceBuilder as Builder } from "@mark1russell7/service";'];
    assert.deepEqual(identityUses(dts, "readonly life: () => Lifecycle | null;\nreadonly svc: Builder;"), ["Lifecycle", "ServiceBuilder"]);
    // A name that only an internal file uses is not in the report
    assert.deepEqual(identityUses(dts, "readonly clock: Clock;"), []);
    // A longer name that holds the name is not the name
    assert.deepEqual(identityUses(dts, "readonly life: LifecycleState;"), []);
  });

  it("reads the list of identity types that it gets", () => {
    const dts = ['import type { Clock } from "@mark1russell7/service/clock";'];
    assert.deepEqual(identityUses(dts, "readonly clock: Clock;", ["Clock"]), ["Clock"]);
  });
});

describe("identityPeerProblems", () => {
  const passes = ['import type { Lifecycle } from "@mark1russell7/service";'];
  const report = "readonly life: Lifecycle;";

  it("passes a package with service as a peer, and a package that passes only plain shapes", () => {
    assert.deepEqual(
      identityPeerProblems([
        pkg("@procedures/peer", { peerDependencies: { [SERVICE]: "^0.6.0" }, devDependencies: { [SERVICE]: "^0.6.0" } }, passes, report),
        pkg("@procedures/client", { dependencies: { [SERVICE]: "^0.6.0" } }, ['import type { Clock } from "@mark1russell7/service/clock";'], "readonly clock: Clock;"),
      ]),
      [],
    );
  });

  it("refuses a package that passes an identity value with service only as a plain dependency", () => {
    const problems = identityPeerProblems([pkg("@procedures/server", { dependencies: { [SERVICE]: "^0.6.0" } }, passes, report)]);
    assert.equal(problems.length, 2);
    assert.match(problems[0] ?? "", /^@procedures\/server: its public API passes Lifecycle of @mark1russell7\/service, so .* peerDependencies$/);
    assert.match(problems[1] ?? "", /is in dependencies and must be only in peerDependencies/);
  });

  it("refuses a package with service both as a dependency and as a peer", () => {
    const problems = identityPeerProblems([pkg("@procedures/server", { dependencies: { [SERVICE]: "^0.6.0" }, peerDependencies: { [SERVICE]: "^0.6.0" } }, passes, report)]);
    assert.deepEqual(problems.length, 1);
    assert.match(problems[0] ?? "", /is in dependencies/);
  });
});
