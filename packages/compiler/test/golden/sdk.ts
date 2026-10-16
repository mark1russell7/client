/**
 * The typed SDK of 7 procedures. @procedures/compiler wrote this file from the manifest 0b280dd4e933e935 (procedures.manifest/1). Do not edit it: write it again from the manifest.
 */

/** The input of `config.get`. */
export type ConfigGetInput = {
  key: string;
};

/** The output of `config.get`. */
export type ConfigGetOutput = {
  [key: string]: string;
};

/** The input of `files.read`. */
export type FilesReadInput = {
  /** The path of the file */
  path: string;
  /** The encoding of the content */
  encoding?: "utf8" | "base64" | undefined;
};

/** The output of `files.read`. */
export type FilesReadOutput = {
  content: string;
  /** The size in bytes */
  size: number;
};

/** The input of `files.write`. */
export type FilesWriteInput = {
  path: string;
  content: string;
  "mode-bits"?: number | undefined;
  "2fa"?: boolean | undefined;
};

/** The output of `files.write`. */
export type FilesWriteOutput = {
  written: true;
};

/** The input of `jobs.list`. */
export type JobsListInput = {
  state?: "queued" | "done" | undefined;
};

/** The output of `jobs.list`. */
export type JobsListOutput = Array<{
  id: string;
  state: "queued" | "done" | null;
}>;

/** The input of `jobs.list.count`. */
export type JobsListCountInput = {
  [key: string]: unknown;
};

/** The output of `jobs.list.count`. */
export type JobsListCountOutput = {
  count: number;
};

/** The input of `math.add`. */
export type MathAddInput = {
  a: number;
  b: number;
};

/** The output of `math.add`. */
export type MathAddOutput = number;

/** The input of `misc.any`. */
export type MiscAnyInput = unknown;

/** The output of `misc.any`. */
export type MiscAnyOutput = unknown;

/** A client that calls a procedure by its path: `ctx.client` of a procedure handler, or an adapter of a `Client`. */
export interface SdkClient {
  call(path: string[], input: unknown): Promise<unknown>;
}

/** The methods of the procedures, at `sdk.<namespace>.<name>`. */
export interface Sdk {
  readonly config: {
    readonly get: (input: ConfigGetInput) => Promise<ConfigGetOutput>;
  };
  readonly files: {
    /** Read a file */
    readonly read: (input: FilesReadInput) => Promise<FilesReadOutput>;
    /** Write a file. A comment end *\/ in a description stays in the comment. */
    readonly write: (input: FilesWriteInput) => Promise<FilesWriteOutput>;
  };
  readonly jobs: {
    /** List the jobs */
    readonly list: ((input?: JobsListInput) => Promise<JobsListOutput>) & {
      /** Count the jobs */
      readonly count: (input?: JobsListCountInput) => Promise<JobsListCountOutput>;
    };
  };
  readonly math: {
    /** Add two numbers */
    readonly add: (input: MathAddInput) => Promise<MathAddOutput>;
  };
  readonly misc: {
    readonly any: (input?: MiscAnyInput) => Promise<MiscAnyOutput>;
  };
}

/** This function gives a function with the members of a namespace (a path that is a procedure and a namespace). */
function withMembers<F extends object, M extends object>(fn: F, members: M): F & M {
  for (const [key, value] of Object.entries(members)) Object.defineProperty(fn, key, { value, enumerable: true });
  return fn as F & M;
}

/** This function gives the SDK: each method calls `client.call(path, input)`. */
export function createSdk(client: SdkClient): Sdk {
  const call = <T>(path: string[], input: unknown): Promise<T> => client.call(path, input) as Promise<T>;
  return {
    config: {
      get: (input: ConfigGetInput): Promise<ConfigGetOutput> => call(["config", "get"], input),
    },
    files: {
      read: (input: FilesReadInput): Promise<FilesReadOutput> => call(["files", "read"], input),
      write: (input: FilesWriteInput): Promise<FilesWriteOutput> => call(["files", "write"], input),
    },
    jobs: {
      list: withMembers((input?: JobsListInput): Promise<JobsListOutput> => call(["jobs", "list"], input ?? {}), {
        count: (input?: JobsListCountInput): Promise<JobsListCountOutput> => call(["jobs", "list", "count"], input ?? {}),
      }),
    },
    math: {
      add: (input: MathAddInput): Promise<MathAddOutput> => call(["math", "add"], input),
    },
    misc: {
      any: (input?: MiscAnyInput): Promise<MiscAnyOutput> => call(["misc", "any"], input),
    },
  };
}
