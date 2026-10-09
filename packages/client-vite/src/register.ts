/**
 * Procedure Registration for Vite dev server management
 */

import { createProcedure, registerProcedures, zodAdapter, outputSchema } from "@mark1russell7/client";
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
} from "./types.js";

const viteDevProcedure = createProcedure()
  .path(["vite", "dev"])
  .input(zodAdapter<ViteDevInput>(ViteDevInputSchema))
  .output(outputSchema<ViteDevOutput>())
  .meta({
    description: "Start Vite dev server",
    args: ["cwd"],
    shorts: { port: "p", host: "h" },
    output: "json",
  })
  .handler(async (input: ViteDevInput): Promise<ViteDevOutput> => viteDev(input))
  .build();

const viteBuildProcedure = createProcedure()
  .path(["vite", "build"])
  .input(zodAdapter<ViteBuildInput>(ViteBuildInputSchema))
  .output(outputSchema<ViteBuildOutput>())
  .meta({
    description: "Build for production",
    args: ["cwd"],
    shorts: { outDir: "o", mode: "m" },
    output: "json",
  })
  .handler(async (input: ViteBuildInput, ctx): Promise<ViteBuildOutput> => viteBuild(input, ctx))
  .build();

const vitePreviewProcedure = createProcedure()
  .path(["vite", "preview"])
  .input(zodAdapter<VitePreviewInput>(VitePreviewInputSchema))
  .output(outputSchema<VitePreviewOutput>())
  .meta({
    description: "Preview production build",
    args: ["cwd"],
    shorts: { port: "p" },
    output: "json",
  })
  .handler(async (input: VitePreviewInput): Promise<VitePreviewOutput> => vitePreview(input))
  .build();

const viteStopProcedure = createProcedure()
  .path(["vite", "stop"])
  .input(zodAdapter<ViteStopInput>(ViteStopInputSchema))
  .output(outputSchema<ViteStopOutput>())
  .meta({
    description: "Stop a running Vite server",
    args: ["serverId"],
    shorts: {},
    output: "json",
  })
  .handler(async (input: ViteStopInput): Promise<ViteStopOutput> => viteStop(input))
  .build();

export function registerViteProcedures(): void {
  registerProcedures([
    viteDevProcedure,
    viteBuildProcedure,
    vitePreviewProcedure,
    viteStopProcedure,
  ]);
}

// Auto-register
registerViteProcedures();
