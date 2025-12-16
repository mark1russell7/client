/**
 * Procedure: manifest.generate
 * Generates procedure manifests in various formats
 */

import { createProcedure, type Procedure, PROCEDURE_REGISTRY } from "@mark1russell7/client";
import { schema } from "../schema.js";
import type { ManifestGenerateInput, ManifestGenerateOutput, ProcedureInfo } from "../types.js";
import { generateTypeScript } from "../manifest/typescript.js";
import { generateJson } from "../manifest/json.js";
import { writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";

// Use pass-through schemas
const manifestGenerateInputSchema = schema<ManifestGenerateInput>();
const manifestGenerateOutputSchema = schema<ManifestGenerateOutput>();

export const manifestGenerateProcedure: Procedure<
  ManifestGenerateInput,
  ManifestGenerateOutput,
  { description: string }
> = createProcedure()
  .path(["manifest", "generate"])
  .input(manifestGenerateInputSchema)
  .output(manifestGenerateOutputSchema)
  .meta({ description: "Generate procedure manifests in various formats" })
  .handler(async (input: ManifestGenerateInput) => {
    // Get all registered procedures
    const allProcedures = PROCEDURE_REGISTRY.getAll();

    // Filter by namespace if specified
    let procedures = allProcedures;
    if (input.namespace && input.namespace.length > 0) {
      procedures = allProcedures.filter((proc) => {
        // Check if procedure path starts with namespace
        for (let i = 0; i < input.namespace!.length; i++) {
          if (proc.path[i] !== input.namespace![i]) {
            return false;
          }
        }
        return true;
      });
    }

    // Convert to ProcedureInfo format
    const procedureInfos: ProcedureInfo[] = procedures.map((proc) => {
      const meta = proc.metadata as { description?: string; internal?: boolean } | undefined;
      const info: ProcedureInfo = {
        path: proc.path,
      };
      if (meta?.description !== undefined) {
        info.description = meta.description;
      }
      // TODO: Add JSON schema generation from Zod schemas
      return info;
    });

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
