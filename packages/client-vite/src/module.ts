/**
 * Module (no side effects): the procedures of this package as data, for `createRegistry()`.
 *
 * Procedure Registration for Vite dev server management
 */

import { definePackage, createProcedure, type ProcedureModule, type PackageDefinition } from "@procedures/client";
import { viteDev } from "./procedures/vite/dev.js";
import { viteBuild } from "./procedures/vite/build.js";
import { vitePreview } from "./procedures/vite/preview.js";
import { viteStop } from "./procedures/vite/stop.js";
import {
  ViteDevInputSchema,
  ViteBuildInputSchema,
  VitePreviewInputSchema,
  ViteStopInputSchema,
  type ViteDevInput,
  type ViteDevOutput,
  type ViteBuildInput,
  type ViteBuildOutput,
  type VitePreviewInput,
  type VitePreviewOutput,
  type ViteStopInput,
  type ViteStopOutput,
  ViteDevOutputSchema,
  ViteBuildOutputSchema,
  VitePreviewOutputSchema,
  ViteStopOutputSchema,
} from "./types.js";

const viteDevProcedure = createProcedure()
  .path(["vite", "dev"])
  .input(ViteDevInputSchema)
  .output(ViteDevOutputSchema)
  .meta({
    description: "Start Vite dev server",
    // vite runs the config and the plugins of the project, and the server listens on a port
    effects: { reads: ["fs"], writes: ["network", "process", "server"] },
    args: ["cwd"],
    shorts: { port: "p", host: "h" },
    output: "json",
  })
  .handler(async (input: ViteDevInput): Promise<ViteDevOutput> => viteDev(input))
  .build();

const viteBuildProcedure = createProcedure()
  .path(["vite", "build"])
  .input(ViteBuildInputSchema)
  .output(ViteBuildOutputSchema)
  .meta({
    description: "Build for production",
    // vite runs the config and the plugins of the project, and writes the output folder
    effects: { reads: ["fs"], writes: ["fs", "process"] },
    args: ["cwd"],
    shorts: { outDir: "o", mode: "m" },
    output: "json",
  })
  .handler(async (input: ViteBuildInput, ctx): Promise<ViteBuildOutput> => viteBuild(input, ctx))
  .build();

const vitePreviewProcedure = createProcedure()
  .path(["vite", "preview"])
  .input(VitePreviewInputSchema)
  .output(VitePreviewOutputSchema)
  .meta({
    description: "Preview production build",
    effects: { reads: ["fs"], writes: ["network", "process", "server"] },
    args: ["cwd"],
    shorts: { port: "p" },
    output: "json",
  })
  .handler(async (input: VitePreviewInput): Promise<VitePreviewOutput> => vitePreview(input))
  .build();

const viteStopProcedure = createProcedure()
  .path(["vite", "stop"])
  .input(ViteStopInputSchema)
  .output(ViteStopOutputSchema)
  .meta({
    description: "Stop a running Vite server",
    effects: { reads: ["server"], writes: ["server"], idempotent: true },
    args: ["serverId"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ViteStopInput): Promise<ViteStopOutput> => viteStop(input))
  .build();

const vitePackage: PackageDefinition = definePackage("@procedures/vite", [
    viteDevProcedure,
    viteBuildProcedure,
    vitePreviewProcedure,
    viteStopProcedure,
  ]);

/**
 * The module of this package, for `createRegistry()`: its procedures as data. Importing this
 * file registers nothing. (`register.ts` registers the same procedures in the global registry.)
 */
export const viteModule: ProcedureModule = vitePackage.module;

export default viteModule;

/**
 * This function registers the procedures of @procedures/vite, and of the modules that it requires, in
 * a registry. The default is the global registry. Importing this file registers nothing: the
 * `./register` entry starts this function (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */
export const registerViteProcedures: PackageDefinition["register"] = vitePackage.register;
