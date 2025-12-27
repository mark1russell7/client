/**
 * Procedure Registration for Vite dev server management
 */

import { createProcedure, registerProcedures } from "@mark1russell7/client";
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

interface ZodLikeSchema<T> {
  parse(data: unknown): T;
  safeParse(data: unknown):
    | { success: true; data: T }
    | { success: false; error: { message: string; errors: Array<{ path: (string | number)[]; message: string }> } };
  _output: T;
}

function zodAdapter<T>(schema: { parse: (data: unknown) => T }): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => schema.parse(data),
    safeParse: (data: unknown) => {
      try {
        return { success: true as const, data: schema.parse(data) };
      } catch (error) {
        const err = error as { message?: string; errors?: unknown[] };
        return {
          success: false as const,
          error: {
            message: err.message ?? "Validation failed",
            errors: Array.isArray(err.errors)
              ? err.errors.map((e: unknown) => {
                  const errObj = e as { path?: unknown[]; message?: string };
                  return {
                    path: (errObj.path ?? []) as (string | number)[],
                    message: errObj.message ?? "Unknown error",
                  };
                })
              : [],
          },
        };
      }
    },
    _output: undefined as unknown as T,
  };
}

function outputSchema<T>(): ZodLikeSchema<T> {
  return {
    parse: (data: unknown) => data as T,
    safeParse: (data: unknown) => ({ success: true as const, data: data as T }),
    _output: undefined as unknown as T,
  };
}

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
  .handler(async (input: ViteBuildInput): Promise<ViteBuildOutput> => viteBuild(input))
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
