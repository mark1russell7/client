/**
 * Importing this file registers the procedures of `@procedures/client` in the global registry:
 * `import "@procedures/client/register"`. These are the control flow (`client.chain`, `client.map`
 * and the others) and `procedure.define`/`get`/`list`/`delete`. The other entries of the package
 * register nothing (ARCHITECTURE-PROPOSALS-2026-10, P9).
 */

import { registerClientProcedures } from "./procedures/module.js";

registerClientProcedures();
