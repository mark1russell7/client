/**
 * Procedure: manifest.generate
 * Generates procedure manifests in various formats
 */

import { createProcedure, describeRegistry, type AnyProcedure, type Effects, type Procedure, type ProcedureContext, PROCEDURE_REGISTRY } from "@procedures/client";
import { infoOf } from "../discovery/index.js";
import { wrapSchema } from "../schema.js";
import { ManifestGenerateOutputSchema } from "../output-schemas.js";
import { manifestGenerateInputSchema } from "../input-schemas.js";
import type { ManifestGenerateInput, ManifestGenerateOutput, ProcedureInfo } from "../types.js";
import { generateTypeScript } from "../manifest/typescript.js";
import { generateJson } from "../manifest/json.js";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

// Use pass-through schemas
const manifestGenerateOutputSchema = wrapSchema<ManifestGenerateOutput>(ManifestGenerateOutputSchema);

export const manifestGenerateProcedure: Procedure<
  ManifestGenerateInput,
  ManifestGenerateOutput,
  { description: string; effects: Effects }
> = createProcedure()
  .path(["manifest", "generate"])
  .input(manifestGenerateInputSchema)
  .output(manifestGenerateOutputSchema)
  .meta({
    description: "Generate procedure manifests in various formats",
    // With `outputDir`, it overwrites procedures.json and procedures.d.ts there
    effects: { reads: ["registry"], writes: ["fs"], idempotent: true },
  })
  .handler(async (input: ManifestGenerateInput, ctx?: ProcedureContext) => {
    // The one manifest of the core (roadmap R17): the procedures that the host exposes, with
    // their JSON Schemas, under the namespace when the input gives one
    const namespace = input.namespace ?? [];
    const manifest = describeRegistry(ctx?.registry ?? PROCEDURE_REGISTRY, {
      ...(ctx?.expose ? { expose: ctx.expose } : {}),
      withoutHandler: true,
      include: (proc: AnyProcedure) => namespace.every((segment, index) => proc.path[index] === segment),
    });
    const procedureInfos: ProcedureInfo[] = manifest.procedures.map(infoOf);

    // Determine formats to generate
    const formats = input.formats ?? ["json"];
    const result: ManifestGenerateOutput = {};
    const filesWritten: string[] = [];

    // Generate JSON manifest
    if (formats.includes("json")) {
      const jsonManifest = generateJson(procedureInfos);
      result.json = jsonManifest;

      if (input.outputDir) {
        const filePath = join(input.outputDir, "procedures.json");
        await ensureDir(dirname(filePath));
        await writeFile(filePath, JSON.stringify(jsonManifest, null, 2));
        filesWritten.push(filePath);
      }
    }

    // Generate TypeScript declarations
    if (formats.includes("typescript")) {
      const typescript = generateTypeScript(procedureInfos);
      result.typescript = typescript;

      if (input.outputDir) {
        const filePath = join(input.outputDir, "procedures.d.ts");
        await ensureDir(dirname(filePath));
        await writeFile(filePath, typescript);
        filesWritten.push(filePath);
      }
    }

    if (filesWritten.length > 0) {
      result.filesWritten = filesWritten;
    }

    return result;
  })
  .build();

/**
 * Ensure directory exists
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
}

export type { ManifestGenerateInput, ManifestGenerateOutput };
