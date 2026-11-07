/**
 * One job of the suite `tenant-first`: first loads of new tenants beside the steady load.
 */

import { FIRST_LOAD_CASES } from "./tenant-cases.js";
import { runTenantJob } from "./tenant-job.js";

await runTenantJob(FIRST_LOAD_CASES);
