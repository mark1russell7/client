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
