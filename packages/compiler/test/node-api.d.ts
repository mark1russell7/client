/**
 * The Node.js APIs that the tests of this package use. The package works in a browser, so it has
 * no `@types/node`. These declarations let `tsconfig.test.json` (in `pnpm typecheck`) examine the tests.
 * The build of the package does not read this file.
 */

declare module "node:child_process" {
  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { readonly cwd?: string; readonly encoding: "utf8"; readonly timeout?: number },
  ): { readonly status: number | null; readonly stdout: string; readonly stderr: string };
}

declare module "node:fs" {
  export function mkdtempSync(prefix: string): string;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function rmSync(path: string, options?: { readonly recursive?: boolean; readonly force?: boolean }): void;
  export function writeFileSync(path: string, data: string): void;
}

declare module "node:module" {
  export function createRequire(path: string): { resolve(id: string): string };
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string): string;
}

interface ImportMeta {
  readonly url: string;
}

declare const process: { readonly execPath: string };
