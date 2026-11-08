// A package that passes an identity value of service has service as a peer (roadmap CLI-117).
//
// Service keeps some state for each copy of the package, in a WeakMap keyed by an object. A
// lifecycle keys the late holds of its drains, and an HTTP answer keys its owner. A value of one
// copy thus fails in the other copy: a builder of one copy that goes to `run()` of the other copy
// does not see its drains (SYS-93). Two copies come when an app links service in its workspace and
// installs a client package from npm with service as a plain dependency.
//
// A package whose public API takes or gives such a value has service in peerDependencies, so the
// app and the package use one copy. A plain shape (a `Clock`, a `Backoff`) works the same from two
// copies, so service stays a plain dependency there.
//
// For each public package, this script reads the names that its built .d.ts files import from
// service and its subpaths. A name counts when it is an identity type and its API report
// (test/api/public-api.txt) holds it as a word. Each such package must have service in
// peerDependencies and not in dependencies.
//
// Start it after `pnpm build`: node scripts/check-identity-peers.ts. Exit code 1 on a failure.
// The tests of the check: node --test scripts/check-identity-peers.test.ts.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { publicPackages, type Manifest } from "./lib/workspace.mjs";

/** The name of the service package. */
export const SERVICE = "@mark1russell7/service";

/**
 * The types of service whose values have state for each copy, or reach such a value. The roots are
 * `Lifecycle` and `RequestStream` (the WeakMap keys), and `TransportImpl` and `RequestHandler` (they
 * write to the maps of their copy). Each other name is an exported type whose declaration names a
 * root or a listed type. This list is a copy of `IDENTITY_TYPES` of service 0.6.7 (systems #401).
 * When that version is on npm, this script imports the export, and this copy goes away.
 */
export const IDENTITY_TYPES: readonly string[] = [
  "Client", "GrpcClient", "HttpClient", "HttpTransport", "IterationContext", "JobContext", "Lifecycle",
  "MongoClient", "MountContext", "PgClient", "QueueDrain", "QueueDrainOptions", "RabbitClient", "RedisClient",
  "RedisSender", "RequestHandler", "RequestStream", "ServiceBuilder", "SubjectFactory", "TransportImpl",
  "TransportSubject", "UpgradeHandler", "WorkerLoop", "WorkerLoopOptions", "WsClient",
];

/** One import of a name from service: the name in service, and the name in the importing file. */
export interface ServiceName {
  readonly original: string;
  readonly local: string;
}

const SPECIFIER = String.raw`"(@mark1russell7/service(?:/[^"]*)?)"`;
const NAMED = new RegExp(String.raw`\b(?:import|export)\s+(?:type\s+)?\{([^}]*)\}\s*from\s*${SPECIFIER}`, "g");
const INLINE = new RegExp(String.raw`\bimport\(\s*${SPECIFIER}\s*\)\.([A-Za-z_$][\w$]*)`, "g");

/** This function removes the block comments and the line comments of a declaration file. */
export function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** This function gives the names that a declaration file imports or re-exports from service and its subpaths. */
export function serviceNames(dts: string): ServiceName[] {
  const text = withoutComments(dts);
  const names: ServiceName[] = [];
  for (const match of text.matchAll(NAMED)) {
    for (const part of (match[1] ?? "").split(",")) {
      const words = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/);
      const original = words[0]?.trim();
      if (original === undefined || original === "") continue;
      names.push({ original, local: (words[1] ?? original).trim() });
    }
  }
  for (const match of text.matchAll(INLINE)) {
    const name = match[2];
    if (name !== undefined) names.push({ original: name, local: name });
  }
  return names;
}

/** This function gives the identity types that the public API takes or gives, sorted: imported from service, and a word of the report. */
export function identityUses(dtsFiles: readonly string[], report: string, identity: readonly string[] = IDENTITY_TYPES): string[] {
  const found = new Set<string>();
  for (const dts of dtsFiles) {
    for (const { original, local } of serviceNames(dts)) {
      if (identity.includes(original) && new RegExp(String.raw`(?<![\w$])${local.replace(/\$/g, "\\$")}(?![\w$])`).test(report)) found.add(original);
    }
  }
  return [...found].sort();
}

/** One package as the check reads it: its manifest, the text of its built .d.ts files, and its API report. */
export interface IdentityPackage {
  readonly name: string;
  readonly manifest: Manifest;
  readonly dts: readonly string[];
  readonly report: string;
}

/** This function gives one problem for each package that passes an identity value and has no peer on service. */
export function identityPeerProblems(packages: readonly IdentityPackage[], identity: readonly string[] = IDENTITY_TYPES): string[] {
  const problems: string[] = [];
  for (const pkg of packages) {
    const uses = identityUses(pkg.dts, pkg.report, identity);
    if (uses.length === 0) continue;
    const peer = pkg.manifest.peerDependencies?.[SERVICE];
    const plain = pkg.manifest.dependencies?.[SERVICE];
    if (peer === undefined) problems.push(`${pkg.name}: its public API passes ${uses.join(", ")} of ${SERVICE}, so ${SERVICE} must be in peerDependencies`);
    if (plain !== undefined) problems.push(`${pkg.name}: ${SERVICE} is in dependencies and must be only in peerDependencies (and devDependencies), because its public API passes ${uses.join(", ")}`);
  }
  return problems;
}

/** This function gives the text of each .d.ts file under a folder. */
function declarationFiles(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.d\.[cm]?ts$/.test(file))
    .map((file) => readFileSync(join(folder, file), "utf8"));
}

function main(): void {
  const packages: IdentityPackage[] = [];
  const unbuilt: string[] = [];
  for (const { name, path, manifest } of publicPackages() as { name: string; path: string; manifest: Manifest }[]) {
    const reportFile = join(path, "test", "api", "public-api.txt");
    if (!existsSync(reportFile)) continue;
    const dts = declarationFiles(join(path, "dist"));
    if (dts.length === 0) unbuilt.push(name);
    packages.push({ name, manifest, dts, report: readFileSync(reportFile, "utf8") });
  }
  const problems = [...unbuilt.map((name) => `${name}: no .d.ts files in dist, start pnpm build first`), ...identityPeerProblems(packages)];
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(`identity peers: ${packages.length} packages, no problem`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
