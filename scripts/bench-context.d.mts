/** The types of the part of `bench-context.mjs` that the TypeScript scripts import. The JSDoc of the module is the source. */

/** The context of a runner: the CPU, the core count, Node.js, the platform and the GitHub runner. */
export interface RunnerContext {
  readonly cpu: string;
  readonly cores: number;
  readonly node: string;
  readonly platform: string;
  readonly arch: string;
  readonly runner?: { readonly name?: string; readonly image?: string; readonly imageVersion?: string };
}

/** The context of the runner, from the environment and the system. */
export function runnerContext(env?: NodeJS.ProcessEnv, system?: { cpus: readonly { model: string }[]; node: string; platform: string; arch: string }): RunnerContext;
