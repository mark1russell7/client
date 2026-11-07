/**
 * One job of the suite `tenant-burst-warm` (roadmap CLI-96). It compares a burst of first loads on a pool with its connections and on a pool with none.
 * It also records the time of each command and the time of the latest send, so the report separates the writer from Mongo.
 */

import { BURST_WARM_CASES } from "./tenant-cases.js";
import { writeFormCopies } from "./tenant-form-copies.js";
import { runTenantJob } from "./tenant-job.js";

writeFormCopies();

await runTenantJob(BURST_WARM_CASES, "store", ["forma", "formbbound"]);
