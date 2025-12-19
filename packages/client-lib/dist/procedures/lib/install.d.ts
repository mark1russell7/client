/**
 * lib.install procedure
 *
 * Installs the entire ecosystem:
 * 1. Reads ecosystem manifest from @mark1russell7/ecosystem
 * 2. Clones missing packages
 * 3. Installs and builds all packages in DAG order
 */
import type { ProcedureContext } from "@mark1russell7/client";
import type { LibInstallInput, LibInstallOutput } from "../../types.js";
/**
 * Install the entire ecosystem
 */
export declare function libInstall(input: LibInstallInput, ctx: ProcedureContext): Promise<LibInstallOutput>;
//# sourceMappingURL=install.d.ts.map