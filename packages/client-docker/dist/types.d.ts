/**
 * Type definitions for client-docker procedures
 *
 * client-docker wraps Docker CLI commands as procedures using client-shell.
 */
import { z } from "zod";
export interface DockerCommandOutput {
    /** Exit code of the command */
    exitCode: number;
    /** Standard output */
    stdout: string;
    /** Standard error */
    stderr: string;
    /** Whether command succeeded (exit code 0) */
    success: boolean;
    /** Duration in milliseconds */
    duration: number;
}
export declare const DockerRunInputSchema: z.ZodObject<{
    image: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    ports: z.ZodOptional<z.ZodArray<z.ZodString>>;
    volumes: z.ZodOptional<z.ZodArray<z.ZodString>>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    detach: z.ZodOptional<z.ZodBoolean>;
    rm: z.ZodOptional<z.ZodBoolean>;
    command: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerRunInput = z.infer<typeof DockerRunInputSchema>;
export declare const DockerBuildInputSchema: z.ZodObject<{
    context: z.ZodString;
    tag: z.ZodString;
    dockerfile: z.ZodOptional<z.ZodString>;
    buildArgs: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    noCache: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerBuildInput = z.infer<typeof DockerBuildInputSchema>;
export declare const DockerPullInputSchema: z.ZodObject<{
    image: z.ZodString;
    tag: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerPullInput = z.infer<typeof DockerPullInputSchema>;
export declare const DockerExecInputSchema: z.ZodObject<{
    container: z.ZodString;
    command: z.ZodString;
    interactive: z.ZodOptional<z.ZodBoolean>;
    tty: z.ZodOptional<z.ZodBoolean>;
    workdir: z.ZodOptional<z.ZodString>;
    env: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerExecInput = z.infer<typeof DockerExecInputSchema>;
export declare const DockerStopInputSchema: z.ZodObject<{
    containers: z.ZodArray<z.ZodString>;
    time: z.ZodOptional<z.ZodNumber>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerStopInput = z.infer<typeof DockerStopInputSchema>;
export declare const DockerRmInputSchema: z.ZodObject<{
    containers: z.ZodArray<z.ZodString>;
    force: z.ZodOptional<z.ZodBoolean>;
    volumes: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerRmInput = z.infer<typeof DockerRmInputSchema>;
export declare const DockerPsInputSchema: z.ZodObject<{
    all: z.ZodOptional<z.ZodBoolean>;
    filter: z.ZodOptional<z.ZodString>;
    format: z.ZodOptional<z.ZodString>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerPsInput = z.infer<typeof DockerPsInputSchema>;
export declare const DockerLogsInputSchema: z.ZodObject<{
    container: z.ZodString;
    follow: z.ZodOptional<z.ZodBoolean>;
    tail: z.ZodOptional<z.ZodNumber>;
    timestamps: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerLogsInput = z.infer<typeof DockerLogsInputSchema>;
export declare const DockerComposeUpInputSchema: z.ZodObject<{
    file: z.ZodOptional<z.ZodString>;
    services: z.ZodOptional<z.ZodArray<z.ZodString>>;
    detach: z.ZodOptional<z.ZodBoolean>;
    build: z.ZodOptional<z.ZodBoolean>;
    forceRecreate: z.ZodOptional<z.ZodBoolean>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerComposeUpInput = z.infer<typeof DockerComposeUpInputSchema>;
export declare const DockerComposeDownInputSchema: z.ZodObject<{
    file: z.ZodOptional<z.ZodString>;
    volumes: z.ZodOptional<z.ZodBoolean>;
    removeOrphans: z.ZodOptional<z.ZodBoolean>;
    rmi: z.ZodOptional<z.ZodEnum<["all", "local"]>>;
    cwd: z.ZodOptional<z.ZodString>;
    timeout: z.ZodOptional<z.ZodNumber>;
}>;
export type DockerComposeDownInput = z.infer<typeof DockerComposeDownInputSchema>;
//# sourceMappingURL=types.d.ts.map