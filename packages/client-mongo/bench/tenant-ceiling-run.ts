/**
 * One job of the suite `tenant-ceiling`: the rates that tell a limit of the one collection from a limit of the runner.
 */

import { CEILING_CASES } from "./tenant-cases.js";
import { runTenantJob } from "./tenant-job.js";

await runTenantJob(CEILING_CASES);
