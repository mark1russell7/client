/**
 * One job of the suite `tenant`: the rates of the rungs of the ladder.
 */

import { TENANT_CASES } from "./tenant-cases.js";
import { runTenantJob } from "./tenant-job.js";

await runTenantJob(TENANT_CASES);
