/** The types of the part of `workspace.mjs` that the TypeScript scripts import. The module is the source. */

/** The manifest of a package: the fields of `package.json` that the scripts read. */
export interface Manifest {
  readonly name?: string;
  readonly version?: string;
  readonly private?: boolean;
  readonly exports?: string | Readonly<Record<string, unknown>>;
  readonly sideEffects?: boolean | readonly string[];
  readonly bin?: string | Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
  readonly [field: string]: unknown;
}

/** One public package of `packages/`. */
export interface PublicPackage {
  /** The folder name in `packages/`. */
  readonly dir: string;
  /** The absolute path of the folder. */
  readonly path: string;
  readonly name: string;
  readonly version: string;
  readonly bin: string | Readonly<Record<string, string>>;
  readonly manifest: Manifest;
}

/** The root folder of the repository. */
export const root: string;

/** The general packages that the monorepo uses, and the npm range of each one. */
export const GENERAL_PACKAGES: Readonly<Record<string, string>>;

/** The public packages (not `private`), with the dependencies first. */
export function publicPackages(): PublicPackage[];

/** One folder of `packages/` with a `package.json`. */
export interface WorkspacePackage {
  readonly dir: string;
  readonly path: string;
  readonly manifest: Manifest;
}

/** Each folder of `packages/` with a `package.json`, and its manifest. */
export function workspacePackages(): WorkspacePackage[];

/**
 * Starts a command in the folder `cwd` and gives its standard output. `quiet` hides the standard
 * error. The function throws the error of `execSync` when the command fails.
 */
export function run(cmd: string, args: readonly string[], cwd: string, quiet?: boolean): string;

/** The text of the file `wanted` of the archive `tgz`. The function throws when the archive does not have the file. */
export function readFromTarball(tgz: string, wanted: string): string;

/** The git specifiers (github:, git+, git:) in the dependencies of a manifest. */
export function gitDependencies(manifest: Manifest): string[];
