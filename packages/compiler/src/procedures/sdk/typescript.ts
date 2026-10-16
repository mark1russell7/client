/**
 * sdk.typescript procedure
 *
 * This procedure writes a typed TypeScript SDK for the procedures of the registry. It reads the
 * registry of the caller and obeys the expose rule of the host, as `procedure.manifest` does.
 */

import type { ProcedureContext } from "@procedures/client/browser";
import { toTypeScriptSdk } from "../../typescript-sdk.js";
import type { SdkTypescriptInput, SdkTypescriptOutput } from "../../types.js";
import { manifestOf } from "./manifest.js";

/** This function gives the source of the SDK of the procedures that the host exposes. */
export async function sdkTypescript(input: SdkTypescriptInput, ctx?: ProcedureContext): Promise<SdkTypescriptOutput> {
  const manifest = manifestOf(input, ctx);
  return { code: toTypeScriptSdk(manifest), procedures: manifest.procedures.length, registryHash: manifest.hash };
}
