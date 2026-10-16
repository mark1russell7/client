/**
 * program.diagram procedure
 *
 * This procedure draws a program as a Mermaid flowchart: the order of the calls, the control
 * flow and the names. No call of the program starts.
 */

import { PROCEDURE_REGISTRY, type ProcedureContext } from "@procedures/client/browser";
import { diagramProgram } from "../../mermaid.js";
import type { ProgramDiagramInput, ProgramDiagramOutput } from "../../types.js";

/**
 * This function checks a program against the registry and the expose rule of the host. It gives
 * the flowchart of the IR and the diagnostics of the check.
 */
export async function programDiagram(input: ProgramDiagramInput, ctx?: ProcedureContext): Promise<ProgramDiagramOutput> {
  const result = diagramProgram(input.program, {
    registry: ctx?.registry ?? PROCEDURE_REGISTRY,
    expose: ctx?.expose,
    capability: ctx?.capability,
    mode: input.mode,
    direction: input.direction,
  });
  return { mermaid: result.mermaid, diagnostics: result.diagnostics };
}
