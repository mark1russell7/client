/**
 * sdk.openrpc procedure
 *
 * This procedure describes the procedures of the registry as an OpenRPC 1.3 document. It reads
 * the registry of the caller and obeys the expose rule of the host, as `procedure.manifest` does.
 */

import type { ProcedureContext } from "@procedures/client/browser";
import { toOpenRpc } from "../../openrpc.js";
import type { SdkOpenrpcInput, SdkOpenrpcOutput } from "../../types.js";
import { manifestOf } from "./manifest.js";

/** This function gives the OpenRPC document of the procedures that the host exposes. */
export async function sdkOpenrpc(input: SdkOpenrpcInput, ctx?: ProcedureContext): Promise<SdkOpenrpcOutput> {
  return toOpenRpc(manifestOf(input, ctx)) as unknown as SdkOpenrpcOutput;
}
