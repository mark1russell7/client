/**
 * Type definitions of the procedures of this package
 *
 * mark procedure new adds the types of each new procedure here.
 */

import { z } from "zod";

// =============================================================================
// The result of an npm command
// =============================================================================

/** The result of an npm command. A failed command does not throw: `success` is false. */
export interface NpmCommandOutput {
  /** The exit code of npm (0 is success) */
  exitCode: number;
  stdout: string;
  stderr: string;
  /** True when the exit code is 0 */
  success: boolean;
  /** The time of the command, in milliseconds */
  duration: number;
}

/** The result of an npm command that writes JSON: `data` is its parsed standard output. */
export interface NpmJsonOutput extends NpmCommandOutput {
  data?: unknown;
}

const commandFields = {
  exitCode: z.number().describe("The exit code of npm (0 is success)"),
  stdout: z.string().describe("The standard output of npm"),
  stderr: z.string().describe("The standard error of npm, or the error message when npm did not start"),
  success: z.boolean().describe("True when the exit code is 0"),
  duration: z.number().describe("The time of the command, in milliseconds"),
};

export const NpmCommandOutputSchema: z.ZodType<NpmCommandOutput> = z.looseObject(commandFields);

export const NpmJsonOutputSchema: z.ZodType<NpmJsonOutput> = z.looseObject({
  ...commandFields,
  data: z.unknown().optional().describe("The parsed JSON of the standard output, when it is JSON"),
});

// The fields that several inputs share
const PACKAGE = z.string().describe("The package, for example zod, @scope/name or zod@4");
const REGISTRY = z.string().optional().describe("The URL of the registry (default: the registry of the npm configuration)");
const OTP = z.string().optional().describe("A one-time password, when the account has two-factor authentication");
const CONFIRM = z.literal(true).describe("Must be true: the call changes the registry for each user of the package");
const CWD = z.string().optional().describe("Working directory");
const TIMEOUT = z.number().optional().describe("Timeout in milliseconds");

// =============================================================================
// npm.view Types - Read the fields of a package of the npm registry
// =============================================================================

export const NpmViewInputSchema: z.ZodObject<{
  package: z.ZodString;
  fields: z.ZodOptional<z.ZodArray<z.ZodString>>;
  registry: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  package: PACKAGE,
  fields: z.array(z.string()).optional().describe("The fields, for example version, dist-tags or versions (default: all)"),
  registry: REGISTRY,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type NpmViewInput = z.infer<typeof NpmViewInputSchema>;

/** The result of npm.view: `data` is the JSON of `npm view --json`. */
export type NpmViewOutput = NpmJsonOutput;

export const NpmViewOutputSchema: z.ZodType<NpmViewOutput> = NpmJsonOutputSchema;

// =============================================================================
// npm.distTags.* Types - The dist-tags of a package
// =============================================================================

export const NpmDistTagsListInputSchema: z.ZodObject<{
  package: z.ZodString;
  registry: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  package: PACKAGE,
  registry: REGISTRY,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type NpmDistTagsListInput = z.infer<typeof NpmDistTagsListInputSchema>;

export interface NpmDistTagsListOutput extends NpmCommandOutput {
  /** Each dist-tag and its version, for example { latest: "1.2.0", next: "2.0.0-beta.1" } */
  tags?: Record<string, string> | undefined;
}

export const NpmDistTagsListOutputSchema: z.ZodType<NpmDistTagsListOutput> = z.looseObject({
  ...commandFields,
  tags: z.record(z.string(), z.string()).optional().describe("Each dist-tag and its version"),
});

export const NpmDistTagsAddInputSchema: z.ZodObject<{
  package: z.ZodString;
  version: z.ZodString;
  tag: z.ZodString;
  confirm: z.ZodLiteral<true>;
  otp: z.ZodOptional<z.ZodString>;
  registry: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  package: z.string().describe("The package, for example zod or @scope/name"),
  version: z.string().describe("The version that gets the tag, for example 1.2.0"),
  tag: z.string().describe("The dist-tag, for example latest or next. It moves from its earlier version"),
  confirm: CONFIRM,
  otp: OTP,
  registry: REGISTRY,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type NpmDistTagsAddInput = z.infer<typeof NpmDistTagsAddInputSchema>;

export type NpmDistTagsAddOutput = NpmCommandOutput;

export const NpmDistTagsAddOutputSchema: z.ZodType<NpmDistTagsAddOutput> = NpmCommandOutputSchema;

export const NpmDistTagsRemoveInputSchema: z.ZodObject<{
  package: z.ZodString;
  tag: z.ZodString;
  confirm: z.ZodLiteral<true>;
  otp: z.ZodOptional<z.ZodString>;
  registry: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  package: z.string().describe("The package, for example zod or @scope/name"),
  tag: z.string().describe("The dist-tag, for example next. npm refuses to remove latest"),
  confirm: CONFIRM,
  otp: OTP,
  registry: REGISTRY,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type NpmDistTagsRemoveInput = z.infer<typeof NpmDistTagsRemoveInputSchema>;

export type NpmDistTagsRemoveOutput = NpmCommandOutput;

export const NpmDistTagsRemoveOutputSchema: z.ZodType<NpmDistTagsRemoveOutput> = NpmCommandOutputSchema;

// =============================================================================
// npm.whoami Types - The user name of the npm registry
// =============================================================================

export const NpmWhoamiInputSchema: z.ZodObject<{
  registry: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  registry: REGISTRY,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type NpmWhoamiInput = z.infer<typeof NpmWhoamiInputSchema>;

export interface NpmWhoamiOutput extends NpmCommandOutput {
  /** The user name, when npm has a login for the registry */
  username?: string | undefined;
}

export const NpmWhoamiOutputSchema: z.ZodType<NpmWhoamiOutput> = z.looseObject({
  ...commandFields,
  username: z.string().optional().describe("The user name, when npm has a login for the registry"),
});

// =============================================================================
// npm.pack Types - A tarball of the package, or a dry run
// =============================================================================

export const NpmPackInputSchema: z.ZodObject<{
  dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  destination: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  dryRun: z.boolean().optional().default(true).describe("Only list the files of the tarball, and write no tarball (default: true)"),
  destination: z.string().optional().describe("The folder of the tarball (default: the folder of the package)"),
  cwd: z.string().optional().describe("The folder of the package"),
  timeout: TIMEOUT,
});

export type NpmPackInput = z.infer<typeof NpmPackInputSchema>;

/** The result of npm.pack: `data` is the JSON of `npm pack --json`, one entry for the package. */
export type NpmPackOutput = NpmJsonOutput;

export const NpmPackOutputSchema: z.ZodType<NpmPackOutput> = NpmJsonOutputSchema;

// =============================================================================
// npm.deprecate Types - Deprecate versions of a package in the npm registry
// =============================================================================

export const NpmDeprecateInputSchema: z.ZodObject<{
  package: z.ZodString;
  message: z.ZodString;
  confirm: z.ZodLiteral<true>;
  otp: z.ZodOptional<z.ZodString>;
  registry: z.ZodOptional<z.ZodString>;
  cwd: z.ZodOptional<z.ZodString>;
  timeout: z.ZodOptional<z.ZodNumber>;
}> = z.object({
  package: z.string().describe("The package and the versions, for example my-package@<2.0.0. Without a range: all versions"),
  message: z.string().describe("The message that npm shows at each install of the versions. An empty message removes the deprecation"),
  confirm: CONFIRM,
  otp: OTP,
  registry: REGISTRY,
  cwd: CWD,
  timeout: TIMEOUT,
});

export type NpmDeprecateInput = z.infer<typeof NpmDeprecateInputSchema>;

export type NpmDeprecateOutput = NpmCommandOutput;

export const NpmDeprecateOutputSchema: z.ZodType<NpmDeprecateOutput> = NpmCommandOutputSchema;
