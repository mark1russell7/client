/**
 * JSON Manifest Generator
 *
 * Generates JSON manifests from procedure definitions
 * for runtime discovery and visualization.
 */

import type { ProcedureInfo } from "../types.js";

/**
 * JSON manifest structure
 */
export interface ProcedureManifest {
  /** Manifest version */
  version: string;
  /** Generation timestamp */
  generatedAt: string;
  /** All procedures */
  procedures: ProcedureInfo[];
}

/**
 * Generate JSON manifest
 */
export function generateJson(procedures: ProcedureInfo[]): ProcedureManifest {
  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    procedures,
  };
}

/**
 * Generate JSON string (formatted)
 */
export function generateJsonString(procedures: ProcedureInfo[]): string {
  const manifest = generateJson(procedures);
  return JSON.stringify(manifest, null, 2);
}
